// Sub-agent grouping (Day 26): a multi-agent run's trace mixes
// researcher and writer events in run order, which is fine live
// but hard to review afterwards. Grouping is a pure fold over the
// trace — events keep their original order inside each role's
// group, groups appear in first-seen role order, and non
// sub-agent events are ignored. The console renders each group
// as a collapsed <details> block; these functions own the rules.

import type { TraceEvent } from './types';

export type SubAgentTraceEvent = Extract<
  TraceEvent,
  { type: 'subAgentStarted' } | { type: 'subAgentDone' }
>;

export interface SubAgentGroup {
  role: string;
  events: SubAgentTraceEvent[];
  started: number;
  done: number;
}

/** Fold a trace into per-role groups, in first-seen role order.
 *  Returns new arrays/objects and never mutates the trace. */
export function groupSubAgentEvents(
  events: readonly TraceEvent[],
): SubAgentGroup[] {
  const groups: SubAgentGroup[] = [];
  const byRole = new Map<string, SubAgentGroup>();
  for (const event of events) {
    if (event.type !== 'subAgentStarted' && event.type !== 'subAgentDone') continue;
    let group = byRole.get(event.role);
    if (!group) {
      group = { role: event.role, events: [], started: 0, done: 0 };
      byRole.set(event.role, group);
      groups.push(group);
    }
    group.events.push(event);
    if (event.type === 'subAgentStarted') group.started += 1;
    else group.done += 1;
  }
  return groups;
}

/** Toggle one role in the collapsed-role set (pure: returns a new
 *  array, roles kept in the order they were first collapsed). */
export function toggleCollapsedRole(
  collapsed: readonly string[],
  role: unknown,
): string[] {
  if (typeof role !== 'string' || role.trim() === '') return [...collapsed];
  const clean = role.trim();
  return collapsed.includes(clean)
    ? collapsed.filter((r) => r !== clean)
    : [...collapsed, clean];
}

/** Whether a role's group is currently collapsed. Groups start
 *  collapsed in the review panel until the reader expands them. */
export function isRoleCollapsed(collapsed: readonly string[], role: string): boolean {
  return collapsed.includes(role);
}

/** One-line summary for a group's collapsed header. */
export function formatSubAgentGroup(group: SubAgentGroup): string {
  return `${group.role}：${group.events.length} 条事件（开始 ${group.started} · 完成 ${group.done}）`;
}

/** One-line summary over all groups; says so plainly when a trace
 *  has no sub-agent events at all. */
export function formatSubAgentGroups(groups: readonly SubAgentGroup[]): string {
  if (groups.length === 0) return '子 Agent 分组：暂无子 Agent 事件';
  const total = groups.reduce((sum, g) => sum + g.events.length, 0);
  return `子 Agent 分组：${groups.length} 个角色 · ${total} 条事件`;
}
