import { Link, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useActiveEndpoint } from '../../src/features/setup/use-active-endpoint';
import { credentialStore } from '../../src/services/credentials/store';
import { clearDiagnosticRing } from '../../src/services/diagnostics/diagnostic-ring';
import { shareDiagnostics } from '../../src/services/diagnostics/diagnostic-transfer';
import { clearAllData } from '../../src/services/persistence/clear-all';
import { clearCatalogCache } from '../../src/services/persistence/catalog-files';
import { clearTransferCache } from '../../src/services/persistence/catalog-transfer';
import { clearStagedImages } from '../../src/services/attachments/images';
import { conversationRepository } from '../../src/services/persistence/conversation-store';
import { endpointStore } from '../../src/services/persistence/endpoint-store';
import { webToolsCredentialId, webToolsStore } from '../../src/services/persistence/web-tools-store';
import { createWebToolsSettings, normalizeGatewayUrl, type WebSearchProvider } from '../../src/domain/web-tools';
import { testWebGateway } from '../../src/services/tools/gateway';
import { colors, fonts, typography } from '../../src/ui/tokens';
import { BottomSheet } from '../../src/ui/bottom-sheet';

const cardStyle = {
  gap: 12,
  padding: 12,
  borderRadius: 8,
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
  const [webToolsReady, setWebToolsReady] = useState(false);
  const [webToolsEnabled, setWebToolsEnabled] = useState(false);
  const [webSearchProvider, setWebSearchProvider] = useState<WebSearchProvider>('gateway');
  const [gatewayUrl, setGatewayUrl] = useState('');
  const [gatewayEngines, setGatewayEngines] = useState('bing');
  const [gatewayToken, setGatewayToken] = useState('');
  const [gatewayTokenSaved, setGatewayTokenSaved] = useState(false);
  const [savingWebTools, setSavingWebTools] = useState(false);
  const [testingGateway, setTestingGateway] = useState(false);

  useEffect(() => {
    let active = true;
    void webToolsStore.load().then(async (settings) => {
      const token = await credentialStore.read(webToolsCredentialId(settings.provider));
      if (!active) return;
      setWebToolsEnabled(settings.enabled);
      setWebSearchProvider(settings.provider);
      setGatewayUrl(settings.baseUrl ?? '');
      setGatewayEngines(settings.engines);
      setGatewayTokenSaved(token !== null && token.trim().length > 0);
      setWebToolsReady(true);
    }).catch(() => {
      if (!active) return;
      setNotice('Web tools settings could not be loaded.');
      setWebToolsReady(true);
    });
    return () => { active = false; };
  }, []);

  async function selectWebSearchProvider(provider: WebSearchProvider) {
    setNotice(null);
    setWebSearchProvider(provider);
    setGatewayToken('');
    try {
      const token = await credentialStore.read(webToolsCredentialId(provider));
      setGatewayTokenSaved(token !== null && token.trim().length > 0);
    } catch {
      setGatewayTokenSaved(false);
      setNotice('Web tools credentials could not be loaded.');
    }
  }

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

  async function saveWebTools() {
    setNotice(null);
    let settings;
    try {
      settings = createWebToolsSettings({
        enabled: webToolsEnabled,
        provider: webSearchProvider,
        baseUrl: gatewayUrl.trim().length === 0 ? null : gatewayUrl,
        engines: gatewayEngines,
      });
    } catch (error) {
      Alert.alert('Could not save web tools', error instanceof Error ? error.message : 'Check the gateway URL.');
      return;
    }
    if (settings.enabled && gatewayToken.trim().length === 0 && !gatewayTokenSaved) {
      Alert.alert(
        webSearchProvider === 'exa' ? 'Exa API key required' : 'Gateway token required',
        webSearchProvider === 'exa' ? 'Enter an Exa API key before enabling web search.' : 'Enter a bearer token before enabling web tools.',
      );
      return;
    }
    setSavingWebTools(true);
    try {
      if (gatewayToken.trim().length > 0) {
        await credentialStore.save(webToolsCredentialId(settings.provider), gatewayToken.trim());
        setGatewayToken('');
        setGatewayTokenSaved(true);
      }
      await webToolsStore.save(settings);
      setWebSearchProvider(settings.provider);
      setGatewayUrl(settings.baseUrl ?? '');
      setGatewayEngines(settings.engines);
      setNotice('Web tools settings saved.');
    } catch {
      Alert.alert('Could not save web tools', 'Secure storage is unavailable. Try again later.');
    } finally {
      setSavingWebTools(false);
    }
  }

  async function testGateway() {
    let baseUrl: string;
    try {
      baseUrl = normalizeGatewayUrl(gatewayUrl);
    } catch (error) {
      Alert.alert('Could not test gateway', error instanceof Error ? error.message : 'Check the gateway URL.');
      return;
    }
    setNotice(null);
    setTestingGateway(true);
    try {
      await testWebGateway(baseUrl);
      setNotice('Connected');
    } catch {
      Alert.alert('Could not connect to gateway', 'The gateway health check failed. Verify the HTTPS URL and try again.');
    } finally {
      setTestingGateway(false);
    }
  }

  async function clearData() {
    setClearing(true);
    try {
      await clearAllData({
        loadAllEndpoints: endpointStore.loadAll,
        removeCredential: credentialStore.remove,
        clearCredentials: credentialStore.clearAll,
        clearEndpoint: endpointStore.clear,
        clearConversation: conversationRepository.clear,
        clearCatalog: clearCatalogCache,
        clearTransfers: clearTransferCache,
        clearAttachments: clearStagedImages,
        clearDiagnostics: clearDiagnosticRing,
        clearWebTools: webToolsStore.clear,
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
            href="/settings/endpoints"
            icon={{ ios: 'server.rack', android: 'dns' }}
            title="Endpoint profiles"
            body="Switch, import, export, or delete endpoint profiles. Credentials stay on this device."
          />

          <SettingsLink
            href="/setup"
            icon={{ ios: 'slider.horizontal.3', android: 'tune' }}
            title="Edit endpoint &amp; API key"
            body="Update base URL, authentication, and compatibility settings."
          />

          {profile?.compat.usagePath !== null && profile?.compat.usagePath !== undefined && (
            <SettingsLink
              href="/settings/usage"
              icon={{ ios: 'chart.bar.xaxis', android: 'monitoring' }}
              title="Account usage"
              body="Load balance and activity from this endpoint's documented usage path."
            />
          )}

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
            body="Show or hide models and edit local metadata overrides."
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

        <Section label="WEB TOOLS" icon="web" tone="secondary">
          <View style={{ gap: 10, borderRadius: 4, backgroundColor: colors.surface, padding: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ color: colors.text, fontFamily: fonts.heading, fontSize: 13 }}>
                  Enable web search and fetch
                </Text>
                <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 10, lineHeight: 15 }}>
                  {webSearchProvider === 'gateway'
                    ? 'Search requests go only to your configured HTTPS gateway.'
                    : 'Search requests go directly to api.exa.ai.'} Web fetch sends page URLs to Firecrawl Keyless.
                </Text>
              </View>
              <Switch
                accessibilityLabel="Enable web search and fetch"
                accessibilityState={{ checked: webToolsEnabled, disabled: !webToolsReady || savingWebTools }}
                disabled={!webToolsReady || savingWebTools}
                value={webToolsEnabled}
                onValueChange={setWebToolsEnabled}
                trackColor={{ false: colors.surfaceHigh, true: colors.primary }}
                thumbColor={colors.text}
              />
            </View>
            <StatusBadge
              label={!webToolsReady ? 'LOADING' : !webToolsEnabled ? 'DISABLED' : gatewayTokenSaved ? 'CONFIGURED' : 'TOKEN REQUIRED'}
              tone={!webToolsReady || !webToolsEnabled || !gatewayTokenSaved ? 'warning' : 'secondary'}
            />
          </View>

          <View style={{ gap: 6 }}>
            <Text style={{ color: colors.muted, fontFamily: fonts.monoMedium, fontSize: 10 }}>WEB SEARCH PROVIDER</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <SettingsAction
                  label="GATEWAY"
                  disabled={!webToolsReady || savingWebTools}
                  onPress={() => void selectWebSearchProvider('gateway')}
                  tone={webSearchProvider === 'gateway' ? 'primary' : 'secondary'}
                />
              </View>
              <View style={{ flex: 1 }}>
                <SettingsAction
                  label="EXA"
                  disabled={!webToolsReady || savingWebTools}
                  onPress={() => void selectWebSearchProvider('exa')}
                  tone={webSearchProvider === 'exa' ? 'primary' : 'secondary'}
                />
              </View>
            </View>
          </View>

          {webSearchProvider === 'gateway' && <View style={{ gap: 6 }}>
            <Text style={{ color: colors.muted, fontFamily: fonts.monoMedium, fontSize: 10 }}>GATEWAY URL</Text>
            <TextInput
              accessibilityLabel="Gateway URL"
              autoCapitalize="none"
              autoCorrect={false}
              editable={webToolsReady && !savingWebTools}
              keyboardType="url"
              onChangeText={setGatewayUrl}
              placeholder="https://gateway.example.com"
              placeholderTextColor={colors.outline}
              value={gatewayUrl}
              style={{ minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 4, backgroundColor: colors.surfaceLowest, color: colors.text, fontFamily: fonts.mono, fontSize: typography.body, paddingHorizontal: 10 }}
            />
          </View>}

          <View style={{ gap: 6 }}>
            <Text style={{ color: colors.muted, fontFamily: fonts.monoMedium, fontSize: 10 }}>
              {webSearchProvider === 'exa' ? 'EXA API KEY' : 'GATEWAY TOKEN'}
            </Text>
            <TextInput
              accessibilityLabel={webSearchProvider === 'exa' ? 'Exa API key' : 'Gateway token'}
              autoCapitalize="none"
              autoCorrect={false}
              editable={webToolsReady && !savingWebTools}
              onChangeText={setGatewayToken}
              placeholder={gatewayTokenSaved
                ? 'Saved securely. Enter a new value to replace it.'
                : webSearchProvider === 'exa' ? 'Exa API key' : 'Bearer token'}
              placeholderTextColor={colors.outline}
              secureTextEntry
              value={gatewayToken}
              style={{ minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 4, backgroundColor: colors.surfaceLowest, color: colors.text, fontFamily: fonts.mono, fontSize: typography.body, paddingHorizontal: 10 }}
            />
            <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 10, lineHeight: 15 }}>
              The credential is stored securely and is never included in diagnostics or tool output.
            </Text>
          </View>

          {webSearchProvider === 'gateway' && <View style={{ gap: 6 }}>
            <Text style={{ color: colors.muted, fontFamily: fonts.monoMedium, fontSize: 10 }}>SEARXNG ENGINES</Text>
            <TextInput
              accessibilityLabel="SearXNG engines"
              autoCapitalize="none"
              autoCorrect={false}
              editable={webToolsReady && !savingWebTools}
              onChangeText={setGatewayEngines}
              placeholder="bing"
              placeholderTextColor={colors.outline}
              value={gatewayEngines}
              style={{ minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 4, backgroundColor: colors.surfaceLowest, color: colors.text, fontFamily: fonts.mono, fontSize: typography.body, paddingHorizontal: 10 }}
            />
            <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 10, lineHeight: 15 }}>
              Comma-separated engine names for your SearXNG instance. Default: bing.
            </Text>
          </View>}

          {webSearchProvider === 'exa' && (
            <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 10, lineHeight: 15 }}>
              No connection test is sent because an Exa search request may be billable.
            </Text>
          )}

          <View style={{ flexDirection: 'row', gap: 8 }}>
            {webSearchProvider === 'gateway' && <View style={{ flex: 1 }}>
              <SettingsAction
                label={testingGateway ? 'TESTING...' : 'TEST CONNECTION'}
                disabled={!webToolsReady || testingGateway || savingWebTools}
                onPress={() => void testGateway()}
                tone="secondary"
              />
            </View>}
            <View style={{ flex: 1 }}>
              <SettingsAction
                label={savingWebTools ? 'SAVING...' : 'SAVE WEB TOOLS'}
                disabled={!webToolsReady || savingWebTools || testingGateway}
                onPress={() => void saveWebTools()}
                tone="primary"
              />
            </View>
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

function Section({ label, icon, tone, children }: { label: string; icon: 'endpoint' | 'model' | 'web' | 'diagnostics' | 'danger'; tone: 'primary' | 'secondary' | 'warning' | 'error'; children: ReactNode }) {
  const color = colors[tone];
  const symbol = {
    endpoint: { ios: 'terminal', android: 'router' },
    model: { ios: 'cpu', android: 'memory' },
    web: { ios: 'globe', android: 'public' },
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

function SettingsAction({ label, disabled, onPress, tone }: { label: string; disabled: boolean; onPress: () => void; tone: 'primary' | 'secondary' }) {
  const color = colors[tone];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 48,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 4,
        backgroundColor: tone === 'primary' ? color : colors.surfaceHigh,
        opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
      })}>
      <Text style={{ color: tone === 'primary' ? colors.surfaceLowest : color, fontFamily: fonts.monoMedium, fontSize: 10 }}>{label}</Text>
    </Pressable>
  );
}

function SettingsLink({ href, icon, title, body }: {
  href: string;
  icon: {
    ios: 'slider.horizontal.3' | 'cpu' | 'server.rack' | 'chart.bar.xaxis';
    android: 'tune' | 'memory' | 'dns' | 'monitoring';
  };
  title: string;
  body: string;
}) {
  return (
    <Link href={href as never} asChild>
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
    <Text style={{ color: colors.muted, backgroundColor: colors.surfaceHigh, fontFamily: fonts.monoMedium, fontSize: typography.meta, paddingHorizontal: 6, paddingVertical: 4, borderRadius: 4 }}>
      {label}
    </Text>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: 'primary' | 'secondary' | 'warning' }) {
  const color = colors[tone];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 4, backgroundColor: colors.surfaceHigh, paddingHorizontal: 6, paddingVertical: 4 }}>
      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: color }} />
      <Text style={{ color, fontFamily: fonts.monoMedium, fontSize: typography.meta, letterSpacing: 0.3 }}>{label}</Text>
    </View>
  );
}

function ClearDataSheet({ visible, busy, onCancel, onConfirm }: { visible: boolean; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <BottomSheet
      visible={visible}
      dismissLabel="Dismiss delete confirmation"
      dismissDisabled={busy}
      onRequestClose={busy ? () => undefined : onCancel}>
        <View style={{ gap: 16, borderTopLeftRadius: 12, borderTopRightRadius: 12, backgroundColor: colors.surfaceLow, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 }}>
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
    </BottomSheet>
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
      <Text style={{ color: danger ? colors.errorButtonText : colors.text, fontFamily: fonts.heading, fontSize: typography.body }}>{label}</Text>
    </Pressable>
  );
}
