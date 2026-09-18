import { Link, useRouter } from 'expo-router';
import { Alert, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { credentialStore } from '../../src/services/credentials/store';
import { clearDiagnosticRing } from '../../src/services/diagnostics/diagnostic-ring';
import { shareDiagnostics } from '../../src/services/diagnostics/diagnostic-transfer';
import { clearAllData } from '../../src/services/persistence/clear-all';
import { clearCatalogCache } from '../../src/services/persistence/catalog-files';
import { clearTransferCache } from '../../src/services/persistence/catalog-transfer';
import { conversationRepository } from '../../src/services/persistence/conversation-store';
import { endpointStore } from '../../src/services/persistence/endpoint-store';
import { useActiveEndpoint } from '../../src/features/setup/use-active-endpoint';
import { useTheme } from '../../src/ui/theme';

export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { profile } = useActiveEndpoint();

  const confirmClearAll = () => {
    Alert.alert(
      'Delete all app data?',
      'This removes conversations, endpoint settings, model cache, overrides, diagnostics, and saved credentials.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete all data',
          style: 'destructive',
          onPress: () => {
            void clearAllData({
              loadEndpoint: endpointStore.load,
              removeCredential: credentialStore.remove,
              clearCredentials: credentialStore.clearAll,
              clearEndpoint: endpointStore.clear,
              clearConversation: conversationRepository.clear,
              clearCatalog: clearCatalogCache,
              clearTransfers: clearTransferCache,
              clearDiagnostics: clearDiagnosticRing,
            })
              .then(() => router.replace('/setup'))
              .catch(() => Alert.alert('Could not delete all data', 'Close the app and try again.'));
          },
        },
      ],
    );
  };

  const exportDiagnostics = () => {
    void shareDiagnostics().catch(() =>
      Alert.alert('Could not export diagnostics', 'The system share sheet is unavailable.'),
    );
  };

  const resetProtocol = () => {
    if (profile === null) {
      return;
    }
    void endpointStore
      .clearProtocol(profile.id)
      .then(() => {
        Alert.alert('Protocol compatibility reset', 'Auto mode will try Responses again next time.');
      })
      .catch(() => Alert.alert('Could not reset protocol compatibility', 'Try again later.'));
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: theme.colors.background }}>
      <View style={{ padding: theme.spacing.screen, gap: theme.spacing.screen }}>
        <Text style={{ color: theme.colors.text, fontSize: theme.typography.title, fontWeight: '700' }}>
          Settings
        </Text>
        <Text style={{ color: theme.colors.textMuted, fontSize: theme.typography.body }}>
          Endpoint, model, and compaction settings.
        </Text>

        <Link href="/models" asChild>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open model list"
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
            accessibilityLabel="Edit endpoint and API key"
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
              Endpoint and API key
            </Text>
          </Pressable>
        </Link>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Export diagnostics"
          onPress={exportDiagnostics}
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
            Export diagnostics
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Delete all app data"
          onPress={confirmClearAll}
          style={{
            minHeight: 48,
            justifyContent: 'center',
            paddingHorizontal: theme.spacing.screen,
            borderRadius: theme.radius.control,
            borderWidth: 1,
            borderColor: theme.colors.danger,
            backgroundColor: theme.colors.surface,
          }}>
          <Text style={{ color: theme.colors.danger, fontSize: theme.typography.body, fontWeight: '600' }}>
            Delete all app data
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Reset protocol compatibility"
          disabled={profile === null}
          onPress={resetProtocol}
          style={{
            minHeight: 48,
            justifyContent: 'center',
            paddingHorizontal: theme.spacing.screen,
            borderRadius: theme.radius.control,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            opacity: profile === null ? 0.5 : 1,
          }}>
          <Text style={{ color: theme.colors.text, fontSize: theme.typography.body, fontWeight: '600' }}>
            Reset protocol compatibility
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
