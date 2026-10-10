import { validateAttachment, validateAttachmentSet } from '../../domain/attachment';
import type { ConversationInputMessage } from '../../domain/conversation';

export async function attachmentDataUrls(
  history: ConversationInputMessage[],
  resolveFileSystem: () => Promise<Pick<typeof import('expo-file-system'), 'File'>> = () => import('expo-file-system'),
): Promise<Map<string, string>> {
  if (!history.some((message) => (message.attachments?.length ?? 0) > 0)) return new Map();
  const { File } = await resolveFileSystem();
  const files = new Map<string, { file: InstanceType<typeof File>; mimeType: string }>();
  for (const message of history) {
    const attachments = (message.attachments ?? []).map((attachment) => {
      const file = new File(attachment.uri);
      const fileInfo = file.info();
      const valid = validateAttachment({ ...attachment, byteSize: fileInfo.exists ? fileInfo.size ?? null : null });
      if (!valid.ok) throw new Error('A staged attachment is unavailable or no longer valid.');
      files.set(attachment.id, { file, mimeType: attachment.mimeType });
      return valid.value;
    });
    if (!validateAttachmentSet(attachments).ok) throw new Error('Attachments exceed the message limit.');
  }
  const urls = new Map<string, string>();
  for (const [id, { file, mimeType }] of files) {
    urls.set(id, 'data:' + mimeType + ';base64,' + await file.base64());
  }
  return urls;
}
