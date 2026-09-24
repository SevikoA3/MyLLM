import { z } from 'zod';

import { CompactionSummarySchema } from './compaction';
import { TOOL_APPROVAL_STATUSES, TOOL_CALL_STATUSES } from './tool';

export const CONVERSATION_EXPORT_SCHEMA_VERSION = 1 as const;

const ExportToolCallSchema = z
  .object({
    callId: z.string().trim().min(1),
    name: z.string().trim().min(1),
    argumentsJson: z.string(),
    target: z.string(),
    sideEffect: z.string(),
    status: z.enum(TOOL_CALL_STATUSES),
    approval: z.enum(TOOL_APPROVAL_STATUSES),
    result: z
      .object({
        callId: z.string(),
        output: z.string(),
        isError: z.boolean(),
      })
      .nullable(),
  })
  .strict();

const ExportTurnSchema = z
  .object({
    ordinal: z.number().int().positive(),
    userText: z.string(),
    assistantText: z.string(),
    reasoningSummary: z.string().nullable(),
    status: z.enum(['sending', 'streaming', 'completed', 'failed', 'cancelled', 'interrupted']),
    modelId: z.string().trim().min(1),
    endpointId: z.string().trim().min(1),
    reasoningSetting: z.string().nullable(),
    outputCeiling: z.number().int().positive().nullable(),
    responseId: z.string().nullable(),
    toolCalls: z.array(ExportToolCallSchema),
    usageRaw: z.record(z.string(), z.unknown()).nullable(),
    timingMs: z.object({
      requestStart: z.number().nullable(),
      firstEvent: z.number().nullable(),
      firstVisibleToken: z.number().nullable(),
      completed: z.number().nullable(),
    }),
  })
  .strict();

const ExportCompactionSchema = z
  .object({
    sourceStartOrdinal: z.number().int().positive(),
    sourceEndOrdinal: z.number().int().positive(),
    modelId: z.string().trim().min(1),
    promptVersion: z.number().int().positive(),
    summary: CompactionSummarySchema,
    status: z.enum(['active', 'failed', 'interrupted']),
  })
  .strict();

export const ConversationExportSchema = z
  .object({
    schemaVersion: z.literal(CONVERSATION_EXPORT_SCHEMA_VERSION),
    exportedAt: z.string().datetime(),
    sourceConversationId: z.string().trim().min(1),
    title: z.string().trim().min(1),
    endpointId: z.string().trim().min(1),
    modelId: z.string().trim().min(1),
    turns: z.array(ExportTurnSchema),
    compactions: z.array(ExportCompactionSchema),
  })
  .strict()
  .superRefine((value, context) => {
    const ordinals = new Set<number>();
    value.turns.forEach((turn, index) => {
      if (turn.endpointId !== value.endpointId) {
        context.addIssue({
          code: 'custom',
          path: ['turns', index, 'endpointId'],
          message: 'Every imported turn must belong to the conversation endpoint.',
        });
      }
      if (ordinals.has(turn.ordinal)) {
        context.addIssue({ code: 'custom', path: ['turns', index, 'ordinal'], message: 'Turn ordinals must be unique.' });
      }
      ordinals.add(turn.ordinal);
    });
  });

export type ConversationExport = z.infer<typeof ConversationExportSchema>;
export type ExportTurn = z.infer<typeof ExportTurnSchema>;
export type ExportCompaction = z.infer<typeof ExportCompactionSchema>;
export type ExportToolCall = z.infer<typeof ExportToolCallSchema>;

export function parseConversationExport(text: string): ConversationExport {
  return ConversationExportSchema.parse(JSON.parse(text) as unknown);
}

export function serializeConversationExport(value: ConversationExport): string {
  return JSON.stringify(ConversationExportSchema.parse(value), null, 2);
}

export function makeExportFilename(title: string, exportedAt: string): string {
  const safe = title.replace(/[^A-Za-z0-9 _-]/g, '_').trim().slice(0, 40) || 'conversation';
  const date = exportedAt.slice(0, 10);
  return 'myllm-conversation-' + safe + '-' + date + '.json';
}
