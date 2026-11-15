import { describe, expect, it } from 'vitest';
import {
  BUILTIN_PROMPT_TEMPLATES,
  fillPromptTemplate,
  findPromptTemplate,
  templatePlaceholders,
} from '../src/agent/templates';

describe('prompt templates (Day 15)', () => {
  it('ships a small library with unique ids and labelled prompts', () => {
    expect(BUILTIN_PROMPT_TEMPLATES.length).toBeGreaterThanOrEqual(4);
    const ids = BUILTIN_PROMPT_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const template of BUILTIN_PROMPT_TEMPLATES) {
      expect(template.label.trim()).not.toBe('');
      expect(template.prompt.trim()).not.toBe('');
    }
  });

  it('gives every builtin template at least one editable placeholder', () => {
    for (const template of BUILTIN_PROMPT_TEMPLATES) {
      expect(templatePlaceholders(template).length).toBeGreaterThanOrEqual(1);
    }
  });

  it('finds a template by id and returns undefined for unknown ids', () => {
    expect(findPromptTemplate('calculate')?.label).toBe('计算表达式');
    expect(findPromptTemplate('no-such-template')).toBeUndefined();
  });

  it('lists placeholders in order without duplicates', () => {
    const template = findPromptTemplate('compare-concepts')!;
    expect(templatePlaceholders(template)).toEqual(['a', 'b']);
  });

  it('fills placeholders with trimmed values', () => {
    const template = findPromptTemplate('explain-concept')!;
    expect(fillPromptTemplate(template, { topic: '  RAG  ' })).toBe(
      '什么是 RAG？请用通俗的话解释，并举一个例子。',
    );
  });

  it('leaves placeholders without a value in place for editing', () => {
    const template = findPromptTemplate('compare-concepts')!;
    expect(fillPromptTemplate(template, { a: 'RAG' })).toContain('{b}');
    expect(fillPromptTemplate(template, { a: 'RAG', b: '   ' })).toContain('{b}');
    expect(fillPromptTemplate(template, {})).toBe(template.prompt);
  });
});
