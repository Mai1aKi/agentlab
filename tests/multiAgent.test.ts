import { describe, expect, it } from 'vitest';
import { composeDraft, delegateTasks, runMultiAgent } from '../src/agent/multiAgent';
import type { TraceEvent } from '../src/agent/types';

describe('multi-agent collaboration (Day 6)', () => {
  it('delegates a topic to researcher then writer, in order', () => {
    expect(delegateTasks('  什么是 RAG  ')).toEqual([
      { role: 'researcher', instruction: '检索知识库中与「什么是 RAG」相关的资料' },
      { role: 'writer', instruction: '根据 researcher 的检索结果，写一段关于「什么是 RAG」的短文' },
    ]);
    expect(delegateTasks('   ')).toEqual([]);
  });

  it('composes a draft from findings only, and admits when there are none', () => {
    const draft = composeDraft('RAG', [{ title: 'RAG（检索增强生成）', text: '先检索再生成。' }]);
    expect(draft).toContain('关于「RAG」的短文');
    expect(draft).toContain('先检索再生成。');
    expect(draft).toContain('researcher 检索、writer 汇总');
    expect(composeDraft('未知主题', [])).toContain('没有找到相关资料');
  });

  it('runs researcher before writer and passes findings into the draft', async () => {
    const events: TraceEvent[] = [];
    const result = await runMultiAgent(
      'RAG',
      (e) => events.push(e),
      () => [{ title: 'RAG（检索增强生成）', text: '先检索再生成。' }],
    );
    expect(result.findings).toEqual([{ title: 'RAG（检索增强生成）', text: '先检索再生成。' }]);
    expect(result.draft).toContain('先检索再生成。');
    expect(events.map((e) => e.type)).toEqual([
      'subAgentStarted',
      'subAgentDone',
      'subAgentStarted',
      'subAgentDone',
    ]);
    expect(events[0]).toMatchObject({ role: 'researcher' });
    expect(events[2]).toMatchObject({ role: 'writer' });
  });

  it('retrieves real knowledge for RAG and rejects a blank topic', async () => {
    const result = await runMultiAgent('什么是 RAG');
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.draft).toContain('RAG');
    await expect(runMultiAgent('   ')).rejects.toThrow('不能为空');
  });
});
