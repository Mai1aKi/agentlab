// Core types for the AgentLab runtime: messages, tool calls, models, traces.

export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface Message {
  role: Role;
  content: string;
  /** Present on assistant messages that request a tool call. */
  toolCall?: ToolCall;
  /** Present on assistant messages that request several tool calls in
   *  one turn (Day 1). `toolCall` then mirrors the first entry. */
  toolCalls?: ToolCall[];
  /** Present on tool messages: which call this result answers. */
  toolCallId?: string;
  toolName?: string;
  /** Present on assistant messages that carry a plan (Day 3): the raw
   *  step titles, in order. The rendered checklist is in `content`. */
  plan?: string[];
}

/** One model turn: either speak to the user, call one tool, or call
 *  several tools at once (executed sequentially by the runtime), or —
 *  before acting — produce a plan checklist (Day 3, Planner-Executor). */
export type ModelReply =
  | { type: 'text'; content: string }
  | { type: 'toolCall'; call: ToolCall }
  | { type: 'toolCalls'; calls: ToolCall[] }
  | { type: 'plan'; steps: string[] };

/** The tool description a model sees. Parameter values are type names;
 *  a trailing '?' marks an optional parameter. */
export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, string>;
}

/** Anything that can play the "brain" role: the built-in mock model,
 *  an OpenAI-compatible API, or a test stub. When `onTextDelta` is
 *  given, a model that supports streaming (Day 8) reports each piece
 *  of its text answer as it arrives, so the UI can show it per-word
 *  instead of all at once; the returned reply is unchanged. */
export interface ChatModel {
  readonly name: string;
  complete(
    messages: Message[],
    tools: ToolSpec[],
    onTextDelta?: (delta: string) => void,
  ): Promise<ModelReply>;
}

/** Cost of one run (Day 10): model steps taken, tool calls made (and
 *  how many failed), and wall-clock duration in milliseconds. */
export interface RunStats {
  steps: number;
  toolCalls: number;
  toolErrors: number;
  durationMs: number;
}

/** One entry in the run trace — the same events the UI visualizes. */
export type TraceEvent =
  | { type: 'user'; content: string }
  | { type: 'modelReply'; step: number; reply: ModelReply }
  | { type: 'toolResult'; call: ToolCall; result: string; isError: boolean }
  | { type: 'toolRetry'; call: ToolCall; attempt: number; result: string }
  | { type: 'toolDisabled'; call: ToolCall; result: string }
  | { type: 'memoryCompressed'; summarizedCount: number; keptCount: number; summary: string }
  | { type: 'planCreated'; steps: string[] }
  | { type: 'planStepDone'; index: number; title: string }
  | { type: 'subAgentStarted'; role: 'researcher' | 'writer'; instruction: string }
  | { type: 'subAgentDone'; role: 'researcher' | 'writer'; summary: string }
  | { type: 'runStats'; stats: RunStats }
  | { type: 'final'; content: string }
  | { type: 'stopped'; reason: string };
