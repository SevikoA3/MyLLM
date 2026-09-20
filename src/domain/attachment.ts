import * as z from 'zod';

export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_IMAGE_ATTACHMENTS = 4;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_MESSAGE_IMAGE_BYTES = 12 * 1024 * 1024;

const ImageMimeTypeSchema = z.enum(IMAGE_MIME_TYPES);

export const ImageAttachmentSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    mimeType: ImageMimeTypeSchema,
    byteSize: z.number().int().positive().max(MAX_IMAGE_BYTES),
    uri: z.string().min(1),
  })
  .strict();
export type ImageAttachment = z.infer<typeof ImageAttachmentSchema>;

export type ImageAttachmentRejection =
  | 'type_not_allowed'
  | 'size_unknown'
  | 'size_too_large'
  | 'too_many'
  | 'message_too_large'
  | 'permission_denied'
  | 'selection_failed';

export function validateImageAttachment(input: {
  id: string;
  name: string;
  mimeType: string | null;
  byteSize: number | null;
  uri: string;
}):
  | { ok: true; value: ImageAttachment }
  | { ok: false; reason: ImageAttachmentRejection } {
  const mimeType = ImageMimeTypeSchema.safeParse(input.mimeType);
  if (!mimeType.success) return { ok: false, reason: 'type_not_allowed' };
  if (input.byteSize === null) return { ok: false, reason: 'size_unknown' };
  if (!Number.isInteger(input.byteSize) || input.byteSize <= 0 || input.byteSize > MAX_IMAGE_BYTES) {
    return { ok: false, reason: 'size_too_large' };
  }
  return { ok: true, value: { ...input, mimeType: mimeType.data, byteSize: input.byteSize } };
}

export function validateImageAttachmentSet(
  attachments: ImageAttachment[],
): { ok: true } | { ok: false; reason: ImageAttachmentRejection } {
  if (attachments.length > MAX_IMAGE_ATTACHMENTS) return { ok: false, reason: 'too_many' };
  return attachments.reduce((total, attachment) => total + attachment.byteSize, 0) <= MAX_MESSAGE_IMAGE_BYTES
    ? { ok: true }
    : { ok: false, reason: 'message_too_large' };
}

export function parseImageAttachments(value: unknown): ImageAttachment[] {
  const parsed = z.array(ImageAttachmentSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

export function orphanedImageAttachments(
  deleted: ImageAttachment[],
  retained: ImageAttachment[],
): ImageAttachment[] {
  const retainedUris = new Set(retained.map((attachment) => attachment.uri));
  return deleted.filter((attachment) => !retainedUris.has(attachment.uri));
}

export const IMAGE_ATTACHMENT_ERROR_COPY: Record<ImageAttachmentRejection, string> = {
  type_not_allowed: 'Only PNG, JPEG, and WebP images are supported.',
  size_unknown: 'Image size could not be read.',
  size_too_large: 'Image is larger than the 8 MB limit.',
  too_many: 'One message can contain at most 4 images.',
  message_too_large: 'Images in one message cannot exceed 12 MB.',
  permission_denied: 'Photo library permission was denied.',
  selection_failed: 'Image selection failed. Try again.',
};
