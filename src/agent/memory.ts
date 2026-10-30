// Memory compression (Day 2): when a conversation grows past a limit,
// the earliest messages are folded into one deterministic summary message
// so the model keeps the gist without paying for the full history.
//
// The summarizer is extractive and rule-based (no extra model call):
// each folded message contributes a short "role: snippet" entry, tool
// calls/results are named explicitly, and the result is length-capped.

import type { Message} from './types';

export const SUMMARY_PREFIX = '';

const MAX_SNIPPET = 60;
const MAX_SUMMARY = 600;

export function isSummaryMessage(message: Message): boolean {
return message.role === 'system' && message.content.startsWith(SUMMARY_PREFIX);
}

function snippetFor(message: Message): string {
const calls = message.toolCalls?? (message.toolCall? [message.toolCall]: []);
if (message.role === 'assistant' && calls.length > 0) {
return `调用工具 ${calls.map((c) => c.name).join(', ')}`;
}
if (message.role === 'tool') {
const label = message.toolName? `工具 ${message.toolName} 结果`: '工具结果';
return `${label}: ${truncate(message.content, MAX_SNIPPET)}`;
}
const role =
message.role === 'user'? '用户': message.role === 'assistant'? '助手': '系统';
// A previous summary is already compact; keep it as-is (minus prefix).
const text = isSummaryMessage(message)
? message.content.slice(SUMMARY_PREFIX.length).trim()
: message.content;
return `${role}: ${truncate(text, MAX_SNIPPET)}`;
}

function truncate(text: string, max: number): string {
const flat = text.replace(/\s+/g, ' ').trim();
return flat.length > max? `${flat.slice(0, max)}…`: flat;
}

/** Fold a batch of messages into one summary message. */
export function summarizeMessages(messages: readonly Message[]): Message {
const parts = messages.map(snippetFor).filter((p) => p.length > 0);
const body = truncate(parts.join('；'), MAX_SUMMARY);
return {
role: 'system',
content: `${SUMMARY_PREFIX} 早期对话共 ${messages.length} 条，已压缩为：${body}`,
};
}

export interface CompressionResult {
messages: Message[];
summarizedCount: number;
summary: Message;
}

/**
* Compress `messages` (whose first entry is the system prompt) when the
* non-system history exceeds `maxHistoryMessages`. The most recent
* `keepRecentMessages` entries stay verbatim; the cut never leaves an
* orphan tool result at the head of the kept tail. Returns null when no
* compression is needed.
*/
export function compressHistory(
messages: readonly Message[],
maxHistoryMessages: number,
keepRecentMessages: number,
summarize: (batch: readonly Message[]) => Message = summarizeMessages,
): CompressionResult | null {
if (messages.length === 0) return null;
const [head,...body] = messages;
if (body.length <= maxHistoryMessages) return null;

let cut = Math.max(1, body.length - Math.max(1, keepRecentMessages));
// Never split an assistant tool-call from its tool results at the head
// of the kept tail: fold leading orphan tool messages into the summary.
while (cut < body.length && body[cut].role === 'tool') cut++;
if (cut <= 0 || cut >= body.length) return null;

const folded = body.slice(0, cut);
const summary = summarize(folded);
return {
messages: [head, summary,...body.slice(cut)],
summarizedCount: folded.length,
summary,
};
}
