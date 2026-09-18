export const TOOL_RISKS = ['read-only', 'write', 'dangerous'] as const;
export type ToolRisk = (typeof TOOL_RISKS)[number];

export const TOOL_APPROVALS = ['never', 'ask', 'always'] as const;
export type ToolApproval = (typeof TOOL_APPROVALS)[number];

export type ToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  risk: ToolRisk;
  approval: ToolApproval;
  target: string;
  sideEffect: string;
};

export type ToolCall = {
  callId: string;
  name: string;
  argumentsJson: string;
};

export type ToolResult = {
  callId: string;
  output: string;
  isError: boolean;
};

export type ToolExchange = {
  calls: ToolCall[];
  results: ToolResult[];
};

export type ToolPolicy = { approval: ToolApproval };
export const DEFAULT_TOOL_POLICY: ToolPolicy = { approval: 'ask' };

export type ToolCallStatus =
  | 'awaiting_approval'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'rejected'
  | 'timed_out'
  | 'cancelled'
  | 'interrupted';

export type ToolApprovalStatus = 'pending' | 'approved' | 'rejected' | 'not_required';

export type ToolActivity = ToolCall & {
  id: string;
  target: string;
  sideEffect: string;
  status: ToolCallStatus;
  approval: ToolApprovalStatus;
  result: ToolResult | null;
};

export type StoredToolCall = ToolActivity & { turnId: string };

export type ToolCallUpdate = Pick<ToolActivity, 'id' | 'status' | 'approval' | 'result'>;

export type ToolExecutor = ToolDefinition & {
  execute: (argumentsValue: Record<string, unknown>, signal: AbortSignal) => Promise<string>;
};

export type ToolRegistry = {
  definitions: () => ToolDefinition[];
  find: (name: string) => ToolExecutor | null;
};

export function validToolName(name: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(name);
}

export function parseToolArguments(value: string):
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; message: string } {
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { ok: false, message: 'Tool arguments must be a JSON object.' };
    }
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, message: 'Tool arguments are not valid JSON.' };
  }
}

export function requiresApproval(definition: ToolDefinition, policy: ToolPolicy): boolean {
  if (definition.risk !== 'read-only' || definition.approval === 'always') {
    return true;
  }
  if (policy.approval === 'always') {
    return true;
  }
  return policy.approval === 'ask' && definition.approval === 'ask';
}

export function toolError(callId: string, message: string): ToolResult {
  return { callId, output: JSON.stringify({ error: message }), isError: true };
}

export class ToolExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolExecutionError';
  }
}
