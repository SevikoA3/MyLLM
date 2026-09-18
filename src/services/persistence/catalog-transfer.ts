import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export async function pickOverridesJson(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/json',
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) {
    return null;
  }
  return new File(result.assets[0].uri).text();
}

export async function shareOverridesJson(text: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('The share sheet is not available on this device.');
  }
  const target = new File(Paths.cache, 'myllm-model-overrides.json');
  target.create({ overwrite: true });
  target.write(text);
  await Sharing.shareAsync(target.uri, {
    mimeType: 'application/json',
    dialogTitle: 'Export model overrides',
  });
}
