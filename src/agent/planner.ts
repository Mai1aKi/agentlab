// Planner-Executor support (Day 3): a plan is a small checklist the
// model produces BEFORE acting. The runtime then ticks items off one by
// one as the corresponding work actually finishes — a step is only ever
// marked done after its tool call has executed, never in advance.
// These helpers are pure so the checklist logic is testable on its own.

export interface PlanItem {
  /** 0-based position in the plan. */
  index: number;
  title: string;
  status: 'pending' | 'done';
}

/** Build a checklist from raw step titles: trimmed, blanks dropped. */
export function createPlan(steps: readonly string[]): PlanItem[] {
  return steps
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((title, index) => ({ index, title, status: 'pending' as const }));
}

/** Return a NEW plan with the item at `index` marked done (pure). */
export function completeStep(plan: readonly PlanItem[], index: number): PlanItem[] {
  return plan.map((item) => (item.index === index ? { ...item, status: 'done' as const } : item));
}

/** The first still-pending item, if any. */
export function nextPending(plan: readonly PlanItem[]): PlanItem | undefined {
  return plan.find((item) => item.status === 'pending');
}

export function isPlanComplete(plan: readonly PlanItem[]): boolean {
  return plan.length > 0 && plan.every((item) => item.status === 'done');
}

/** Render the checklist the way it is fed back to the model / shown. */
export function formatPlan(plan: readonly PlanItem[]): string {
  return plan.map((item) => `${item.index + 1}. [${item.status === 'done' ? 'x' : ' '}] ${item.title}`).join('\n');
}
