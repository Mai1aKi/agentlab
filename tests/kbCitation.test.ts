import { afterEach, describe, expect, it} from 'vitest';
import {
formatKbHit,
formatKbHitSource,
formatKbScore,
matchedKbTerms,
MAX_CITED_TERMS,
} from '../src/agent/kbCitation';
import type { RagHit} from '../src/agent/rag';
import {
clearCustomKnowledge,
createDefaultRegistry,
importKnowledgeDocument,
} from '../src/agent/builtinTools';

afterEach(() => clearCustomKnowledge());

const hit: RagHit = {
title: 'RAG（检索增强生成）',
chunkIndex: 0,
text: 'RAG 先从知识库检索相关文档片段，再把片段连同问题交给大模型生成回答。',
score: 0.4231,
};

describe('matchedKbTerms', () => {
it('keeps only query terms present in the hit, deduplicated, in query order', () => {
expect(matchedKbTerms('检索 检索 rag 不存在词', hit)).toEqual(['rag', '检索']);
});

it('prefers longer terms and only falls back to single characters', () => {
expect(matchedKbTerms('检', hit)).toEqual(['检']);
expect(matchedKbTerms('什么是向量检索', hit)).not.toContain('什');
});

it('caps the cited terms and returns nothing for non-string queries', () => {
const many = 'rag 检索 片段 文档 知识库 大模型 生成 回答 问题';
expect(matchedKbTerms(many, hit).length).toBe(MAX_CITED_TERMS);
expect(matchedKbTerms(undefined, hit)).toEqual([]);
expect(matchedKbTerms('zxqwv', hit)).toEqual([]);
});
});

describe('formatKbScore / formatKbHitSource', () => {
it('formats scores to two decimals and sanitizes bad scores to 0.00', () => {
expect(formatKbScore(0.4231)).toBe('0.42');
expect(formatKbScore(-1)).toBe('0.00');
expect(formatKbScore(Number.NaN)).toBe('0.00');
expect(formatKbScore('0.9')).toBe('0.00');
});

it('renders title, 1-based chunk number, matched terms and score on one line', () => {
expect(formatKbHitSource(hit, '什么是检索')).toBe(
'出处：《RAG（检索增强生成）》片段 1 · 命中：检索 · 相关度 0.42',
);
expect(formatKbHitSource({...hit, chunkIndex: 2}, 'rag')).toContain('片段 3');
expect(formatKbHitSource(hit, 'zxqwv')).toContain('命中：无明确命中词');
});
});

describe('formatKbHit', () => {
it('keeps the fragment text untouched and appends the citation line', () => {
const rendered = formatKbHit(hit, 'rag 检索');
expect(rendered.startsWith(`${hit.text}\n`)).toBe(true);
expect(rendered).toContain('↳ 出处：《RAG（检索增强生成）》片段 1');
});
});

describe('kb_search citations end to end', () => {
it('annotates every registry kb_search hit with its source', async () => {
const registry = createDefaultRegistry();
const found = await registry.execute({
id: 'c1',
name: 'kb_search',
args: { query: 'RAG 检索'},
});
expect(found.isError).toBe(false);
expect(found.result).toContain('出处：《RAG（检索增强生成）》片段 1');
expect(found.result).toContain('相关度');
});

it('cites the actual later chunk of an imported document, not always chunk 1', async () => {
const filler = '背景介绍与这段主题无关的内容。'.repeat(12);
importKnowledgeDocument(
'量子纠缠笔记',
`${filler}\n\n量子纠缠是两个粒子之间超越距离的关联现象，测量一个会瞬间影响另一个。`,
);
const registry = createDefaultRegistry();
const found = await registry.execute({
id: 'c2',
name: 'kb_search',
args: { query: '量子纠缠 粒子 测量'},
});
expect(found.isError).toBe(false);
expect(found.result).toContain('出处：《量子纠缠笔记》片段 3');
expect(found.result).toContain('命中：量子');
});
});
