import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { redactText } from '../../domain/error';
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
  | { kind: 'rejected'; reason: AttachmentRejection; detail?: string; operation?: 'select' | 'read' | 'save' }
  | { kind: 'ready'; attachment: Attachment }
> {
  let source: File | null = null;
  let target: File | null = null;
  let keepTarget = false;
  let operation: 'select' | 'read' | 'save' = 'select';
  try {
    const DocumentPicker = await resolveDocumentPicker();
    const result = await DocumentPicker.getDocumentAsync({
      type: allowedMimeTypes,
      // Cache picker Android berada di luar scope proyek Expo Go; salin grant URI ke storage sendiri.
      copyToCacheDirectory: Platform.OS !== 'android',
      multiple: false,
      base64: false,
    });
    if (result.canceled) return { kind: 'cancelled' };

    const asset = result.assets[0];
    if (!asset) return { kind: 'rejected', reason: 'selection_failed' };
    operation = 'read';
    source = new File(asset.uri);
    if (!allowedMimeTypes.some((mimeType) => mimeType === asset.mimeType)) {
      return { kind: 'rejected', reason: 'type_not_allowed' };
    }
    operation = 'save';
    const id = newId();
    target = new File(directory(), id);
    await source.copy(target);
    operation = 'read';
    const targetInfo = target.info();
    const candidate = validateAttachment({
      id,
      name: asset.name,
      mimeType: asset.mimeType ?? null,
      byteSize: targetInfo.exists ? targetInfo.size ?? null : null,
      uri: target.uri,
    });
    if (!candidate.ok) return { kind: 'rejected', reason: candidate.reason };

    const allowed = validateAttachmentSet([...existing, candidate.value]);
    if (!allowed.ok) return { kind: 'rejected', reason: allowed.reason };

    keepTarget = true;
    return { kind: 'ready', attachment: candidate.value };
  } catch (error) {
    return { kind: 'rejected', reason: 'selection_failed', operation,
      ...(error instanceof Error ? { detail: redactText(error.message) } : {}),
    };
  } finally {
    if (target !== null && !keepTarget) {
      try { target.delete(); } catch { /* Copy yang gagal mungkin belum membuat file target. */ }
    }
    if (source?.uri.startsWith(Paths.cache.uri)) {
      try { source.delete(); } catch { /* Cache sementara dapat dibersihkan Android tanpa membatalkan staging. */ }
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
