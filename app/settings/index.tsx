import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '../../src/ui/theme';

export default function SettingsScreen() {
  const theme = useTheme();
  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: theme.colors.background }}>
      <View style={{ padding: theme.spacing.screen, gap: theme.spacing.screen }}>
        <Text style={{ color: theme.colors.text, fontSize: theme.typography.title, fontWeight: '700' }}>
          Settings
        </Text>
        <Text style={{ color: theme.colors.textMuted, fontSize: theme.typography.body }}>
          Endpoint, model, dan compaction settings. Compaction ditambahkan pada Phase 10.
        </Text>

        <Link href="/models" asChild>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Buka daftar model"
            style={{
              minHeight: 48,
              justifyContent: 'center',
              paddingHorizontal: theme.spacing.screen,
              borderRadius: theme.radius.control,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
            }}>
            <Text style={{ color: theme.colors.text, fontSize: theme.typography.body, fontWeight: '600' }}>
              Model
            </Text>
          </Pressable>
        </Link>

        <Link href="/setup" asChild>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ubah endpoint dan API key"
            style={{
              minHeight: 48,
              justifyContent: 'center',
              paddingHorizontal: theme.spacing.screen,
              borderRadius: theme.radius.control,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
            }}>
            <Text style={{ color: theme.colors.text, fontSize: theme.typography.body, fontWeight: '600' }}>
              Endpoint dan API key
            </Text>
          </Pressable>
        </Link>
      </View>
    </SafeAreaView>
  );
}
