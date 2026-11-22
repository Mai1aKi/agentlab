// AgentLab console: give the agent a task, watch its trace step by step.

import { Agent } from './agent/agent';
import { createDefaultRegistry } from './agent/builtinTools';
import {
  formatConversationMarkdown,
  type ConversationMessage,
} from './agent/conversationExport';
import { formatEvalReport, runEvalSuite } from './agent/eval';
import { MockModel } from './agent/mockModel';
import { runMultiAgent } from './agent/multiAgent';
import { OpenAiCompatibleModel } from './agent/openaiModel';
import {
  clearSessionFrom,
  loadSessionFrom,
  saveSessionTo,
} from './agent/session';
import {
  recordRunCost,
  summarizeRunCosts,
  type RunCostEntry,
} from './agent/costComparison';
import {
  formatShortcutHint,
  resolveShortcutAction,
} from './agent/shortcuts';
import { formatPlanReview } from './agent/planReview';
import { formatRunStats } from './agent/stats';
import { formatToolDuration } from './agent/toolTiming';
import { BUILTIN_PROMPT_TEMPLATES } from './agent/templates';
import { parseTrace, replayTrace, serializeTrace } from './agent/trace';
import {
  matchesTraceFilter,
  normalizeTraceFilter,
  traceEventCategory,
  type TraceFilter,
} from './agent/traceFilter';
import {
  formatTraceSearchSummary,
  matchesTraceSearch,
  normalizeTraceQuery,
  traceEventSearchText,
} from './agent/traceSearch';
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
const templatesEl = document.getElementById('templates') as HTMLDivElement;
const toolTogglesEl = document.getElementById('tool-toggles') as HTMLDivElement;
const chatEl = document.getElementById('chat') as HTMLDivElement;
const traceEl = document.getElementById('trace') as HTMLDivElement;
const inputEl = document.getElementById('task-input') as HTMLInputElement;
const runBtn = document.getElementById('run-btn') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLDivElement;
const exportTraceBtn = document.getElementById('export-trace-btn') as HTMLButtonElement;
const exportConversationBtn = document.getElementById(
  'export-conversation-btn',
) as HTMLButtonElement;
const clearSessionBtn = document.getElementById('clear-session-btn') as HTMLButtonElement;
const importTraceBtn = document.getElementById('import-trace-btn') as HTMLButtonElement;
const importTraceFile = document.getElementById('import-trace-file') as HTMLInputElement;
const modelStatusEl = document.getElementById('model-status') as HTMLSpanElement;
const traceSummaryEl = document.getElementById('trace-summary') as HTMLSpanElement;
const costComparisonEl = document.getElementById('cost-comparison') as HTMLDivElement;
const traceSearchInputEl = document.getElementById('trace-search-input') as HTMLInputElement | null;
const traceSearchCountEl = document.getElementById('trace-search-count') as HTMLSpanElement | null;
const traceEmptyEl = document.getElementById('trace-empty') as HTMLDivElement | null;

/** UI v6 · Progressive disclosure: secondary controls (prompt
 *  templates + tool toggles on the left, export / import / clear
 *  on the right) live behind a small toggle, collapsed by default,
 *  so the first screen only shows what a newcomer needs. */
function wireDisclosure(toggleId: string, panelId: string): void {
  const toggle = document.getElementById(toggleId) as HTMLButtonElement | null;
  const panel = document.getElementById(panelId) as HTMLElement | null;
  if (!toggle || !panel) return;
  toggle.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute('aria-expanded', String(!panel.hidden));
  });
}
wireDisclosure('advanced-toggle', 'advanced-panel');
wireDisclosure('trace-tools-toggle', 'trace-tools-panel');

/** Cost history of this session's normal runs (Day 17): every
 *  finished run appends one row, rendered as a small comparison
 *  table under the trace actions. Eval-bench and multi-agent runs
 *  produce no RunStats, so they stay out of the table. */
let runCostHistory: RunCostEntry[] = [];

function renderCostComparison(): void {
  if (runCostHistory.length === 0) {
    costComparisonEl.hidden = true;
    costComparisonEl.innerHTML = '';
    return;
  }
  const summary = summarizeRunCosts(runCostHistory);
  const rows = runCostHistory
    .map(
      (entry, i) =>
        `<tr><td title="${escapeHtml(entry.label)}">${i + 1}. ${escapeHtml(entry.label)}</td>` +
        `<td>${entry.stats.steps}</td><td>${entry.stats.toolCalls}</td>` +
        `<td>${entry.stats.toolErrors}</td><td>${entry.stats.durationMs} ms</td></tr>`,
    )
    .join('');
  costComparisonEl.innerHTML =
    `<div class="cost-comparison-title">历次运行对比 · 最近 ${summary.runs} 次</div>` +
    `<table><thead><tr><th>任务</th><th>步数</th><th>工具</th><th>失败</th><th>耗时</th></tr></thead>` +
    `<tbody>${rows}</tbody>` +
    `<tfoot><tr><td>合计 · 平均步数 ${summary.averageSteps.toFixed(1)} · 平均耗时 ${summary.averageDurationMs} ms</td>` +
    `<td>${summary.totalSteps}</td><td>${summary.totalToolCalls}</td>` +
    `<td>${summary.totalToolErrors}</td><td>${summary.totalDurationMs} ms</td></tr></tfoot></table>`;
  costComparisonEl.hidden = false;
}

/** The most recent run's trace, for export (Day 5). */
let lastTrace: TraceEvent[] = [];

/** Which trace events the panel currently shows (Day 16). Filtering
 *  only hides rendered items; `lastTrace` always keeps everything,
 *  so export and replay are unaffected. */
let traceFilter: TraceFilter = 'all';

/** Keyword narrowing the trace panel (Day 19). Combined with the
 *  Day 16 category filter: an event shows only when it passes
 *  both. Search only hides rendered items; `lastTrace` always
 *  keeps everything, so export and replay are unaffected. */
let traceSearchQuery = '';

function applyTraceFilter(): void {
  const query = normalizeTraceQuery(traceSearchQuery);
  let total = 0;
  let visible = 0;
  for (const child of Array.from(traceEl.children)) {
    const item = child as HTMLElement;
    total += 1;
    const category = item.dataset.category;
    const passesFilter = traceFilter === 'all' || category === traceFilter;
    const passesSearch =
      query === '' || (item.dataset.searchText ?? '').includes(query);
    item.hidden = !(passesFilter && passesSearch);
    if (!item.hidden) visible += 1;
  }
  if (traceSearchCountEl) {
    traceSearchCountEl.textContent = formatTraceSearchSummary(
      traceSearchQuery,
      visible,
      total,
    );
  }
  for (const btn of Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-trace-filter]'),
  )) {
    btn.setAttribute(
      'aria-pressed',
      String(normalizeTraceFilter(btn.dataset.traceFilter) === traceFilter),
    );
  }
}

traceSearchInputEl?.addEventListener('input', () => {
  traceSearchQuery = traceSearchInputEl.value;
  applyTraceFilter();
});

for (const btn of Array.from(
  document.querySelectorAll<HTMLButtonElement>('[data-trace-filter]'),
)) {
  btn.addEventListener('click', () => {
    traceFilter = normalizeTraceFilter(btn.dataset.traceFilter);
    applyTraceFilter();
  });
}

/** Every visible bubble this session, in order, for the Markdown
 *  conversation export (Day 12). */
const chatLog: ConversationMessage[] = [];

/** Tools the user has disabled in the console (Day 13). Passed to the
 *  Agent on every run; calls to a disabled tool are skipped and the
 *  reason is fed back to the model. */
const disabledTools = new Set<string>();

/** Friendly Chinese names for the tool toggles (UI v6): the raw
 *  spec names are developer jargon, so the chip shows what the
 *  tool does in plain words and keeps the spec name in the title. */
const TOOL_FRIENDLY_NAMES: Record<string, string> = {
  calculator: '计算器',
  clock: '时钟',
  kb_search: '知识库检索',
  kb_import: '知识库导入',
};

function renderToolToggles(): void {
  toolTogglesEl.innerHTML = '';
  for (const spec of createDefaultRegistry().listSpecs()) {
    const disabled = disabledTools.has(spec.name);
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip tool-toggle';
    chip.setAttribute('aria-pressed', String(disabled));
    chip.textContent = `${TOOL_FRIENDLY_NAMES[spec.name] ?? spec.name} · ${disabled ? '关' : '开'}`;
    chip.title = `${spec.name}：${spec.description}（点击${disabled ? '启用' : '禁用'}）`;
    chip.addEventListener('click', () => {
      if (disabledTools.has(spec.name)) disabledTools.delete(spec.name);
      else disabledTools.add(spec.name);
      renderToolToggles();
    });
    toolTogglesEl.appendChild(chip);
  }
}
renderToolToggles();

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

/** Top-bar model status: a glanceable readiness signal next to the
 *  model picker — demo, BYOK ready, or BYOK incomplete (and why). */
function syncModelStatus(): void {
  if (modelKindEl.value !== 'byok') {
    modelStatusEl.dataset.state = 'mock';
    modelStatusEl.textContent = '演示模型 · 零成本';
    return;
  }
  const missing: string[] = [];
  if (!baseUrlEl.value.trim()) missing.push('地址');
  if (!modelNameEl.value.trim()) missing.push('模型名');
  if (!apiKeyEl.value.trim()) missing.push('Key');
  if (missing.length === 0) {
    modelStatusEl.dataset.state = 'ready';
    modelStatusEl.textContent = `BYOK · ${modelNameEl.value.trim()}`;
  } else {
    modelStatusEl.dataset.state = 'warn';
    modelStatusEl.textContent = `BYOK · 未填${missing.join('/')}`;
  }
}

modelKindEl.addEventListener('change', () => {
  byokFields.hidden = modelKindEl.value !== 'byok';
  syncModelStatus();
});
for (const el of [baseUrlEl, modelNameEl, apiKeyEl]) {
  el.addEventListener('input', syncModelStatus);
}
syncModelStatus();

/** Persist the visible conversation + the most recent trace so a
 *  refresh restores them (Day 14). Storage failures (quota, private
 *  mode) must never break a run, so they are swallowed here. */
function persistSession(): void {
  try {
    saveSessionTo(localStorage, chatLog, lastTrace);
  } catch {
    // ignore: the console still works without a saved session
  }
}

function renderBubble(role: 'user' | 'assistant', text: string): void {
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

function addBubble(role: 'user' | 'assistant', text: string): void {
  chatLog.push({ role, text });
  renderBubble(role, text);
  persistSession();
}

function addTrace(event: TraceEvent): void {
  if (traceEmptyEl) traceEmptyEl.hidden = true;
  const div = document.createElement('div');
  div.className = 'trace-item';
  div.dataset.category = traceEventCategory(event);
  div.dataset.searchText = traceEventSearchText(event).toLowerCase();
  if (!matchesTraceFilter(event, traceFilter) || !matchesTraceSearch(event, traceSearchQuery)) div.hidden = true;
  switch (event.type) {
    case 'user':
      traceSummaryEl.textContent = '';
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
        `<code>${escapeHtml(event.call.name)}</code> ${escapeHtml(formatToolDuration(event.durationMs))}<pre>${escapeHtml(event.result)}</pre>`;
      break;
    case 'toolRetry':
      div.innerHTML =
        `<span class="t-tag error">工具重试</span> ` +
        `<code>${escapeHtml(event.call.name)}</code> 第 ${event.attempt} 次重试（上次失败：${escapeHtml(event.result)}）`;
      break;
    case 'toolDisabled':
      div.innerHTML =
        `<span class="t-tag error">工具禁用</span> ` +
        `<code>${escapeHtml(event.call.name)}</code> 已被禁用，本次调用跳过（${escapeHtml(event.result)}）`;
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
    case 'planReview':
      div.innerHTML = `<span class="t-tag final">计划回看</span> ${escapeHtml(formatPlanReview(event.review))}`;
      break;
    case 'textDelta':
      div.innerHTML =
        `<span class="t-tag model">流式片段</span> 第 ${event.step} 步 · 第 ${event.index + 1} 片` +
        `<pre>${escapeHtml(event.delta)}</pre>`;
      break;
    case 'runStats':
      // Run cost lives in the trace header summary, not as another
      // card competing with the steps (UI polish v5).
      traceSummaryEl.textContent = formatRunStats(event.stats);
      return;
    case 'final':
      div.innerHTML = `<span class="t-tag final">完成</span> 已生成最终回答`;
      break;
    case 'stopped':
      div.innerHTML = `<span class="t-tag error">停止</span> ${escapeHtml(event.reason)}`;
      break;
  }
  traceEl.appendChild(div);
  applyTraceFilter();
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
        const bench = new Agent(new MockModel(), createDefaultRegistry(), { disabledTools });
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
  // Day 8 · Streaming: BYOK text arrives fragment by fragment — show it
  // in a live bubble (plain text while streaming), then swap in the
  // Markdown rendering of the final answer when the run completes.
  const stream: { el: HTMLDivElement | null; text: string } = { el: null, text: '' };
  const agent = new Agent(model, createDefaultRegistry(), {
    disabledTools,
    onTextDelta: (delta) => {
      stream.text += delta;
      if (!stream.el) {
        stream.el = document.createElement('div');
        stream.el.className = 'bubble assistant';
        chatEl.appendChild(stream.el);
      }
      stream.el.textContent = stream.text;
      stream.el.scrollIntoView({ behavior: 'smooth', block: 'end' });
    },
  });
  const started = performance.now();
  lastTrace = [];
  try {
    const result = await agent.run(task, (event) => {
      lastTrace.push(event);
      addTrace(event);
    });
    runCostHistory = recordRunCost(runCostHistory, task, result.stats);
    renderCostComparison();
    if (stream.el) {
      // The streamed bubble never went through addBubble, so record
      // its final text in the chat log here (Day 12).
      chatLog.push({ role: 'assistant', text: result.finalText });
      persistSession();
      stream.el.innerHTML = renderMarkdown(result.finalText);
    } else addBubble('assistant', result.finalText);
    statusEl.textContent = `模型：${model.name} · 步数：${result.steps} · 耗时 ${(performance.now() - started).toFixed(0)} ms`;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    stream.el?.remove();
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

exportConversationBtn.addEventListener('click', () => {
  if (chatLog.length === 0 && lastTrace.length === 0) {
    statusEl.textContent = '暂无可导出的对话，先运行一次任务。';
    return;
  }
  const blob = new Blob([formatConversationMarkdown(chatLog, lastTrace)], {
    type: 'text/markdown',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'agentlab-conversation.md';
  a.click();
  URL.revokeObjectURL(url);
  statusEl.textContent = `已导出对话 Markdown：${chatLog.length} 条消息 · ${lastTrace.length} 个轨迹事件`;
});

clearSessionBtn.addEventListener('click', () => {
  try {
    clearSessionFrom(localStorage);
    statusEl.textContent = '已清除保存的会话存档，刷新后将重新开始。';
  } catch {
    statusEl.textContent = '清除会话存档失败：浏览器存储不可用。';
  }
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
      persistSession();
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

// Day 15 · Prompt templates: clicking one only fills the input —
// the user edits the {placeholders} first, then runs it. Templates
// never run on click (that is what the sample tasks above do).
for (const template of BUILTIN_PROMPT_TEMPLATES) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'chip';
  chip.textContent = template.label;
  chip.title = template.prompt;
  chip.addEventListener('click', () => {
    inputEl.value = template.prompt;
    inputEl.focus();
    // Select the first placeholder so editing starts right there.
    const start = template.prompt.indexOf('{');
    const end = template.prompt.indexOf('}');
    if (start >= 0 && end > start) inputEl.setSelectionRange(start, end + 1);
    statusEl.textContent = `已填入模板「${template.label}」，编辑后点运行。`;
  });
  templatesEl.appendChild(chip);
}

runBtn.addEventListener('click', () => {
  const value = inputEl.value;
  inputEl.value = '';
  void runTask(value);
});
// Day 18 · Keyboard shortcuts: Ctrl/Cmd+Enter (and plain Enter)
// runs the task, Esc clears the input. The decision lives in the
// pure resolveShortcutAction helper, so IME compositions and
// modified Escapes never fire by accident.
const shortcutHintEl = document.getElementById('shortcut-hint');
if (shortcutHintEl) shortcutHintEl.textContent = formatShortcutHint();
inputEl.addEventListener('keydown', (e) => {
  const action = resolveShortcutAction(e);
  if (action === 'run') {
    e.preventDefault();
    const value = inputEl.value;
    inputEl.value = '';
    void runTask(value);
  } else if (action === 'clear') {
    e.preventDefault();
    const hadText = inputEl.value.length > 0;
    inputEl.value = '';
    if (hadText) statusEl.textContent = '已清空输入。';
  }
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// First paint: restore the saved session if there is one (Day 14) —
// bubbles and the last trace come back without re-running anything.
// With nothing saved, run the calculator sample so the trace is
// visible.
const restoredSession = loadSessionFrom(localStorage);
if (restoredSession && restoredSession.chat.length > 0) {
  for (const message of restoredSession.chat) {
    chatLog.push(message);
    renderBubble(message.role, message.text);
  }
  lastTrace = [...restoredSession.trace];
  for (const event of lastTrace) addTrace(event);
  statusEl.textContent = `已恢复上次会话：${restoredSession.chat.length} 条消息 · ${lastTrace.length} 个轨迹事件`;
} else {
  void runTask(SAMPLES[0]);
}
