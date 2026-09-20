import { validateImageAttachment, type ImageAttachment } from '../../domain/attachment';

/** Max 8 MB source image. This one bounded Base64 value exists only while sending. */
export async function imageDataUrl(attachment: ImageAttachment): Promise<string> {
  const { File } = await import('expo-file-system');
  const file = new File(attachment.uri);
  const valid = validateImageAttachment({ ...attachment, byteSize: file.exists ? file.size : null });
  if (!valid.ok) throw new Error('The staged image is unavailable or no longer valid.');
  return 'data:' + attachment.mimeType + ';base64,' + await file.base64();
}
