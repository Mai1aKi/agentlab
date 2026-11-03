// Multi-agent collaboration (Day 6): a tiny coordinator splits one
// topic into two specialised sub-tasks — a researcher who only
// retrieves evidence, and a writer who only turns that evidence into
// prose. The coordinator (the "main agent") decides the split, runs
// the sub-agents in order, and passes the researcher's findings —
// never the raw topic alone — to the writer.
//
// The split and the drafting are pure; retrieval is injectable so the
// orchestration is testable without the real knowledge base.

import { searchKnowledgeChunks} from './builtinTools';
import type { TraceEvent} from './types';

export type SubAgentRole = 'researcher' | 'writer';

export interface SubTask {
role: SubAgentRole;
instruction: string;
}

export interface ResearchFinding {
title: string;
text: string;
}

export interface MultiAgentResult {
topic: string;
tasks: SubTask[];
findings: ResearchFinding[];
draft: string;
}

type SearchFn = (query: string) => { title: string; text: string}[];

/** The coordinator's split: researcher first (retrieve), writer second
* (compose). A blank topic delegates nothing. */
export function delegateTasks(topic: string): SubTask[] {
const clean = topic.trim();
if (clean.length === 0) return [];
return [
{ role: 'researcher', instruction: `检索知识库中与「${clean}」相关的资料`},
{ role: 'writer', instruction: `根据 researcher 的检索结果，写一段关于「${clean}」的短文`},
];
}

/** The writer: compose a short draft from findings only. With no
* findings it says so plainly instead of inventing content. */
export function composeDraft(topic: string, findings: readonly ResearchFinding[]): string {
const clean = topic.trim();
if (findings.length === 0) {
return `关于「${clean}」：知识库里没有找到相关资料，暂时无法成文。`;
}
const body = findings.map((f, i) => `${i + 1}. ${f.text}`).join('\n');
return `关于「${clean}」的短文：\n${body}\n\n小结：以上内容由 researcher 检索、writer 汇总成文。`;
}

/** Run the team: researcher retrieves, writer composes, in that order.
* Emits subAgentStarted / subAgentDone trace events for the console. */
export async function runMultiAgent(
topic: string,
onEvent?: (event: TraceEvent) => void,
search: SearchFn = (query) => searchKnowledgeChunks(query),
): Promise<MultiAgentResult> {
const clean = topic.trim();
const tasks = delegateTasks(clean);
if (tasks.length === 0) throw new Error('任务主题不能为空');

const researchTask = tasks[0];
onEvent?.({ type: 'subAgentStarted', role: researchTask.role, instruction: researchTask.instruction});
const findings: ResearchFinding[] = search(clean).map((h) => ({ title: h.title, text: h.text}));
onEvent?.({ type: 'subAgentDone', role: 'researcher', summary: `找到 ${findings.length} 条资料`});

const writerTask = tasks[1];
onEvent?.({ type: 'subAgentStarted', role: writerTask.role, instruction: writerTask.instruction});
const draft = composeDraft(clean, findings);
onEvent?.({ type: 'subAgentDone', role: 'writer', summary: `已成文 ${draft.length} 字`});

return { topic: clean, tasks, findings, draft};
}
