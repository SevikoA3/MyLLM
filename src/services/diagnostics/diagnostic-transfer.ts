import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { parseDiagnosticEntry, readDiagnosticRing } from './diagnostic-ring';

export async function shareDiagnostics(): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('The share sheet is not available on this device.');
  }
  const lines = (await readDiagnosticRing())
    .split('\n')
    .filter((line) => line.length > 0)
    .flatMap((line) => {
      try {
        const value: unknown = JSON.parse(line);
        const safe = parseDiagnosticEntry(value);
        return safe === null ? [] : [safe];
      } catch {
        return [];
      }
    });
  const target = new File(Paths.cache, 'myllm-diagnostics.json');
  target.create({ overwrite: true });
  target.write(JSON.stringify({ schemaVersion: 1, entries: lines }, null, 2));
  await Sharing.shareAsync(target.uri, {
    mimeType: 'application/json',
    dialogTitle: 'Export diagnostics',
  });
}
