# CHANGELOG · AgentLab 的生长记录

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
