import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import {
  parseEndpointExport,
  serializeEndpointExport,
  type EndpointExport,
  type EndpointProfile,
} from '../../domain/endpoint';
import {
  makeExportFilename,
  parseConversationExport,
  serializeConversationExport,
  type ConversationExport,
} from '../../domain/conversation-export';

const MODEL_EXPORT_FILE = 'myllm-model-overrides.json';
const ENDPOINT_EXPORT_FILE = 'myllm-endpoints.json';
const TRANSFER_DIRECTORY = 'myllm-transfer';

function transferDirectory(): Directory {
  const directory = new Directory(Paths.cache, TRANSFER_DIRECTORY);
  if (!directory.exists) directory.create({ intermediates: true });
  return directory;
}

async function pickJson(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/json',
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  return new File(result.assets[0].uri).text();
}

async function shareJson(name: string, text: string, dialogTitle: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('The share sheet is not available on this device.');
  }
  const target = new File(transferDirectory(), name);
  target.create({ overwrite: true });
  target.write(text);
  await Sharing.shareAsync(target.uri, { mimeType: 'application/json', dialogTitle });
}

export function pickOverridesJson(): Promise<string | null> {
  return pickJson();
}

export function shareOverridesJson(text: string): Promise<void> {
  return shareJson(MODEL_EXPORT_FILE, text, 'Export model overrides');
}

export async function pickEndpointProfiles(): Promise<EndpointExport | null> {
  const text = await pickJson();
  return text === null ? null : parseEndpointExport(text);
}

export function shareEndpointProfiles(profiles: EndpointProfile[]): Promise<void> {
  return shareJson(ENDPOINT_EXPORT_FILE, serializeEndpointExport(profiles), 'Export endpoint profiles');
}

export async function pickConversation(): Promise<ConversationExport | null> {
  const text = await pickJson();
  return text === null ? null : parseConversationExport(text);
}

export function shareConversation(value: ConversationExport): Promise<void> {
  return shareJson(
    makeExportFilename(value.title, value.exportedAt),
    serializeConversationExport(value),
    'Export conversation',
  );
}

export function clearTransferCache(): void {
  const directory = new Directory(Paths.cache, TRANSFER_DIRECTORY);
  if (directory.exists) directory.delete();
}
