# CHANGELOG · AgentLab 的生长记录

## Day 6 — 2026-11-02

多 Agent 协作：researcher 负责检索、writer 负责成文，主 Agent 调度。

- 协作模块（`src/agent/multiAgent.ts`）：主 Agent 调度——`delegateTasks` 把一个主题拆成两件子任务（researcher 先检索、writer 后成文，空主题不分派）；`composeDraft` 是 writer，只用 researcher 给的资料成文、没资料时直说找不到、不编造；`runMultiAgent` 按序跑 researcher → writer，检索函数可注入以便测试
- 轨迹（`src/agent/types.ts` + `src/agent/trace.ts`）：新增 `subAgentStarted`（角色 + 指令）与 `subAgentDone`（角色 + 小结）事件，导出 / 回放的事件白名单同步放行这两种新事件
- 控制台（`src/main.ts`）：新增示例「多 Agent 协作：什么是 RAG」——以该前缀开头的任务走协作模式：轨迹面板逐条展示两个子 Agent 的开始与完成，最终气泡是 writer 的短文，状态栏报 researcher 找到的资料条数；普通任务仍走原单 Agent 循环
- 单元测试新增 4 个（共 66 个）：分派顺序与空主题、writer 只凭资料成文与无资料时的直说、注入检索下 researcher→writer 的事件顺序与资料传递、用真实知识库检索 RAG 并拒绝空主题

## Day 5 — 2026-11-01

轨迹导出 / 回放：把一次运行的轨迹存为 JSON，可导入重播。

- 轨迹模块（`src/agent/trace.ts`）：纯函数——`serializeTrace`（带 `version: 1` 与 `exportedAt` 的导出格式）、`parseTrace`（校验 JSON / 版本 / events 数组 / 事件类型，未知类型直接拒绝）、`createReplay`（逐步步进器：current / next / reset / done）与 `replayTrace`（按序全量回放）
- 控制台（`src/main.ts` + `index.html`）：轨迹面板新增「导出轨迹 JSON」与「导入并回放」——导出把最近一次运行的轨迹下载为 `agentlab-trace.json`，导入校验后清空面板并逐条重播，不重新调用模型或工具；导入失败只在状态栏提示原因
- 单元测试新增 4 个（共 62 个）：序列化往返、无效 JSON / 错版本 / 未知事件的拒绝、步进器的顺序与重置、全量回放顺序

## 2026-11-01 · 环境粒子背景（非 Day 更新）

按 Mike 的要求加「一直在动」的背景粒子，但保持高级感的克制：全屏 Canvas 上只有低透明度的中性色微粒缓慢漂移，近邻之间连一条几乎看不见的细线；无彩色、无光晕。粒子在面板后方（对话区透出），标签页切走时自动暂停，系统开启「减少动态效果」时只画一帧静态图。新增 `src/particles.ts`（含可测的粒子生成/步进纯函数）与 3 个单元测试。

## Day 4 — 2026-10-31

RAG 工具升级：文档切分 + TF-IDF 检索替换关键词匹配，知识库可导入自定义文本。

- RAG 模块（`src/agent/rag.ts`）：纯函数——`tokenize`（英文词整体保留含尾随 `+`、中文按单字 + bigram 切分）、`chunkText`（按段落 → 句子打包切分，超长句带 overlap 硬切）、`createTfIdfIndex`（逐片段建 TF-IDF 向量 + 平滑 IDF，查询走余弦相似度，低于阈值视为无证据）
- 检索层（`src/agent/builtinTools.ts`）：kb_search 改为片段级 TF-IDF 检索（`searchKnowledgeChunks` 返回带分数的片段），删除旧的关键词 + bigram 打分；`searchKnowledgeBase` 保留条目级接口，由片段命中去重映射回条目
- 自定义导入：新增 `kb_import` 工具与 `importKnowledgeDocument` / `clearCustomKnowledge` / `listCustomKnowledge` API——导入的文本与内置 6 篇笔记进同一索引、同样切分检索；空标题 / 空正文会被拒绝
- 单元测试新增 13 个（共 55 个）：切分（段落 / 句子打包 / 带重叠硬切）、TF-IDF 的 TF 排序与 IDF 稀有词命中、无重叠查询为空、导入文档的后段片段可检索、经注册表 kb_import → kb_search 全链路

## Day 3 — 2026-10-30

Planner-Executor：先让模型产出计划清单，再逐步执行并勾销。

- 计划模块（`src/agent/planner.ts`）：纯函数清单——`createPlan`（去空白步、全部待办）、`completeStep`（不可变地勾销一步）、`nextPending` / `isPlanComplete`、`formatPlan`（`[ ]` / `[x]` 渲染）
- 类型层（`src/agent/types.ts`）：`ModelReply` 新增 `plan` 变体；助手消息可带 `plan` 步标题；轨迹新增 `planCreated`（计划全文）与 `planStepDone`（勾销的步号与标题）事件
- 运行时（`src/agent/agent.ts`）：收到 plan 回复先记录计划并继续循环；之后每个工具调用执行完毕才勾销下一个待办步（先做完、后勾销，不预勾）；`RunResult.plan` 返回最终清单，未做完的步保持 pending；系统提示同步说明可先给计划
- MockModel：一句话含多件事时先回计划清单（每步对应一个待执行的工具调用），下一轮再按原多工具逻辑一并执行；单件事不列计划，原有行为不变
- 控制台轨迹面板：模型计划与 `planCreated` 展示清单，`planStepDone` 展示「第 N 步已完成」
- 单元测试新增 5 个（共 42 个）：计划清单的创建/纯函数勾销/格式化、存根模型的计划→执行→逐个勾销轨迹顺序、MockModel 组合问法的计划全勾销

## 2026-10-30 · 仓库维护（工作流自检）

完成一次仓库工作流自检：新建并关闭 issue #1 验证 issue 流程，并用 PR 合并本文档小记。功能不变。

## 2026-10-30 · UI 视觉改版（非 Day 更新）

控制台三版视觉：v2 深空毛玻璃 + 渐变光晕；v3 按 Mike「高级感」要求改近黑中性色 + 发丝线 + 素白气泡（Linear / Vercel 式克制）；v4 再按「布局不够高级、也不合理」重做结构——应用壳布局：模型选择收进顶栏、BYOK 改为按需展开的细条、对话列（示例工具条 + 独立滚动的消息区 + 钉底输入区）与右侧整高轨迹检查器，页面本身不再滚动。功能不变（仅 HTML 结构 + CSS）。同日修复 BYOK 在浏览器里必然失败的 bug：全局 fetch 未绑定就存进模型、调用时 this 指向模型实例，浏览器抛 Illegal invocation（Node 不挑 this，单测一直没测出来）——改为 fetch.bind(globalThis)，并补了接收者严格的回归测试，又用真实浏览器 + 假 API 服务端到端验了工具调用往返。

## Day 2 — 2026-10-29

记忆压缩：对话变长时自动摘要早期消息，给上下文窗口瘦身。

- 记忆模块（`src/agent/memory.ts`）：确定性提取式摘要（无额外模型调用）——每条被折叠消息贡献一条「角色: 片段」，工具调用/结果显式点名，摘要长度有上限；`compressHistory` 纯函数负责切分
- 运行时（`src/agent/agent.ts`）：新增选项 `maxHistoryMessages`（默认 24）/ `keepRecentMessages`（默认 10）/ `summarize`（可自定义折叠函数）；每步调用模型前检查，非系统消息超限就把早期消息折成一条 `【记忆摘要】` 系统消息，最近消息逐字保留
- 切分安全：保留尾巴的开头若是孤儿工具结果（其调用已被折叠），会把该结果一并折进摘要，避免给模型留下无主的结果
- 轨迹与控制台：新增 `memoryCompressed` 轨迹事件（折叠条数 / 保留条数 / 摘要全文），控制台轨迹面板同步展示「记忆压缩」一步
- 单元测试新增 7 个（共 36 个）：摘要生成与截断、超限切分、孤儿工具结果保护、跨轮运行时压缩与不压缩短对话

## Day 1 — 2026-10-28

一轮多工具：模型在同一轮里可以一次发出多个工具调用。

- 类型层（`src/agent/types.ts`）：`ModelReply` 新增 `toolCalls` 变体；助手消息可用 `toolCalls` 携带整批调用（`toolCall` 保留兼容，镜像第一个）
- 运行时（`src/agent/agent.ts`）：一轮的多个调用记为一条助手消息，按顺序逐个执行、逐个产生 `toolResult` 轨迹事件，全部结果回喂后模型才再次发言；系统提示同步改为允许多调用
- MockModel：能识别一句话里的多件事——例如「计算 3 + 4，现在几点了？」会在同一轮同时发出 calculator + clock，并把两份结果拼成最终回答
- BYOK（`src/agent/openaiModel.ts`）：OpenAI 响应的多个 `tool_calls` 映射为 `toolCalls` 回复（单个仍用原 `toolCall` 形状）；内部消息转回 OpenAI 格式时完整还原整批调用
- 控制台轨迹面板：一轮多工具时逐个列出每个工具名与参数；示例新增「计算 3 + 4，现在几点了？」
- 单元测试新增 3 个（共 29 个）：运行时顺序执行多调用并按 call id 回喂、MockModel 组合问法一轮双工具、BYOK 多 `tool_calls` 映射

## Day 0 — 2026-10-28

AgentLab 出生。今天落成的地基：

- 工程脚手架：TypeScript（strict）+ Vite + Vitest，零运行时依赖；GitHub Actions 跑测试并自动部署 GitHub Pages
- Agent 运行时（`src/agent/agent.ts`）：ReAct 式循环——模型每轮或给最终回答、或请求一次工具调用；工具结果回喂；maxSteps 熔断；全程记录结构化轨迹事件（user / modelReply / toolResult / final / stopped）
- 工具系统（`src/agent/tools.ts`）：注册表 + 执行前参数校验（必填与类型），工具异常转为错误结果回喂，不让运行时崩掉
- 内置工具（`src/agent/builtinTools.ts`）：
  - calculator：手写词法 + 递归下降的表达式求值器（不用 eval），支持括号与一元负号
  - clock：当前时间
  - kb_search：内置 6 篇 AI/CS 短文（RAG、Agent/ReAct、工具调用、Embedding、B+ 树、提示词工程），bigram + 关键词打分检索
- 模型层（`ChatModel` 接口）：
  - MockModel：确定性规则模型——识别算式/时间/知识问题并分别派给三个工具，能零成本演示与测试
  - OpenAiCompatibleModel：BYOK，OpenAI 兼容 chat/completions + function calling，含内部消息 ↔ OpenAI 格式的双向映射
- 轨迹控制台：任务输入与示例、对话气泡、右侧轨迹面板逐步展示模型决策与工具参数/结果；BYOK 设置只存浏览器 localStorage
- 单元测试：求值器、工具校验、知识检索、Agent 循环（含死循环熔断与多轮历史）、BYOK 协议映射
