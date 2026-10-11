import { z } from 'zod';

import type { Attachment } from './attachment';

export const AssistantContentPartsSchema = z.array(z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }).strict(),
  z.object({ type: z.literal('tool'), callId: z.string().min(1) }).strict(),
]));
export type AssistantContentPart = z.infer<typeof AssistantContentPartsSchema>[number];

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  reasoningSummary: string | null;
  status: TurnStatus;
  attachments: Attachment[];
  contentParts?: AssistantContentPart[];
};

export type ConversationInputMessage = {
  role: 'user' | 'assistant';
  content: string;
  attachments?: Attachment[];
};

export type TurnStatus =
  | 'sending'
  | 'streaming'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted';

export type ConversationSummary = {
  id: string;
  title: string;
  updatedAt: number;
  endpointId: string;
  activeModelId: string;
  status: TurnStatus | null;
};

export type ConversationCursor = {
  updatedAt: number;
  id: string;
};

export function titleFromPrompt(prompt: string): string {
  const firstLine = prompt.trim().split(/\r?\n/, 1)[0] ?? '';
  return firstLine.length <= 60 ? firstLine : firstLine.slice(0, 57).trimEnd() + '...';
}
