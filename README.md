# AgentLab · 从零手写 AI Agent

A from-scratch AI agent runtime in the browser: a ReAct-style loop, a validated tool registry, pluggable models, and a step-by-step trace visualizer. No agent framework, no LLM SDK — the interesting parts are hand-written in TypeScript.

不套壳、不调框架：这个仓库把 AI Agent 的核心机制一件一件亲手实现出来——模型负责决策，运行时负责执行工具、回喂结果、记录轨迹，直到任务完成或步数耗尽。

## 在线试玩

👉 https://mai1aki.github.io/agentlab/

默认是**内置演示模型**（规则驱动，零成本）：给它算式、问它时间、问它「什么是 RAG」，观察右侧轨迹里它如何决定调用哪个工具。也可以在页面上方切换到 **BYOK**，填入你自己的 OpenAI 兼容 API 地址和 Key，接真模型跑（Key 只存在你浏览器本地）。

## Day 0 已经有什么

- **Agent 运行时**（`src/agent/agent.ts`）：ReAct 循环——模型每轮要么给出最终回答，要么请求一次工具调用；运行时执行工具、把结果回喂，`maxSteps` 兜底防死循环；全程产出结构化轨迹事件
- **工具系统**（`src/agent/tools.ts`）：工具注册表，执行前校验参数（必填/类型），错误以结果形式回喂给模型而不是抛崩
- **内置工具**（`src/agent/builtinTools.ts`）：calculator（手写表达式求值器，无 `eval`）、clock、kb_search（内置 AI/CS 知识库的检索）
- **模型层可插拔**（`src/agent/types.ts` 的 `ChatModel` 接口）：
  - `MockModel`：确定性规则模型，负责演示与全部单元测试
  - `OpenAiCompatibleModel`：BYOK，OpenAI 兼容 `/chat/completions` + function calling
- **轨迹控制台**：左侧对话，右侧逐步展示「模型决策 → 工具参数 → 工具结果」
- **测试**：Vitest 覆盖求值器、工具校验、Agent 循环（含死循环熔断）、BYOK 协议映射

## 架构

```
用户任务
  → Agent.run() 循环
      → ChatModel.complete(messages, toolSpecs)   模型决策
      → ToolRegistry.execute(call)                参数校验 + 执行
      → 工具结果作为 tool 消息回喂
  → 最终回答 + 完整轨迹 (TraceEvent[])
```

## 路线图

见 [ROADMAP.md](ROADMAP.md)：多工具一轮调用、记忆压缩、Planner-Executor、RAG 工具（切分 + TF-IDF）、轨迹导出回放、多 Agent 协作、评测台、流式输出……每天一小步。

## 本地开发

```bash
npm install
npm run dev     # 开发服务器
npm test        # 单元测试（Vitest）
npm run build   # 类型检查 + 构建到 dist/
```

## 许可

MIT
