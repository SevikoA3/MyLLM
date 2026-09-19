import { Link, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { StatusBar } from 'expo-status-bar';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useActiveEndpoint } from '../../src/features/setup/use-active-endpoint';
import { credentialStore } from '../../src/services/credentials/store';
import { clearDiagnosticRing } from '../../src/services/diagnostics/diagnostic-ring';
import { shareDiagnostics } from '../../src/services/diagnostics/diagnostic-transfer';
import { clearAllData } from '../../src/services/persistence/clear-all';
import { clearCatalogCache } from '../../src/services/persistence/catalog-files';
import { clearTransferCache } from '../../src/services/persistence/catalog-transfer';
import { conversationRepository } from '../../src/services/persistence/conversation-store';
import { endpointStore } from '../../src/services/persistence/endpoint-store';

const colors = {
  background: '#0b1326',
  surfaceLowest: '#060e20',
  surfaceLow: '#131b2e',
  surface: '#171f33',
  surfaceHigh: '#222a3d',
  border: '#86948a',
  outline: '#86948a',
  text: '#dae2fd',
  muted: '#bbcabf',
  primary: '#4edea3',
  secondary: '#4cd7f6',
  warning: '#ffb95f',
  error: '#ffb4ab',
  errorBackground: '#93000a',
  errorText: '#ffdad6',
  errorButtonText: '#690005',
} as const;

const fonts = {
  heading: 'Inter_600SemiBold',
  mono: 'JetBrainsMono_400Regular',
  monoMedium: 'JetBrainsMono_500Medium',
} as const;

const cardStyle = {
  gap: 12,
  padding: 12,
  borderRadius: 8,
  borderWidth: 1,
  borderColor: colors.border,
  backgroundColor: colors.surfaceLow,
} as const;

export default function SettingsScreen() {
  const router = useRouter();
  const { status, profile } = useActiveEndpoint();
  const [notice, setNotice] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  async function exportDiagnostics() {
    setExporting(true);
    try {
      await shareDiagnostics();
    } catch {
      Alert.alert('Could not export diagnostics', 'The system share sheet is unavailable.');
    } finally {
      setExporting(false);
    }
  }

  async function resetProtocol() {
    if (profile === null) {
      return;
    }
    setNotice(null);
    setResetting(true);
    try {
      await endpointStore.clearProtocol(profile.id);
      setNotice('Protocol cache cleared. Auto mode will try Responses first on the next request.');
    } catch {
      Alert.alert('Could not reset protocol compatibility', 'Try again later.');
    } finally {
      setResetting(false);
    }
  }

  async function clearData() {
    setClearing(true);
    try {
      await clearAllData({
        loadEndpoint: endpointStore.load,
        removeCredential: credentialStore.remove,
        clearCredentials: credentialStore.clearAll,
        clearEndpoint: endpointStore.clear,
        clearConversation: conversationRepository.clear,
        clearCatalog: clearCatalogCache,
        clearTransfers: clearTransferCache,
        clearDiagnostics: clearDiagnosticRing,
      });
      router.replace('/setup');
    } catch {
      setClearing(false);
      Alert.alert('Could not delete all data', 'Close the app and try again.');
    }
  }

  if (status === 'loading') {
    return <LoadingScreen />;
  }

  const endpointLabel = profile?.name ?? 'No endpoint configured';
  const endpointUrl = profile?.baseUrl ?? 'Connect an endpoint to configure this device.';
  const protocol = profile === null ? 'NO PROTOCOL' : 'PROTOCOL: ' + profile.protocol.toUpperCase();
  const credential = profile === null || profile.credentialRef === null ? 'NO CREDENTIAL' : 'CREDENTIAL SAVED';

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ gap: 16, padding: 16, paddingBottom: 32 }}>
        <View style={{ gap: 6, paddingVertical: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <SymbolView name={{ ios: 'terminal', android: 'terminal' }} size={14} tintColor={colors.primary} />
            <Text style={{ color: colors.primary, fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 0.8 }}>
              CONFIG // SYS.PREFS
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <Text style={{ flex: 1, color: colors.text, fontFamily: fonts.heading, fontSize: 22, lineHeight: 28 }}>
              Settings &amp; Maintenance
            </Text>
            <StatusBadge label={profile === null ? 'SETUP REQUIRED' : 'SECURE STORAGE'} tone={profile === null ? 'warning' : 'secondary'} />
          </View>
        </View>

        {notice !== null && (
          <View accessibilityRole="alert" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 8, backgroundColor: colors.surfaceHigh, padding: 12 }}>
            <SymbolView name={{ ios: 'checkmark.circle.fill', android: 'check_circle' }} size={18} tintColor={colors.primary} />
            <Text style={{ flex: 1, color: colors.text, fontFamily: fonts.mono, fontSize: 11, lineHeight: 16 }}>{notice}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Dismiss protocol reset message" onPress={() => setNotice(null)} hitSlop={6}>
              <SymbolView name={{ ios: 'xmark', android: 'close' }} size={16} tintColor={colors.muted} />
            </Pressable>
          </View>
        )}

        <Section label="ENDPOINT &amp; SECURITY" icon="endpoint" tone="primary">
          <View style={{ gap: 8, borderRadius: 4, backgroundColor: colors.surface, padding: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
              <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <Text numberOfLines={1} style={{ color: colors.text, fontFamily: fonts.heading, fontSize: 15 }}>
                  {endpointLabel}
                </Text>
                <Text numberOfLines={2} selectable style={{ color: profile === null ? colors.muted : colors.primary, fontFamily: fonts.mono, fontSize: 11, lineHeight: 16 }}>
                  {endpointUrl}
                </Text>
              </View>
              <StatusBadge label={profile === null ? 'OFFLINE' : 'CONFIGURED'} tone={profile === null ? 'warning' : 'primary'} />
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
              <Telemetry label={protocol} />
              <Telemetry label={credential} />
            </View>
          </View>

          <SettingsLink
            href="/setup"
            icon={{ ios: 'slider.horizontal.3', android: 'tune' }}
            title="Edit endpoint &amp; API key"
            body="Update base URL, authentication, and compatibility settings."
          />

          <View style={{ flexDirection: 'row', gap: 8, borderRadius: 4, backgroundColor: colors.surfaceLowest, padding: 10 }}>
            <SymbolView name={{ ios: 'lock.shield', android: 'enhanced_encryption' }} size={18} tintColor={colors.secondary} />
            <Text style={{ flex: 1, color: colors.muted, fontFamily: fonts.mono, fontSize: 10, lineHeight: 15 }}>
              API keys use secure device storage. Saved keys are never loaded into the form or diagnostic export.
            </Text>
          </View>
        </Section>

        <Section label="MODEL &amp; PROTOCOL" icon="model" tone="secondary">
          <SettingsLink
            href="/models"
            icon={{ ios: 'cpu', android: 'memory' }}
            title="Model catalog &amp; overrides"
            body="Select the active model and edit local metadata overrides."
          />
          <View style={{ gap: 8, borderRadius: 4, backgroundColor: colors.surface, padding: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <Text style={{ flex: 1, color: colors.text, fontFamily: fonts.heading, fontSize: 13 }}>
                Reset protocol compatibility
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Reset protocol compatibility"
                accessibilityHint="Clears the cached protocol choice for this endpoint"
                accessibilityState={{ busy: resetting, disabled: profile === null || resetting }}
                disabled={profile === null || resetting}
                onPress={() => void resetProtocol()}
                style={({ pressed }) => ({
                  minHeight: 44,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  borderRadius: 4,
                  backgroundColor: colors.surfaceHigh,
                  paddingHorizontal: 10,
                  opacity: profile === null || resetting ? 0.45 : pressed ? 0.75 : 1,
                })}>
                {resetting ? <ActivityIndicator size="small" color={colors.secondary} /> : <SymbolView name={{ ios: 'arrow.counterclockwise', android: 'refresh' }} size={15} tintColor={colors.primary} />}
                <Text style={{ color: colors.primary, fontFamily: fonts.monoMedium, fontSize: 10 }}>
                  {resetting ? 'RESETTING' : 'RESET'}
                </Text>
              </Pressable>
            </View>
            <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 10, lineHeight: 15 }}>
              Clears the cached protocol choice for this endpoint. Auto mode tries Responses first on the next request.
            </Text>
          </View>
        </Section>

        <Section label="DIAGNOSTICS &amp; AUDIT" icon="diagnostics" tone="warning">
          <View style={{ gap: 8, borderRadius: 4, backgroundColor: colors.surface, padding: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
              <Text style={{ color: colors.text, fontFamily: fonts.heading, fontSize: 13 }}>Export diagnostics bundle</Text>
              <StatusBadge label="SANITIZED" tone="warning" />
            </View>
            <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 10, lineHeight: 15 }}>
              Shares safe request metadata. Prompts, responses, tool output, and credentials are omitted.
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Export diagnostics"
            accessibilityHint="Open the system share sheet with sanitized diagnostics"
            accessibilityState={{ busy: exporting, disabled: exporting }}
            disabled={exporting}
            onPress={() => void exportDiagnostics()}
            style={({ pressed }) => ({
              minHeight: 48,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              borderRadius: 4,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surfaceHigh,
              opacity: exporting ? 0.7 : pressed ? 0.75 : 1,
            })}>
            {exporting ? <ActivityIndicator size="small" color={colors.secondary} /> : <SymbolView name={{ ios: 'square.and.arrow.up', android: 'ios_share' }} size={16} tintColor={colors.secondary} />}
            <Text style={{ color: colors.text, fontFamily: fonts.monoMedium, fontSize: 10 }}>
              {exporting ? 'OPENING SHARE SHEET' : 'SHARE DIAGNOSTIC JSON'}
            </Text>
          </Pressable>
        </Section>

        <Section label="DANGER ZONE // ZERO RETENTION" icon="danger" tone="error">
          <View style={{ gap: 10, borderRadius: 4, backgroundColor: colors.surface, padding: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <SymbolView name={{ ios: 'trash.fill', android: 'delete_forever' }} size={20} tintColor={colors.error} />
              <Text style={{ color: colors.text, fontFamily: fonts.heading, fontSize: 18 }}>Delete all app data</Text>
            </View>
            <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 10, lineHeight: 15 }}>
              Permanently deletes endpoints, saved credentials, conversations, model data, diagnostics, and transfer files.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Delete all app data"
              accessibilityHint="Open a confirmation before permanently deleting local data"
              onPress={() => setClearOpen(true)}
              style={({ pressed }) => ({
                minHeight: 48,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                borderRadius: 4,
                backgroundColor: colors.error,
                opacity: pressed ? 0.8 : 1,
              })}>
              <SymbolView name={{ ios: 'trash.fill', android: 'delete_forever' }} size={18} tintColor={colors.errorButtonText} />
              <Text style={{ color: colors.errorButtonText, fontFamily: fonts.heading, fontSize: 13 }}>DELETE ALL APP DATA</Text>
            </Pressable>
          </View>
        </Section>
      </ScrollView>
      <ClearDataSheet visible={clearOpen} busy={clearing} onCancel={() => setClearOpen(false)} onConfirm={() => void clearData()} />
    </SafeAreaView>
  );
}

function LoadingScreen() {
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="light" />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 16 }}>
        <ActivityIndicator color={colors.primary} />
        <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 13 }}>Loading settings.</Text>
      </View>
    </SafeAreaView>
  );
}

function Section({ label, icon, tone, children }: { label: string; icon: 'endpoint' | 'model' | 'diagnostics' | 'danger'; tone: 'primary' | 'secondary' | 'warning' | 'error'; children: ReactNode }) {
  const color = colors[tone];
  const symbol = {
    endpoint: { ios: 'terminal', android: 'router' },
    model: { ios: 'cpu', android: 'memory' },
    diagnostics: { ios: 'wrench.and.screwdriver', android: 'troubleshoot' },
    danger: { ios: 'exclamationmark.triangle.fill', android: 'warning' },
  } as const;
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 4 }}>
        <SymbolView name={symbol[icon]} size={14} tintColor={color} />
        <Text style={{ color, fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 0.7 }}>{label}</Text>
      </View>
      <View style={cardStyle}>{children}</View>
    </View>
  );
}

function SettingsLink({ href, icon, title, body }: { href: '/setup' | '/models'; icon: { ios: 'slider.horizontal.3' | 'cpu'; android: 'tune' | 'memory' }; title: string; body: string }) {
  return (
    <Link href={href} asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityHint={body}
        style={({ pressed }) => ({
          minHeight: 64,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          borderRadius: 4,
          backgroundColor: colors.surfaceHigh,
          paddingHorizontal: 10,
          opacity: pressed ? 0.75 : 1,
        })}>
        <View style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 4, backgroundColor: colors.surface }}>
          <SymbolView name={icon} size={18} tintColor={colors.primary} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={{ color: colors.text, fontFamily: fonts.heading, fontSize: 13 }}>{title}</Text>
          <Text numberOfLines={2} style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 10, lineHeight: 14 }}>{body}</Text>
        </View>
        <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right' }} size={16} tintColor={colors.muted} />
      </Pressable>
    </Link>
  );
}

function Telemetry({ label }: { label: string }) {
  return (
    <Text style={{ color: colors.muted, backgroundColor: colors.surfaceHigh, fontFamily: fonts.monoMedium, fontSize: 9, paddingHorizontal: 6, paddingVertical: 4, borderRadius: 4 }}>
      {label}
    </Text>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: 'primary' | 'secondary' | 'warning' }) {
  const color = colors[tone];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 4, backgroundColor: colors.surfaceHigh, paddingHorizontal: 6, paddingVertical: 4 }}>
      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: color }} />
      <Text style={{ color, fontFamily: fonts.monoMedium, fontSize: 9, letterSpacing: 0.3 }}>{label}</Text>
    </View>
  );
}

function ClearDataSheet({ visible, busy, onCancel, onConfirm }: { visible: boolean; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Modal
      transparent
      animationType="slide"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      navigationBarTranslucent
      visible={visible}
      onRequestClose={busy ? () => undefined : onCancel}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.55)' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss delete confirmation" disabled={busy} onPress={onCancel} style={{ flex: 1 }} />
        <View accessibilityViewIsModal style={{ gap: 16, borderTopWidth: 1, borderTopColor: colors.border, borderTopLeftRadius: 12, borderTopRightRadius: 12, backgroundColor: colors.surfaceLow, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 }}>
          <View style={{ alignItems: 'center' }}>
            <View style={{ width: 32, height: 4, borderRadius: 2, backgroundColor: colors.outline }} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: colors.errorBackground }}>
              <SymbolView name={{ ios: 'exclamationmark.triangle.fill', android: 'warning' }} size={22} tintColor={colors.errorText} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: colors.text, fontFamily: fonts.heading, fontSize: 18, lineHeight: 24 }}>Delete all app data?</Text>
              <Text style={{ color: colors.error, fontFamily: fonts.monoMedium, fontSize: 10 }}>PERMANENT SYSTEM PURGE</Text>
            </View>
          </View>
          <View style={{ gap: 4, borderRadius: 4, backgroundColor: colors.surfaceLowest, padding: 10 }}>
            <Text style={{ color: colors.text, fontFamily: fonts.mono, fontSize: 11, lineHeight: 16 }}>
              This removes all local data, clears saved credentials, and returns this device to endpoint setup.
            </Text>
            <Text style={{ color: colors.errorText, fontFamily: fonts.monoMedium, fontSize: 10, lineHeight: 14 }}>
              This action cannot be undone.
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><SheetButton label="Cancel" disabled={busy} onPress={onCancel} /></View>
            <View style={{ flex: 1 }}><SheetButton label={busy ? 'Deleting...' : 'Erase everything'} danger busy={busy} disabled={busy} onPress={onConfirm} /></View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function SheetButton({ label, danger = false, busy = false, disabled, onPress }: { label: string; danger?: boolean; busy?: boolean; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 48,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 4,
        backgroundColor: danger ? colors.error : colors.surfaceHigh,
        opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
      })}>
      <Text style={{ color: danger ? colors.errorButtonText : colors.text, fontFamily: fonts.heading, fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}
