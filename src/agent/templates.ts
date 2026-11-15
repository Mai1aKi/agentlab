// Prompt templates (Day 15): a small library of common prompt
// templates. Clicking one in the console only fills the task input
// — the user edits the placeholders first, then runs it. Unlike the
// sample tasks (which run immediately), templates are starting
// points for editing. Everything here is pure data + pure functions,
// so the fill-in behaviour is testable without a DOM.

export interface PromptTemplate {
  id: string;
  label: string;
  /** Prompt text with `{name}` placeholders the user edits. */
  prompt: string;
}

export const BUILTIN_PROMPT_TEMPLATES: readonly PromptTemplate[] = [
  {
    id: 'explain-concept',
    label: '解释概念',
    prompt: '什么是 {topic}？请用通俗的话解释，并举一个例子。',
  },
  {
    id: 'calculate',
    label: '计算表达式',
    prompt: '计算 {expression}',
  },
  {
    id: 'calculate-and-clock',
    label: '计算 + 时间',
    prompt: '计算 {expression}，现在几点了？',
  },
  {
    id: 'compare-concepts',
    label: '对比两个概念',
    prompt: '介绍一下 {a}，并说说它和 {b} 的区别。',
  },
  {
    id: 'multi-agent-topic',
    label: '多 Agent 协作',
    prompt: '多 Agent 协作：什么是 {topic}',
  },
];

/** Look a template up by id; unknown ids return undefined. */
export function findPromptTemplate(id: string): PromptTemplate | undefined {
  return BUILTIN_PROMPT_TEMPLATES.find((t) => t.id === id);
}

/** The `{name}` placeholder names in a template prompt, in order. */
export function templatePlaceholders(template: PromptTemplate): string[] {
  const names: string[] = [];
  for (const match of template.prompt.matchAll(/\{([^{}]+)\}/g)) {
    const name = match[1].trim();
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

/** Fill a template's placeholders with the given values. Values are
 *  trimmed; a placeholder with no (or an empty) value is left as-is,
 *  so a partially filled prompt still shows what is left to edit. */
export function fillPromptTemplate(
  template: PromptTemplate,
  values: Readonly<Record<string, string>>,
): string {
  return template.prompt.replace(/\{([^{}]+)\}/g, (whole, raw: string) => {
    const value = values[raw.trim()]?.trim();
    return value ? value : whole;
  });
}
