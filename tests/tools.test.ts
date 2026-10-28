import { describe, expect, it } from 'vitest';
import {
  createDefaultRegistry,
  searchKnowledgeBase,
} from '../src/agent/builtinTools';

describe('tool registry', () => {
  it('executes the calculator through the registry', async () => {
    const registry = createDefaultRegistry();
    const outcome = await registry.execute({
      id: 'c1',
      name: 'calculator',
      args: { expression: '(18 + 26) * 3 - 7' },
    });
    expect(outcome).toEqual({ result: '125', isError: false });
  });

  it('returns an error outcome for unknown tools instead of throwing', async () => {
    const registry = createDefaultRegistry();
    const outcome = await registry.execute({ id: 'c1', name: 'fly', args: {} });
    expect(outcome.isError).toBe(true);
    expect(outcome.result).toMatch(/unknown tool/);
  });

  it('validates required arguments and their types', async () => {
    const registry = createDefaultRegistry();
    const missing = await registry.execute({ id: 'c1', name: 'calculator', args: {} });
    expect(missing.isError).toBe(true);
    expect(missing.result).toMatch(/missing required argument/);

    const wrongType = await registry.execute({
      id: 'c2',
      name: 'calculator',
      args: { expression: 42 },
    });
    expect(wrongType.isError).toBe(true);
    expect(wrongType.result).toMatch(/must be a string/);
  });

  it('turns tool exceptions into error outcomes', async () => {
    const registry = createDefaultRegistry();
    const outcome = await registry.execute({
      id: 'c1',
      name: 'calculator',
      args: { expression: '1 / 0' },
    });
    expect(outcome.isError).toBe(true);
    expect(outcome.result).toMatch(/Division by zero/);
  });

  it('clock returns a time string', async () => {
    const registry = createDefaultRegistry();
    const outcome = await registry.execute({ id: 'c1', name: 'clock', args: {} });
    expect(outcome.isError).toBe(false);
    expect(outcome.result).toMatch(/:/);
  });

  it('lists specs for all built-in tools', () => {
    const specs = createDefaultRegistry().listSpecs();
    expect(specs.map((s) => s.name)).toEqual(['calculator', 'clock', 'kb_search']);
  });
});

describe('knowledge base search', () => {
  it('finds the RAG entry for a RAG question', () => {
    const hits = searchKnowledgeBase('RAG');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].title).toMatch(/RAG/);
  });

  it('finds the B+ tree entry', () => {
    const hits = searchKnowledgeBase('B+ 树');
    expect(hits[0]?.title).toMatch(/B\+/);
  });

  it('returns nothing for unrelated queries', () => {
    expect(searchKnowledgeBase('zxqwv unmatched')).toEqual([]);
  });
});
