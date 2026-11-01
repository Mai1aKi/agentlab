import { afterEach, describe, expect, it } from 'vitest';
import { chunkText, createTfIdfIndex, tokenize } from '../src/agent/rag';
import {
  clearCustomKnowledge,
  createDefaultRegistry,
  importKnowledgeDocument,
  searchKnowledgeBase,
  searchKnowledgeChunks,
} from '../src/agent/builtinTools';

afterEach(() => clearCustomKnowledge());

describe('tokenize', () => {
  it('keeps Latin words whole and splits CJK into unigrams + bigrams', () => {
    const terms = tokenize('RAG 检索');
    expect(terms).toContain('rag');
    expect(terms).toContain('检');
    expect(terms).toContain('检索');
  });

  it('keeps the trailing plus of "b+"', () => {
    expect(tokenize('B+ 树')).toContain('b+');
  });
});

describe('chunkText', () => {
  it('keeps short paragraphs whole and splits on blank lines', () => {
    expect(chunkText('第一段。\n\n第二段。')).toEqual(['第一段。', '第二段。']);
  });

  it('splits long text into chunks no longer than maxChars', () => {
    const text = '甲乙丙丁戊己庚辛壬癸。'.repeat(30); // 330 chars, punctuated
    const chunks = chunkText(text, { maxChars: 100 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(100);
    expect(chunks.join('')).toBe(text);
  });

  it('hard-slices one over-long sentence with overlap', () => {
    const text = '量'.repeat(250);
    const chunks = chunkText(text, { maxChars: 100, overlapChars: 10 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(100);
    // The second slice starts with the last 10 chars of the first.
    expect(chunks[1].slice(0, 10)).toBe(chunks[0].slice(-10));
  });
});

describe('TF-IDF index', () => {
  const index = createTfIdfIndex([
    { title: '水果甲', text: '苹果 苹果 苹果 香蕉 橙子' },
    { title: '水果乙', text: '苹果 葡萄 西瓜' },
    { title: '编程', text: '向量 检索 数据库 索引 查询' },
  ]);

  it('ranks the chunk where the term is frequent first (TF)', () => {
    const hits = index.search('苹果');
    expect(hits[0]?.title).toBe('水果甲');
  });

  it('finds the only chunk containing a rare term (IDF)', () => {
    const hits = index.search('向量检索');
    expect(hits[0]?.title).toBe('编程');
  });

  it('returns nothing when no term overlaps', () => {
    expect(index.search('zxqwv unmatched')).toEqual([]);
  });
});

describe('knowledge base on TF-IDF', () => {
  it('still finds the RAG and B+ tree entries', () => {
    expect(searchKnowledgeBase('RAG')[0]?.title).toMatch(/RAG/);
    expect(searchKnowledgeBase('B+ 树')[0]?.title).toMatch(/B\+/);
    expect(searchKnowledgeBase('zxqwv unmatched')).toEqual([]);
  });

  it('retrieves at chunk level with scores', () => {
    const hits = searchKnowledgeChunks('什么是向量检索');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].score).toBeGreaterThan(0);
    expect(hits[0].text.length).toBeGreaterThan(0);
  });
});

describe('custom document import', () => {
  it('makes an imported document searchable, including a later chunk', () => {
    const filler = '背景介绍与这段主题无关的内容。'.repeat(12);
    const { chunkCount } = importKnowledgeDocument(
      '量子纠缠笔记',
      `${filler}\n\n量子纠缠是两个粒子之间超越距离的关联现象，测量一个会瞬间影响另一个。`,
    );
    expect(chunkCount).toBeGreaterThan(1);
    const hits = searchKnowledgeChunks('量子纠缠 粒子 测量');
    expect(hits[0]?.title).toBe('量子纠缠笔记');
    expect(hits[0]?.text).toMatch(/量子纠缠/);
    expect(searchKnowledgeBase('量子纠缠')[0]?.title).toBe('量子纠缠笔记');
  });

  it('rejects empty title or content', () => {
    expect(() => importKnowledgeDocument('  ', '正文')).toThrow(/title/);
    expect(() => importKnowledgeDocument('标题', ' ')).toThrow(/content/);
  });

  it('works end to end through the registry: kb_import then kb_search', async () => {
    const registry = createDefaultRegistry();
    const imported = await registry.execute({
      id: 'c1',
      name: 'kb_import',
      args: { title: '光合作用笔记', content: '光合作用是植物把阳光、水和二氧化碳转化成氧气与葡萄糖的过程。' },
    });
    expect(imported.isError).toBe(false);
    expect(imported.result).toMatch(/已导入/);

    const found = await registry.execute({
      id: 'c2',
      name: 'kb_search',
      args: { query: '光合作用 植物 氧气' },
    });
    expect(found.isError).toBe(false);
    expect(found.result).toMatch(/光合作用/);
  });
});
