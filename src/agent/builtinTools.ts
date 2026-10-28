// Built-in tools: a safe calculator, a clock, and a tiny knowledge-base
// search over hand-written notes about AI / CS topics.

import { ToolRegistry, type Tool} from './tools';

// ---------- calculator: a real little expression parser (no eval) ----------

type Tok =
| { kind: 'num'; value: number}
| { kind: 'sym'; value: string};

function lexExpression(expr: string): Tok[] {
const toks: Tok[] = [];
let i = 0;
while (i < expr.length) {
const ch = expr[i];
if (ch === ' ' || ch === '\t') { i++; continue;}
if (/[0-9.]/.test(ch)) {
let j = i;
let dots = 0;
while (j < expr.length && /[0-9.]/.test(expr[j])) {
if (expr[j] === '.') dots++;
j++;
}
const text = expr.slice(i, j);
if (dots > 1) throw new Error(`Invalid number "${text}"`);
toks.push({ kind: 'num', value: Number(text)});
i = j;
continue;
}
if ('+-*/%()'.includes(ch)) {
toks.push({ kind: 'sym', value: ch});
i++;
continue;
}
throw new Error(`Unexpected character "${ch}" in expression`);
}
return toks;
}

/** Evaluate + - * / % with parentheses and unary minus. Throws on bad input. */
export function evaluateExpression(expr: string): number {
const toks = lexExpression(expr);
let pos = 0;

function peekSym(): string | null {
const t = toks[pos];
return t && t.kind === 'sym'? t.value: null;
}
function parseExpr(): number {
let value = parseTerm();
while (peekSym() === '+' || peekSym() === '-') {
const op = toks[pos++].value;
const rhs = parseTerm();
value = op === '+'? value + rhs: value - rhs;
}
return value;
}
function parseTerm(): number {
let value = parseFactor();
while (peekSym() === '*' || peekSym() === '/' || peekSym() === '%') {
const op = toks[pos++].value;
const rhs = parseFactor();
if ((op === '/' || op === '%') && rhs === 0) throw new Error('Division by zero');
value = op === '*'? value * rhs: op === '/'? value / rhs: value % rhs;
}
return value;
}
function parseFactor(): number {
const t = toks[pos];
if (!t) throw new Error('Unexpected end of expression');
if (t.kind === 'sym' && t.value === '-') {
pos++;
return -parseFactor();
}
if (t.kind === 'sym' && t.value === '(') {
pos++;
const value = parseExpr();
if (peekSym()!== ')') throw new Error('Missing closing parenthesis');
pos++;
return value;
}
if (t.kind === 'num') {
pos++;
return t.value;
}
throw new Error(`Unexpected token "${t.value}"`);
}

const result = parseExpr();
if (pos!== toks.length) throw new Error('Unexpected trailing input in expression');
return result;
}

export const calculatorTool: Tool = {
spec: {
name: 'calculator',
description: 'Evaluate an arithmetic expression (+ - * / % and parentheses). Use this instead of mental math.',
parameters: { expression: 'string'},
},
run: (args) => {
const value = evaluateExpression(String(args.expression));
// Trim float noise like 0.30000000000000004
return String(Math.round(value * 1e10) / 1e10);
},
};

// ---------- clock ----------

export const clockTool: Tool = {
spec: {
name: 'clock',
description: 'Get the current local date and time.',
parameters: {},
},
run: () => new Date().toLocaleString('zh-CN', { hour12: false}),
};

// ---------- knowledge base search ----------

export interface KbEntry {
title: string;
keywords: string[];
content: string;
}

export const KNOWLEDGE_BASE: KbEntry[] = [
{
title: 'RAG（检索增强生成）',
keywords: ['rag', '检索增强', '知识库问答', '向量检索'],
content:
'RAG = Retrieval-Augmented Generation：先从知识库检索与问题相关的文档片段，再把片段连同问题一起交给大模型生成回答。它能缓解幻觉、让模型用上私有/最新知识。典型流水线：文档切分 → 向量化（embedding）→ 向量索引 → Top-K 检索 → 拼提示词 → 生成。',
},
{
title: 'AI Agent 与 ReAct',
keywords: ['agent', 'react', '智能体', '推理行动'],
content:
'Agent 是能自主多步完成任务的系统：模型在一个循环里交替「思考（Thought）→ 行动（Action，调用工具）→ 观察（Observation）」，这就是 ReAct 模式。Agent 的关键部件：模型、工具集、记忆、规划与停止条件。',
},
{
title: '工具调用（Tool Use / Function Calling）',
keywords: ['工具调用', 'function calling', 'tool use', '函数调用'],
content:
'工具调用让模型能操作外部世界：开发者把工具的名称、说明和参数 schema 给模型，模型在回复中输出结构化的调用请求，运行时执行工具并把结果回喂给模型。它是 Agent 能真正「做事」的基础机制。',
},
{
title: 'Embedding（向量嵌入）',
keywords: ['embedding', '向量', '嵌入', '语义检索'],
content:
'Embedding 把文本映射成高维向量，语义相近的文本向量距离也近。检索时把问题向量化，与文档向量做相似度比较（如余弦相似度）取 Top-K。它是 RAG 和语义搜索的核心。',
},
{
title: 'B+ 树',
keywords: ['b+树', 'bptree', '索引', '数据库索引'],
content:
'B+ 树是数据库最常用的索引结构：多路平衡树、数据只存放在叶子节点、叶子之间有链表。它让等值查询和范围查询都保持 O(log n) 左右的磁盘访问次数，MySQL InnoDB 的主键索引就是 B+ 树。',
},
{
title: '提示词工程（Prompt Engineering）',
keywords: ['提示词', 'prompt', '提示工程'],
content:
'提示词工程是设计输入以稳定地引导模型产出期望结果的方法：明确角色与任务、给示例（few-shot）、要求分步思考（CoT）、约束输出格式。它成本低、上限有限，常与 RAG、工具调用组合使用。',
},
];

/** Bigrams over CJK runs only. Latin text is matched through the keyword
 *  rules instead — shared Latin bigrams ("ch", "he", "ma" in "schema")
 *  otherwise produce confident-looking false hits. */
function bigrams(text: string): string[] {
const grams: string[] = [];
const runs = text.match(/[\u4e00-\u9fff]+/g) ?? [];
for (const run of runs) {
for (let i = 0; i < run.length - 1; i++) grams.push(run.slice(i, i + 2));
}
return grams;
}

export function searchKnowledgeBase(query: string): KbEntry[] {
const q = query.toLowerCase();
const qClean = q.replace(/\s+/g, '');
const qGrams = new Set(bigrams(query));
const scored = KNOWLEDGE_BASE.map((entry) => {
let score = 0;
for (const kw of entry.keywords) {
const kwClean = kw.toLowerCase().replace(/\s+/g, '');
if (qClean.includes(kwClean)) score += 10;
if (kwClean.includes(qClean) && qClean.length >= 2) score += 6;
}
const haystack = new Set(bigrams(entry.title + entry.content));
for (const g of qGrams) if (haystack.has(g)) score += 1;
return { entry, score};
// Bigram overlap alone is weak evidence (stray bigrams like "at" appear
// in unrelated English words), so a minimum total score is required.
}).filter((s) => s.score >= 3);
scored.sort((a, b) => b.score - a.score);
return scored.slice(0, 2).map((s) => s.entry);
}

export const kbSearchTool: Tool = {
spec: {
name: 'kb_search',
description: 'Search the built-in knowledge base about AI / CS topics (RAG, Agent, embedding, B+ tree,...).',
parameters: { query: 'string'},
},
run: (args) => {
const hits = searchKnowledgeBase(String(args.query));
if (hits.length === 0) return '知识库里没有找到相关条目。';
return hits.map((h) => `${h.content}`).join('\n');
},
};

export function createDefaultRegistry(): ToolRegistry {
return new ToolRegistry()
.register(calculatorTool)
.register(clockTool)
.register(kbSearchTool);
}
