# CHANGELOG · AgentLab 的生长记录

## 2026-11-09 · UI 精修 v5（非 Day 更新）

按 Mike 点选的「完整 UI 精修」施工：① 修溢出——轨迹操作按钮改小号并允许换行，不再被面板边缘切掉；示例任务行右缘加渐隐，提示可横滑。② 轨迹紧凑化——卡片内边距/字号收紧，参数与结果代码块限高 132px 内部滚动；「运行成本」不再占一张卡，改挂轨迹标题栏右侧摘要。③ 对话列收成 780px 居中阅读列，气泡不再满屏漂。④ 顶栏加模型状态点：演示模型（灰）/ BYOK 未填项（橙，写明缺什么）/ BYOK 已就绪（绿，显示模型名）。⑤ 底部状态行单行省略，防长报错撑高；粒子再降一档（密度 24000→32000、上限 90→72、连线与点透明度下调）。

## Day 12 — 2026-11-09

对话导出：把整段对话与轨迹一并导出为 Markdown 文件。

- 导出模块（`src/agent/conversationExport.ts`）：纯函数 `formatConversationMarkdown`——把会话里全部可见气泡（用户 / 助手，按显示顺序）与最近一次运行的完整轨迹渲染成一份 Markdown：标题 + 导出时间、「## 对话」逐条标注角色、「## 运行轨迹（最近一次运行）」逐条编号，工具参数用 JSON 代码块、工具结果用代码块呈现，失败结果显式标注，运行成本复用 `formatRunStats` 一行格式；导出时间可注入以便测试；对话或轨迹为空时渲染明确的占位行，不留空白小节
- 控制台（`src/main.ts` + `index.html`）：新增会话级 `chatLog`——所有经 `addBubble` 显示的气泡按序记录，流式气泡（不走 `addBubble`）在运行结束时以最终文本补记；轨迹面板新增「导出对话 Markdown」按钮，下载 `agentlab-conversation.md`，状态栏报消息数与轨迹事件数；无内容时只提示先运行任务
- ROADMAP 清单只剩 2 件未完成，按规则补 5 件新的小条目（Day 14–18：会话恢复 / 示例模板库 / 轨迹筛选 / 成本对比 / 快捷键）
- 单元测试新增 6 个（共 111 个）：标题与导出时间与双小节、气泡顺序与角色标注、轨迹编号与工具参数/结果代码块与成本行、失败结果标注、空对话与空轨迹占位、文本回复与停止事件渲染

## Day 11 — 2026-11-08

工具失败重试：工具调用失败时按策略重试一次，并在轨迹里标注。

- 重试策略（`src/agent/retry.ts`）：纯函数 `resolveMaxToolRetries` 消毒重试次数配置——未配置默认重试 1 次、显式 0 关闭重试、负数 / 非有限值回落到默认值、小数向下取整，配错既不会误关重试也不会无限循环
- 运行时（`src/agent/agent.ts`）：新增选项 `maxToolRetries`（默认 1）；工具调用失败时按原参数重试，每次重试前先发一条 `toolRetry` 轨迹事件标注是第几次重试与上次的失败结果；只有最终结果（重试后的成功或最后一次失败）才截断并回喂给模型并记为唯一的 `toolResult`——中间失败不进模型历史，同一调用不会出现重复的工具消息
- 类型层（`src/agent/types.ts`）：新增 `toolRetry` 轨迹事件（调用 + 重试序号 + 上次失败结果）；轨迹导出 / 回放白名单（`src/agent/trace.ts`）同步放行，导出的轨迹回放时重试标注不丢
- 控制台（`src/main.ts`）：轨迹面板新增「工具重试」一行，展示工具名、第几次重试与上次失败原因
- 单元测试新增 6 个（共 105 个）：重试次数消毒（默认 / 显式 0 / 小数取整 / 负数与非有限回落）、失败一次后重试成功且轨迹标注、中间失败不回喂（模型只收到一条成功结果）、持续失败时只重试一次并回喂最终错误、成功调用不重试、`maxToolRetries: 0` 关闭重试

## Day 10 — 2026-11-06

运行成本统计：统计每轮的步数耗时与工具调用次数，轨迹面板可见。

- 统计模块（`src/agent/stats.ts`）：纯函数 `computeRunStats` 从轨迹本身推导成本——步数取模型回复的最大步号，工具调用与失败次数数 `toolResult` 事件，耗时由运行时传入并做消毒（负数 / 非有限值归零、小数向下取整，坏时钟不会产出离谱数字）；`formatRunStats` 渲染成一行「步数 · 工具调用 · 失败 · 耗时」
- 类型层（`src/agent/types.ts`）：新增 `RunStats` 与 `runStats` 轨迹事件；轨迹导出 / 回放白名单（`src/agent/trace.ts`）同步放行，导出的轨迹回放时成本行不丢
- 运行时（`src/agent/agent.ts`）：新增可注入时钟选项 `now`（默认 `performance.now`，测试可钉住耗时）；运行结束（final 与熔断 stopped 两条出口）前先算统计、发 `runStats` 事件，`RunResult.stats` 同步返回同一份数字
- 控制台（`src/main.ts`）：轨迹面板新增「运行成本」一行，展示步数、工具调用次数（含失败数）与耗时毫秒
- 单元测试新增 5 个（共 99 个）：轨迹推导步数/调用/失败、空轨迹与坏耗时归零、一行格式化、注入时钟下 Agent 返回统计且 `runStats` 在 final 之前、熔断停止时统计仍在 stopped 之前；既有 3 处轨迹顺序断言同步加入 `runStats`

## Day 9 — 2026-11-05

工具结果截断：超长工具输出自动截断并标注，避免撑爆上下文。

- 截断模块（`src/agent/truncate.ts`）：纯函数 `truncateToolResult`——结果不超过上限（默认 2000 字符）原样通过；超限时只保留前 N 字符并追加一行标注，写明原文总长度与省略的字符数，模型不会把残文误当全文；非正上限自动回落到默认值，配错也不会把结果清空
- 运行时（`src/agent/agent.ts`）：新增选项 `maxToolResultChars`（默认 2000）；每个工具结果在回喂给模型与写入轨迹之前都先过截断，轨迹面板看到的就是模型实际看到的版本，错误结果同样受此上限约束
- 单元测试新增 6 个（共 94 个）：短结果与恰达上限原样通过、超限截断并标注总数与省略数、默认上限与坏上限回落、存根模型实测模型收到的是截断标注版而非原文、短结果经运行时原样回喂

## Day 8 — 2026-11-04

流式输出：BYOK 模式下接入 streaming，回答逐字显示。

- 模型层（`src/agent/types.ts`）：`ChatModel.complete` 新增可选的 `onTextDelta` 回调——模型支持流式时逐片报告文本，返回的 `ModelReply` 形状不变，不带回调的模型与调用方完全不受影响
- BYOK 流式（`src/agent/openaiModel.ts`）：带回调时请求加 `stream: true`，按 SSE 逐行解析响应体（行缓冲，网络分片切断一行也能拼回）；纯函数 `parseStreamLine` 提取文本片段与工具调用片段，`[DONE]` / 角色开场块 / 坏 JSON 一律忽略；`consumeStream` 把文本片段即时喂给回调、工具调用参数按 index 分片拼装，最终仍返回原有的 text / toolCall / toolCalls 三种回复；无回调时走原一次性请求（`stream: false`），429/503 重试与错误原文透出不变
- 运行时（`src/agent/agent.ts`）：`AgentOptions.onTextDelta` 透传给模型，运行时本身不感知分片细节
- 控制台（`src/main.ts`）：流式片段先进一个纯文本气泡逐字增长，运行结束后换成最终回答的 Markdown 渲染；出错时移除残缺气泡再报错误；MockModel 不发片段，演示模式行为不变
- 单元测试新增 5 个（共 88 个）：SSE 行解析（文本 / 工具片段 / 噪声忽略）、跨网络分片的逐字回调与拼合回复、流式工具调用参数按 index 拼装、无回调时不带 stream 标记、Agent 把模型片段透传给运行回调

## Day 7 — 2026-11-03

评测台：内置任务集一键跑批，统计工具调用正确率与步数。

- 评测模块（`src/agent/eval.ts`）：`BUILTIN_EVAL_TASKS` 内置 5 个任务（计算 / 时钟 / 知识检索 / 组合多工具 / 无需工具直答），每个任务标注期望的工具调用序列；`extractCalledTools` 从轨迹按序取实际调用，`evaluateRun` 要求名称与顺序完全一致才算正确，`summarizeEval` 汇总正确率、总步数、平均步数与工具调用总次数，`formatEvalReport` 生成逐任务 ✓/✗ 的跑批报告
- 跑批入口（`runEvalSuite`）：运行函数可注入——控制台注入真实 Agent + MockModel（零 API 成本），测试可注入存根；任务按序逐个跑完再汇总
- 控制台（`src/main.ts`）：新增示例「评测台：跑一遍内置任务集」——点击即跑完整套内置任务，最终气泡是跑批报告，状态栏报工具调用正确率与平均步数；普通任务仍走原单 Agent 循环
- ROADMAP 清单只剩 2 件未完成，按规则补 5 件新的小条目（Day 9–13：工具结果截断 / 运行成本统计 / 工具失败重试 / 对话导出 / 工具权限开关）
- 单元测试新增 5 个（共 83 个）：调用提取与精确匹配评分、错序/缺失/多余调用判错、汇总数学、注入存根的跑批与报告格式、用真实 MockModel 跑内置任务集全对（正确率 100%、平均 2 步、共 5 次工具调用）

## 2026-11-03 · 助手消息渲染 Markdown（非 Day 更新）

真模型习惯用 Markdown 回答（标题/表格/代码块），此前气泡是纯文本直出，表格会被挤成一面墙。新增零依赖手写渲染器 `src/markdown.ts`（先转义再渲染，链接只允许 http(s)，防注入）：支持标题、粗斜体、行内代码、代码块、列表、引用、表格、分割线；仅助手气泡启用，用户消息保持原文。补 9 个单元测试。

## 2026-11-03 · BYOK 自动重试（非 Day 更新）

免费层级接口在高峰期常回 429/503（临时过载）：BYOK 请求遇到这两种状态码时自动退避重试（最多 3 次，延迟递增），不再一撞上就报错；持续过载才把服务商原文报错透出。补 2 个单元测试。

## 2026-11-03 · 错误信息透出服务商原文（非 Day 更新）

BYOK 报错不再只有光秃秃的 HTTP 状态码：模型接口返回非 200 时，把服务商响应体（截断 300 字）一并带进错误信息——是地址错、模型名错还是 Key 错，服务商自己会说清楚。补 1 个单元测试。

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
