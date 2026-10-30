# CHANGELOG · AgentLab 的生长记录

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
