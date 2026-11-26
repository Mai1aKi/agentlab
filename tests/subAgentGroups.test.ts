import { describe, expect, it } from 'vitest';
import {
  formatSubAgentGroup,
  formatSubAgentGroups,
  groupSubAgentEvents,
  isRoleCollapsed,
  toggleCollapsedRole,
} from '../src/agent/subAgentGroups';
import type { TraceEvent } from '../src/agent/types';

const trace: TraceEvent[] = [
  { type: 'user', content: '多 Agent 协作：什么是 RAG' },
  { type: 'subAgentStarted', role: 'researcher', instruction: '检索 RAG' },
  { type: 'subAgentDone', role: 'researcher', summary: '找到 2 条资料' },
  { type: 'subAgentStarted', role: 'writer', instruction: '根据资料成文' },
  { type: 'subAgentDone', role: 'writer', summary: '已成文 120 字' },
  { type: 'final', content: '短文' },
];

describe('sub-agent groups (Day 26)', () => {
  it('groups sub-agent events by role in first-seen order, ignoring other events', () => {
    const groups = groupSubAgentEvents(trace);
    expect(groups.map((g) => g.role)).toEqual(['researcher', 'writer']);
    expect(groups[0].events.map((e) => e.type)).toEqual(['subAgentStarted', 'subAgentDone']);
    expect(groups[0].started).toBe(1);
    expect(groups[0].done).toBe(1);
    expect(groups[1].events).toHaveLength(2);
  });

  it('keeps interleaved events of the same role in original order in one group', () => {
    const interleaved: TraceEvent[] = [
      { type: 'subAgentStarted', role: 'writer', instruction: '先写' },
      { type: 'subAgentStarted', role: 'researcher', instruction: '再查' },
      { type: 'subAgentDone', role: 'writer', summary: '写完' },
    ];
    const groups = groupSubAgentEvents(interleaved);
    expect(groups.map((g) => g.role)).toEqual(['writer', 'researcher']);
    expect(groups[0].events.map((e) => e.type)).toEqual(['subAgentStarted', 'subAgentDone']);
    expect(groups[0].started).toBe(1);
    expect(groups[0].done).toBe(1);
    expect(groups[1].done).toBe(0);
  });

  it('returns no groups for a trace without sub-agent events and does not mutate it', () => {
    const plain: TraceEvent[] = [{ type: 'user', content: '你好' }];
    expect(groupSubAgentEvents(plain)).toEqual([]);
    expect(groupSubAgentEvents([])).toEqual([]);
    const before = JSON.stringify(trace);
    groupSubAgentEvents(trace);
    expect(JSON.stringify(trace)).toBe(before);
  });

  it('toggles collapsed roles purely and ignores blank roles', () => {
    const collapsed = toggleCollapsedRole([], 'researcher');
    expect(collapsed).toEqual(['researcher']);
    expect(isRoleCollapsed(collapsed, 'researcher')).toBe(true);
    expect(isRoleCollapsed(collapsed, 'writer')).toBe(false);
    expect(toggleCollapsedRole(collapsed, 'researcher')).toEqual([]);
    expect(collapsed).toEqual(['researcher']);
    expect(toggleCollapsedRole(collapsed, '  ')).toEqual(['researcher']);
    expect(toggleCollapsedRole(collapsed, 42)).toEqual(['researcher']);
  });

  it('formats a one-line summary per group', () => {
    const groups = groupSubAgentEvents(trace);
    expect(formatSubAgentGroup(groups[0])).toBe('researcher：2 条事件（开始 1 · 完成 1）');
    expect(formatSubAgentGroup(groups[1])).toBe('writer：2 条事件（开始 1 · 完成 1）');
  });

  it('formats an overall summary and says so plainly when empty', () => {
    expect(formatSubAgentGroups(groupSubAgentEvents(trace))).toBe('子 Agent 分组：2 个角色 · 4 条事件');
    expect(formatSubAgentGroups([])).toBe('子 Agent 分组：暂无子 Agent 事件');
  });
});
