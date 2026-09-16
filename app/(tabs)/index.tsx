import { Text, View } from 'react-native';

import { InfoBlock, LinkCard, Screen } from '../../src/ui/components';
import { useTheme } from '../../src/ui/theme';

export default function HomeScreen() {
  const theme = useTheme();
  return (
    <Screen>
      <View style={{ flex: 1, gap: theme.spacing.screen, padding: theme.spacing.screen }}>
        <Text style={{ color: theme.colors.text, fontSize: theme.typography.title, fontWeight: '700' }}>
          MyLLM
        </Text>
        <Text style={{ color: theme.colors.textMuted, fontSize: theme.typography.body }}>
          Endpoint aktif dan katalog model siap. Chat UI diisi pada Phase 4.
        </Text>

        <LinkCard
          href="/models"
          label="Model"
          description="Pilih model aktif dan lihat metadata yang tersedia"
        />

        <InfoBlock
          title="Langkah berikutnya"
          body="Buka tab Model, tekan Refresh untuk mengambil daftar terbaru, lalu ketuk model yang ingin dipakai."
        />
      </View>
    </Screen>
  );
}
