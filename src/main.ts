// AgentLab console: give the agent a task, watch its trace step by step.

import { Agent } from './agent/agent';
import { createDefaultRegistry } from './agent/builtinTools';
import { MockModel } from './agent/mockModel';
import { OpenAiCompatibleModel } from './agent/openaiModel';
import type { ChatModel, TraceEvent } from './agent/types';
import './style.css';

const BYOK_KEY = 'agentlab-byok-v1';

const SAMPLES = [
  '计算 (18 + 26) * 3 - 7',
  '计算 3 + 4，现在几点了？',
  '现在几点了？',
  '什么是 RAG？',
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
  div.textContent = text;
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
  const model = currentModel();
  const agent = new Agent(model, createDefaultRegistry());
  const started = performance.now();
  try {
    const result = await agent.run(task, addTrace);
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
