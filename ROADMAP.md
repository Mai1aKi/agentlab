# ROADMAP · AgentLab 接下来要长出的东西

规则：每天只取最上面一件未完成的事，做完打勾，并在 CHANGELOG 记一笔。
清单只剩不到 3 件时，再补 5 件新的——永远小步，永远不贪多。

- [x] Day 0 · 立地基：TypeScript + Vite 工程；手写 Agent 运行时（ReAct 循环、maxSteps 熔断、结构化轨迹事件）；工具注册表（参数校验、错误回喂）；内置工具 calculator（手写表达式求值器）/ clock / kb_search；模型层可插拔（MockModel 演示模型 + OpenAI 兼容 BYOK）；轨迹可视化控制台；Vitest 单元测试；CI + GitHub Pages 自动部署
- [x] Day 1 · 一轮多工具：模型一轮可发出多个工具调用，运行时顺序执行并逐个回喂
- [ ] Day 2 · 记忆：对话变长时自动摘要压缩早期消息（上下文窗口管理）
- [ ] Day 3 · Planner-Executor：先让模型产出计划清单，再逐步执行并勾销
- [ ] Day 4 · RAG 工具升级：文档切分 + TF-IDF 检索替换关键词匹配，知识库可导入自定义文本
- [ ] Day 5 · 轨迹导出 / 回放：把一次运行的轨迹存为 JSON，可导入重播
- [ ] Day 6 · 多 Agent 协作：researcher 负责检索、writer 负责成文，主 Agent 调度
- [ ] Day 7 · 评测台：内置任务集一键跑批，统计工具调用正确率与步数
- [ ] Day 8 · 流式输出：BYOK 模式下接入 streaming，回答逐字显示
