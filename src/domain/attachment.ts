import * as z from 'zod';

import type { EndpointProfile } from './endpoint';
import type { InputModality } from './model';

export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const DOCUMENT_MIME_TYPES = [
  'application/pdf', 'text/plain', 'text/markdown', 'application/json',
  'text/csv', 'text/tab-separated-values', 'text/html', 'text/xml', 'application/xml',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/rtf', 'text/rtf', 'application/vnd.oasis.opendocument.text',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
] as const;
export const MAX_ATTACHMENTS = 10;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_MESSAGE_ATTACHMENT_BYTES = 80 * 1024 * 1024;

const AttachmentMimeTypeSchema = z.enum([...IMAGE_MIME_TYPES, ...DOCUMENT_MIME_TYPES]);

export const AttachmentSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    mimeType: AttachmentMimeTypeSchema,
    byteSize: z.number().int().positive().max(MAX_ATTACHMENT_BYTES),
    uri: z.string().min(1),
  })
  .strict();
export type Attachment = z.infer<typeof AttachmentSchema>;

export type AttachmentRejection =
  | 'type_not_allowed'
  | 'size_unknown'
  | 'size_too_large'
  | 'too_many'
  | 'message_too_large'
  | 'selection_failed';

export function validateAttachment(input: {
  id: string;
  name: string;
  mimeType: string | null;
  byteSize: number | null;
  uri: string;
}):
  | { ok: true; value: Attachment }
  | { ok: false; reason: AttachmentRejection } {
  const mimeType = AttachmentMimeTypeSchema.safeParse(input.mimeType);
  if (!mimeType.success) return { ok: false, reason: 'type_not_allowed' };
  if (input.byteSize === null) return { ok: false, reason: 'size_unknown' };
  if (!Number.isInteger(input.byteSize) || input.byteSize <= 0 || input.byteSize > MAX_ATTACHMENT_BYTES) {
    return { ok: false, reason: 'size_too_large' };
  }
  const parsed = AttachmentSchema.safeParse(input);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, reason: 'selection_failed' };
}

export function validateAttachmentSet(
  attachments: Attachment[],
): { ok: true } | { ok: false; reason: AttachmentRejection } {
  if (attachments.length > MAX_ATTACHMENTS) return { ok: false, reason: 'too_many' };
  return attachments.reduce((total, attachment) => total + attachment.byteSize, 0) <= MAX_MESSAGE_ATTACHMENT_BYTES
    ? { ok: true }
    : { ok: false, reason: 'message_too_large' };
}

export function parseAttachments(value: unknown): Attachment[] {
  const parsed = z.array(AttachmentSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

export function orphanedAttachments(
  deleted: Attachment[],
  retained: Attachment[],
): Attachment[] {
  const retainedUris = new Set(retained.map((attachment) => attachment.uri));
  return deleted.filter((attachment) => !retainedUris.has(attachment.uri));
}

export function attachmentMimeTypes(
  protocol: EndpointProfile['protocol'] | undefined,
  modalities: InputModality[],
): Attachment['mimeType'][] {
  if (protocol === undefined) return [];
  return [
    ...(modalities.includes('image') ? IMAGE_MIME_TYPES : []),
    ...(modalities.includes('file') ? protocol === 'chat-completions' ? ['application/pdf' as const] : DOCUMENT_MIME_TYPES : []),
  ];
}

export const ATTACHMENT_ERROR_COPY: Record<AttachmentRejection, string> = {
  type_not_allowed: 'This file type is not supported by the selected model and protocol.',
  size_unknown: 'File size could not be read.',
  size_too_large: 'File is larger than the 10 MB limit or is empty.',
  too_many: 'One message can contain at most 10 attachments.',
  message_too_large: 'Attachments in one message cannot exceed 80 MB.',
  selection_failed: 'File selection failed. Try again.',
};
