import { Directory, File, Paths } from 'expo-file-system';

import {
  validateAttachment,
  validateAttachmentSet,
  type Attachment,
  type AttachmentRejection,
} from '../../domain/attachment';

const ATTACHMENTS_DIRECTORY = 'attachments';
let sequence = 0;

type DocumentPickerResolver = () => Promise<Pick<
  typeof import('expo-document-picker'),
  'getDocumentAsync'
>>;

export async function stageAttachment(
  existing: Attachment[],
  allowedMimeTypes: Attachment['mimeType'][],
  resolveDocumentPicker: DocumentPickerResolver = () => import('expo-document-picker'),
): Promise<
  | { kind: 'cancelled' }
  | { kind: 'rejected'; reason: AttachmentRejection }
  | { kind: 'ready'; attachment: Attachment }
> {
  let source: File | null = null;
  try {
    const DocumentPicker = await resolveDocumentPicker();
    const result = await DocumentPicker.getDocumentAsync({
      type: allowedMimeTypes,
      copyToCacheDirectory: true,
      multiple: false,
      base64: false,
    });
    if (result.canceled) return { kind: 'cancelled' };

    const asset = result.assets[0];
    if (!asset) return { kind: 'rejected', reason: 'selection_failed' };
    source = new File(asset.uri);
    if (!allowedMimeTypes.some((mimeType) => mimeType === asset.mimeType)) {
      return { kind: 'rejected', reason: 'type_not_allowed' };
    }
    const candidate = validateAttachment({
      id: newId(),
      name: asset.name,
      mimeType: asset.mimeType ?? null,
      byteSize: source.exists ? source.size : null,
      uri: asset.uri,
    });
    if (!candidate.ok) return { kind: 'rejected', reason: candidate.reason };

    const allowed = validateAttachmentSet([...existing, candidate.value]);
    if (!allowed.ok) return { kind: 'rejected', reason: allowed.reason };

    const target = new File(directory(), candidate.value.id);
    await source.copy(target);
    return { kind: 'ready', attachment: { ...candidate.value, uri: target.uri } };
  } catch {
    return { kind: 'rejected', reason: 'selection_failed' };
  } finally {
    if (source?.uri.startsWith(Paths.cache.uri)) {
      try { if (source.exists) source.delete(); } catch { /* Cache sementara dapat dibersihkan Android tanpa membatalkan staging. */ }
    }
  }
}

export function deleteStagedAttachments(attachments: Attachment[]): void {
  for (const attachment of attachments) {
    const file = new File(attachment.uri);
    if (file.exists) file.delete();
  }
}

export function deleteUnreferencedStagedAttachments(referenced: Attachment[]): void {
  const target = new Directory(Paths.document, ATTACHMENTS_DIRECTORY);
  if (!target.exists) return;
  const referencedUris = new Set(referenced.map((attachment) => attachment.uri));
  for (const file of target.list()) {
    if (file instanceof File && !referencedUris.has(file.uri)) file.delete();
  }
}

export function clearStagedAttachments(): void {
  const target = new Directory(Paths.document, ATTACHMENTS_DIRECTORY);
  if (target.exists) target.delete();
}

function directory(): Directory {
  const target = new Directory(Paths.document, ATTACHMENTS_DIRECTORY);
  if (!target.exists) target.create({ intermediates: true });
  return target;
}

function newId(): string {
  sequence += 1;
  return 'attachment_' + Date.now().toString(36) + '_' + sequence.toString(36);
}
