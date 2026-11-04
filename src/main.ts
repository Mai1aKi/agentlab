// AgentLab console: give the agent a task, watch its trace step by step.

import { Agent } from './agent/agent';
import { createDefaultRegistry } from './agent/builtinTools';
import { formatEvalReport, runEvalSuite } from './agent/eval';
import { MockModel } from './agent/mockModel';
import { runMultiAgent } from './agent/multiAgent';
import { OpenAiCompatibleModel } from './agent/openaiModel';
import { parseTrace, replayTrace, serializeTrace } from './agent/trace';
import type { ChatModel, TraceEvent } from './agent/types';
import { initParticles } from './particles';
import { renderMarkdown } from './markdown';
import './style.css';

const bgCanvas = document.getElementById('bg-particles');
if (bgCanvas) initParticles(bgCanvas as HTMLCanvasElement);

const BYOK_KEY = 'agentlab-byok-v1';

const SAMPLES = [
  '计算 (18 + 26) * 3 - 7',
  '计算 3 + 4，现在几点了？',
  '现在几点了？',
  '什么是 RAG？',
  '多 Agent 协作：什么是 RAG',
  '评测台：跑一遍内置任务集',
  '介绍一下工具调用',
  '你好，你能做什么？',
];

const modelKindEl = document.getElementById('model-kind') as HTMLSelectElement;
const byokFields = document.getElementById('byok-fields') as HTMLDivElement;
const baseUrlEl = document.getElementById('base-url') as HTMLInputElement;
const modelNameEl = document.getElementById('model-name') as HTMLInputElement;
const apiKeyEl = document.getElementById('api-key') as HTMLInputElement;
const samplesEl = document.getElementById('samples') as HTMLDivElement;
const chatEl = document.getElementById('chat') as HTMLDivElement;
const traceEl = document.getElementById('trace') as HTMLDivElement;
const inputEl = document.getElementById('task-input') as HTMLInputElement;
const runBtn = document.getElementById('run-btn') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLDivElement;
const exportTraceBtn = document.getElementById('export-trace-btn') as HTMLButtonElement;
const importTraceBtn = document.getElementById('import-trace-btn') as HTMLButtonElement;
const importTraceFile = document.getElementById('import-trace-file') as HTMLInputElement;

/** The most recent run's trace, for export (Day 5). */
let lastTrace: TraceEvent[] = [];

// Restore BYOK settings (key stays in this browser's localStorage only).
try {
  const saved = JSON.parse(localStorage.getItem(BYOK_KEY) ?? 'null') as {
    baseUrl?: string;
    model?: string;
    apiKey?: string;
  } | null;
  if (saved) {
    if (saved.baseUrl) baseUrlEl.value = saved.baseUrl;
    if (saved.model) modelNameEl.value = saved.model;
    if (saved.apiKey) apiKeyEl.value = saved.apiKey;
  }
} catch {
  // ignore corrupt saved settings
}

function currentModel(): ChatModel {
  if (modelKindEl.value === 'byok') {
    localStorage.setItem(
      BYOK_KEY,
      JSON.stringify({ baseUrl: baseUrlEl.value, model: modelNameEl.value, apiKey: apiKeyEl.value }),
    );
    return new OpenAiCompatibleModel({
      baseUrl: baseUrlEl.value.trim() || 'https://api.openai.com/v1',
      apiKey: apiKeyEl.value.trim(),
      model: modelNameEl.value.trim() || 'gpt-4o-mini',
    });
  }
  return new MockModel();
}

modelKindEl.addEventListener('change', () => {
  byokFields.hidden = modelKindEl.value !== 'byok';
});

function addBubble(role: 'user' | 'assistant', text: string): void {
  const div = document.createElement('div');
  div.className = `bubble ${role}`;
  // Assistant replies are Markdown (real models answer in it); the
  // renderer escapes first, so this innerHTML is safe. User text stays
  // literal.
  if (role === 'assistant') div.innerHTML = renderMarkdown(text);
  else div.textContent = text;
  chatEl.appendChild(div);
  div.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

function addTrace(event: TraceEvent): void {
  const div = document.createElement('div');
  div.className = 'trace-item';
  switch (event.type) {
    case 'user':
      div.innerHTML = `<span class="t-tag user">任务</span> ${escapeHtml(event.content)}`;
      break;
    case 'modelReply':
      if (event.reply.type === 'text') {
        div.innerHTML = `<span class="t-tag model">步骤 ${event.step} · 模型</span> 直接回复（不调工具）`;
      } else if (event.reply.type === 'plan') {
        div.innerHTML =
          `<span class="t-tag model">步骤 ${event.step} · 模型</span> 先制定计划` +
          `<pre>${escapeHtml(event.reply.steps.map((s, i) => `${i + 1}. [ ] ${s}`).join('\n'))}</pre>`;
      } else {
        const calls = event.reply.type === 'toolCalls' ? event.reply.calls : [event.reply.call];
        div.innerHTML =
          `<span class="t-tag model">步骤 ${event.step} · 模型</span> 决定调用工具 ` +
          calls
            .map(
              (c) =>
                `<code>${escapeHtml(c.name)}</code>` +
                `<pre>${escapeHtml(JSON.stringify(c.args, null, 2))}</pre>`,
            )
            .join('');
      }
      break;
    case 'toolResult':
      div.innerHTML =
        `<span class="t-tag ${event.isError ? 'error' : 'tool'}">工具结果</span> ` +
        `<code>${escapeHtml(event.call.name)}</code><pre>${escapeHtml(event.result)}</pre>`;
      break;
    case 'planCreated':
      div.innerHTML =
        `<span class="t-tag tool">计划</span> 共 ${event.steps.length} 步，开始逐步执行` +
        `<pre>${escapeHtml(event.steps.map((s, i) => `${i + 1}. [ ] ${s}`).join('\n'))}</pre>`;
      break;
    case 'planStepDone':
      div.innerHTML = `<span class="t-tag final">勾销计划</span> 第 ${event.index + 1} 步已完成：${escapeHtml(event.title)}`;
      break;
    case 'subAgentStarted':
      div.innerHTML = `<span class="t-tag model">子 Agent</span> ${escapeHtml(event.role)} 开始：${escapeHtml(event.instruction)}`;
      break;
    case 'subAgentDone':
      div.innerHTML = `<span class="t-tag final">子 Agent</span> ${escapeHtml(event.role)} 完成：${escapeHtml(event.summary)}`;
      break;
    case 'memoryCompressed':
      div.innerHTML =
        `<span class="t-tag tool">记忆压缩</span> 早期 ${event.summarizedCount} 条已摘要，保留最近 ${event.keptCount} 条` +
        `<pre>${escapeHtml(event.summary)}</pre>`;
      break;
    case 'final':
      div.innerHTML = `<span class="t-tag final">完成</span> 已生成最终回答`;
      break;
    case 'stopped':
      div.innerHTML = `<span class="t-tag error">停止</span> ${escapeHtml(event.reason)}`;
      break;
  }
  traceEl.appendChild(div);
  div.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

let running = false;
async function runTask(text: string): Promise<void> {
  const task = text.trim();
  if (!task || running) return;
  running = true;
  runBtn.disabled = true;
  addBubble('user', task);
  // Day 7 · Evaluation bench: a "评测台…" task runs the built-in task
  // set once through the demo model and reports tool-call accuracy.
  if (task.startsWith('评测台')) {
    const started = performance.now();
    lastTrace = [];
    try {
      lastTrace.push({ type: 'user', content: task });
      addTrace({ type: 'user', content: task });
      const suite = await runEvalSuite(async (prompt) => {
        const bench = new Agent(new MockModel(), createDefaultRegistry());
        return bench.run(prompt);
      });
      const report = formatEvalReport(suite.results, suite.summary);
      lastTrace.push({ type: 'final', content: report });
      addTrace({ type: 'final', content: report });
      addBubble('assistant', report);
      statusEl.textContent = `评测台 · 工具调用正确率 ${Math.round(suite.summary.toolCallAccuracy * 100)}% · 平均 ${suite.summary.averageSteps.toFixed(1)} 步/任务 · 耗时 ${(performance.now() - started).toFixed(0)} ms`;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      addBubble('assistant', `运行出错：${message}`);
      statusEl.textContent = `出错：${message}`;
    } finally {
      running = false;
      runBtn.disabled = false;
    }
    return;
  }
  // Day 6 · Multi-agent mode: a "多 Agent 协作：<主题>" task is handled
  // by the coordinator (researcher retrieves, writer composes) instead
  // of the single-agent loop.
  const teamPrefix = '多 Agent 协作：';
  if (task.startsWith(teamPrefix)) {
    const topic = task.slice(teamPrefix.length).trim();
    const started = performance.now();
    lastTrace = [];
    try {
      const emitTeam = (event: TraceEvent) => {
        lastTrace.push(event);
        addTrace(event);
      };
      emitTeam({ type: 'user', content: task });
      const team = await runMultiAgent(topic, emitTeam);
      emitTeam({ type: 'final', content: team.draft });
      addBubble('assistant', team.draft);
      statusEl.textContent = `多 Agent 协作 · researcher 找到 ${team.findings.length} 条资料 · writer 已成文 · 耗时 ${(performance.now() - started).toFixed(0)} ms`;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      addBubble('assistant', `运行出错：${message}`);
      statusEl.textContent = `出错：${message}`;
    } finally {
      running = false;
      runBtn.disabled = false;
    }
    return;
  }
  const model = currentModel();
  const agent = new Agent(model, createDefaultRegistry());
  const started = performance.now();
  lastTrace = [];
  try {
    const result = await agent.run(task, (event) => {
      lastTrace.push(event);
      addTrace(event);
    });
    addBubble('assistant', result.finalText);
    statusEl.textContent = `模型：${model.name} · 步数：${result.steps} · 耗时 ${(performance.now() - started).toFixed(0)} ms`;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    addBubble('assistant', `运行出错：${message}`);
    statusEl.textContent = `出错：${message}（检查 BYOK 设置或网络）`;
  } finally {
    running = false;
    runBtn.disabled = false;
  }
}

exportTraceBtn.addEventListener('click', () => {
  if (lastTrace.length === 0) {
    statusEl.textContent = '暂无可导出的轨迹，先运行一次任务。';
    return;
  }
  const blob = new Blob([serializeTrace(lastTrace)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'agentlab-trace.json';
  a.click();
  URL.revokeObjectURL(url);
  statusEl.textContent = `已导出轨迹：${lastTrace.length} 个事件`;
});

importTraceBtn.addEventListener('click', () => importTraceFile.click());
importTraceFile.addEventListener('change', () => {
  const file = importTraceFile.files?.[0];
  importTraceFile.value = '';
  if (!file) return;
  void file.text().then((text) => {
    try {
      const events = parseTrace(text);
      traceEl.innerHTML = '';
      lastTrace = [...events];
      const count = replayTrace(events, addTrace);
      statusEl.textContent = `已回放导入的轨迹：${count} 个事件`;
    } catch (e) {
      statusEl.textContent = `导入失败：${e instanceof Error ? e.message : String(e)}`;
    }
  });
});

for (const sample of SAMPLES) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'chip';
  chip.textContent = sample;
  chip.addEventListener('click', () => void runTask(sample));
  samplesEl.appendChild(chip);
}

runBtn.addEventListener('click', () => {
  const value = inputEl.value;
  inputEl.value = '';
  void runTask(value);
});
inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const value = inputEl.value;
    inputEl.value = '';
    void runTask(value);
  }
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// First paint: run the calculator sample so the trace is visible.
void runTask(SAMPLES[0]);
