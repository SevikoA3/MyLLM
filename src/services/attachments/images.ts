import { Directory, File, Paths } from 'expo-file-system';

import {
  validateImageAttachment,
  validateImageAttachmentSet,
  type ImageAttachment,
  type ImageAttachmentRejection,
} from '../../domain/attachment';

const ATTACHMENTS_DIRECTORY = 'attachments';
let sequence = 0;

type ImagePickerResolver = () => Promise<Pick<
  typeof import('expo-image-picker'),
  'getMediaLibraryPermissionsAsync' | 'launchImageLibraryAsync'
>>;

export async function stageImageAttachment(
  existing: ImageAttachment[],
  resolveImagePicker: ImagePickerResolver = () => import('expo-image-picker'),
): Promise<
  | { kind: 'cancelled' }
  | { kind: 'rejected'; reason: ImageAttachmentRejection }
  | { kind: 'ready'; attachment: ImageAttachment }
> {
  try {
    const ImagePicker = await resolveImagePicker();
    const permission = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (permission.status === 'denied' && !permission.canAskAgain) {
      return { kind: 'rejected', reason: 'permission_denied' };
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      base64: false,
      exif: false,
      quality: 1,
    });
    if (result.canceled) return { kind: 'cancelled' };

    const asset = result.assets[0];
    const source = new File(asset.uri);
    const candidate = validateImageAttachment({
      id: newId(),
      name: asset.fileName ?? 'image',
      mimeType: asset.mimeType ?? null,
      byteSize: source.exists ? source.size : null,
      uri: asset.uri,
    });
    if (!candidate.ok) return { kind: 'rejected', reason: candidate.reason };

    const allowed = validateImageAttachmentSet([...existing, candidate.value]);
    if (!allowed.ok) return { kind: 'rejected', reason: allowed.reason };

    const target = new File(directory(), candidate.value.id + extension(candidate.value.mimeType));
    await source.copy(target);
    return { kind: 'ready', attachment: { ...candidate.value, uri: target.uri } };
  } catch {
    return { kind: 'rejected', reason: 'selection_failed' };
  }
}

export function deleteStagedImages(attachments: ImageAttachment[]): void {
  for (const attachment of attachments) {
    const file = new File(attachment.uri);
    if (file.exists) file.delete();
  }
}

export function deleteUnreferencedStagedImages(referenced: ImageAttachment[]): void {
  const target = new Directory(Paths.document, ATTACHMENTS_DIRECTORY);
  if (!target.exists) return;
  const referencedUris = new Set(referenced.map((attachment) => attachment.uri));
  for (const file of target.list()) {
    if (file instanceof File && !referencedUris.has(file.uri)) file.delete();
  }
}

export function clearStagedImages(): void {
  const target = new Directory(Paths.document, ATTACHMENTS_DIRECTORY);
  if (target.exists) target.delete();
}

function directory(): Directory {
  const target = new Directory(Paths.document, ATTACHMENTS_DIRECTORY);
  if (!target.exists) target.create({ intermediates: true });
  return target;
}

function extension(mimeType: ImageAttachment['mimeType']): string {
  return mimeType === 'image/png' ? '.png' : mimeType === 'image/webp' ? '.webp' : '.jpg';
}

function newId(): string {
  sequence += 1;
  return 'image_' + Date.now().toString(36) + '_' + sequence.toString(36);
}
