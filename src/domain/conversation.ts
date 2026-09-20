import type { ImageAttachment } from './attachment';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  reasoningSummary: string | null;
  status: TurnStatus;
  attachments: ImageAttachment[];
};

export type ConversationInputMessage = {
  role: 'user' | 'assistant';
  content: string;
  attachments?: ImageAttachment[];
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
