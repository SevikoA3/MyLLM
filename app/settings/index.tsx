import { Link, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useActiveEndpoint } from '../../src/features/setup/use-active-endpoint';
import { credentialStore } from '../../src/services/credentials/store';
import { clearDiagnosticRing } from '../../src/services/diagnostics/diagnostic-ring';
import { shareDiagnostics } from '../../src/services/diagnostics/diagnostic-transfer';
import { clearAllData } from '../../src/services/persistence/clear-all';
import { clearCatalogCache } from '../../src/services/persistence/catalog-files';
import { clearTransferCache } from '../../src/services/persistence/catalog-transfer';
import { clearStagedAttachments } from '../../src/services/attachments/files';
import { conversationRepository } from '../../src/services/persistence/conversation-store';
import { endpointStore } from '../../src/services/persistence/endpoint-store';
import { webToolsCredentialId, webToolsStore } from '../../src/services/persistence/web-tools-store';
import { createWebToolsSettings, normalizeGatewayUrl, type WebSearchProvider, type WebToolsSettings } from '../../src/domain/web-tools';
import { testWebGateway } from '../../src/services/tools/gateway';
import { colors, fonts, interaction, radius, spacing, typography } from '../../src/ui/tokens';
import { BottomSheet } from '../../src/ui/bottom-sheet';

const cardStyle = {
  gap: spacing.medium,
  padding: spacing.medium,
  borderRadius: radius.card,
  backgroundColor: colors.surfaceLow,
} as const;

type SettingsOperation = 'load' | 'provider' | 'save' | 'test' | 'reset' | 'export' | 'confirm' | 'delete' | null;

export default function SettingsScreen() {
  const router = useRouter();
  const { status, profile } = useActiveEndpoint();
  const [notice, setNotice] = useState<string | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [operation, setOperation] = useState<SettingsOperation>('load');
  const operationGuard = useRef({ version: 0, operation: 'load' as SettingsOperation });
  const [savedWebTools, setSavedWebTools] = useState<WebToolsSettings | null>(null);
  const [webToolsReady, setWebToolsReady] = useState(false);
  const [webToolsEnabled, setWebToolsEnabled] = useState(false);
  const [webSearchProvider, setWebSearchProvider] = useState<WebSearchProvider>('gateway');
  const [gatewayUrl, setGatewayUrl] = useState('');
  const [gatewayEngines, setGatewayEngines] = useState('bing');
  const [gatewayToken, setGatewayToken] = useState('');
  const [gatewayTokenSaved, setGatewayTokenSaved] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const exporting = operation === 'export';
  const resetting = operation === 'reset';
  const clearing = operation === 'delete';
  const savingWebTools = operation === 'save';
  const testingGateway = operation === 'test';
  const actionsBlocked = operation !== null;
  const providerBlocked = !webToolsReady || (actionsBlocked && operation !== 'provider');
  const draftChanged = savedWebTools === null || gatewayToken.length > 0
    || webToolsEnabled !== savedWebTools.enabled || webSearchProvider !== savedWebTools.provider
    || (webSearchProvider === 'gateway' && (gatewayUrl !== (savedWebTools.baseUrl ?? '') || gatewayEngines !== savedWebTools.engines));

  function startOperation(next: SettingsOperation) {
    operationGuard.current.operation = next;
    const version = ++operationGuard.current.version;
    setOperation(next);
    return version;
  }

  function finishOperation(version: number) {
    if (operationGuard.current.version !== version) return;
    operationGuard.current.operation = null;
    setOperation(null);
  }

  useEffect(() => {
    const guard = operationGuard.current;
    const version = ++guard.version;
    void webToolsStore.load().then(async (settings) => {
      if (operationGuard.current.version !== version) return;
      const token = await credentialStore.read(webToolsCredentialId(settings.provider));
      if (operationGuard.current.version !== version) return;
      setSavedWebTools(settings);
      setWebToolsEnabled(settings.enabled);
      setWebSearchProvider(settings.provider);
      setGatewayUrl(settings.baseUrl ?? '');
      setGatewayEngines(settings.engines);
      setGatewayTokenSaved(token !== null && token.trim().length > 0);
      setWebToolsReady(true);
    }).catch(() => {
      if (operationGuard.current.version !== version) return;
      setNotice('Web tools settings could not be loaded.');
      setWebToolsReady(true);
    }).finally(() => {
      finishOperation(version);
    });
    return () => { ++guard.version; };
  }, []);

  async function selectWebSearchProvider(provider: WebSearchProvider) {
    if (!webToolsReady || (operationGuard.current.operation !== null && operationGuard.current.operation !== 'provider')) return;
    const version = startOperation('provider');
    setNotice(null);
    setWebSearchProvider(provider);
    setGatewayToken('');
    setGatewayTokenSaved(false);
    try {
      const token = await credentialStore.read(webToolsCredentialId(provider));
      if (operationGuard.current.version !== version) return;
      setGatewayTokenSaved(token !== null && token.trim().length > 0);
    } catch {
      if (operationGuard.current.version !== version) return;
      setNotice('Web tools credentials could not be loaded.');
    } finally {
      finishOperation(version);
    }
  }

  async function exportDiagnostics() {
    if (operationGuard.current.operation !== null) return;
    const version = startOperation('export');
    try {
      await shareDiagnostics();
    } catch {
      Alert.alert('Could not export diagnostics', 'The system share sheet is unavailable.');
    } finally {
      finishOperation(version);
    }
  }

  async function resetProtocol() {
    if (profile === null || operationGuard.current.operation !== null) {
      return;
    }
    setNotice(null);
    const version = startOperation('reset');
    try {
      await endpointStore.clearProtocol(profile.id);
      setNotice('Protocol cache cleared. Auto mode will try Responses first on the next request.');
    } catch {
      Alert.alert('Could not reset protocol compatibility', 'Try again later.');
    } finally {
      finishOperation(version);
    }
  }

  async function saveWebTools() {
    if (!webToolsReady || operationGuard.current.operation !== null) return;
    const version = startOperation('save');
    setNotice(null);
    const token = gatewayToken.trim();
    const credentialId = webToolsCredentialId(webSearchProvider);
    let previousToken: string | null = null;
    let credentialWriteAttempted = false;
    try {
      let settings: WebToolsSettings;
      try {
        settings = createWebToolsSettings({
          enabled: webToolsEnabled,
          provider: webSearchProvider,
          baseUrl: gatewayUrl.trim().length === 0 ? null : gatewayUrl,
          engines: gatewayEngines,
        });
      } catch {
        Alert.alert('Could not save web tools', 'Check the HTTPS gateway URL and SearXNG engines.');
        return;
      }
      previousToken = await credentialStore.read(credentialId);
      const tokenSaved = previousToken !== null && previousToken.trim().length > 0;
      setGatewayTokenSaved(tokenSaved);
      if (settings.enabled && token.length === 0 && !tokenSaved) {
        Alert.alert(
          settings.provider === 'exa' ? 'Exa API key required' : 'Gateway token required',
          settings.provider === 'exa' ? 'Enter an Exa API key before enabling web search.' : 'Enter a bearer token before enabling web tools.',
        );
        return;
      }
      if (token.length > 0) {
        credentialWriteAttempted = true;
        await credentialStore.save(credentialId, token);
      }
      await webToolsStore.save(settings);
      setSavedWebTools(settings);
      setGatewayTokenSaved(token.length > 0 || tokenSaved);
      setWebSearchProvider(settings.provider);
      setGatewayUrl(settings.baseUrl ?? '');
      setGatewayEngines(settings.engines);
      setNotice('Web tools settings saved.');
    } catch {
      if (credentialWriteAttempted) {
        try {
          if (previousToken === null) await credentialStore.remove(credentialId);
          else await credentialStore.save(credentialId, previousToken);
          setGatewayTokenSaved(previousToken !== null && previousToken.trim().length > 0);
        } catch {
          setGatewayTokenSaved(false);
          Alert.alert('Could not restore web tools credential', 'Secure storage failed during recovery. Re-enter the credential for the saved settings before using web search.');
          return;
        }
      }
      Alert.alert('Could not save web tools', 'Secure storage is unavailable. Try again later.');
    } finally {
      setGatewayToken('');
      finishOperation(version);
    }
  }

  async function testGateway() {
    if (!webToolsReady || webSearchProvider !== 'gateway' || operationGuard.current.operation !== null) return;
    let baseUrl: string;
    try {
      baseUrl = normalizeGatewayUrl(gatewayUrl);
    } catch {
      Alert.alert('Could not test gateway', 'Enter a valid HTTPS gateway URL without a query or fragment.');
      return;
    }
    setNotice(null);
    const version = startOperation('test');
    try {
      await testWebGateway(baseUrl);
      setNotice('Gateway health check passed. Search authentication was not tested.');
    } catch {
      Alert.alert('Could not connect to gateway', 'The gateway health check failed. Verify the HTTPS URL and try again.');
    } finally {
      finishOperation(version);
    }
  }

  function openClearData() {
    if (operationGuard.current.operation !== null) return;
    startOperation('confirm');
    setClearOpen(true);
  }

  function cancelClearData() {
    if (operationGuard.current.operation !== 'confirm') return;
    setClearOpen(false);
    finishOperation(operationGuard.current.version);
  }

  async function clearData() {
    if (operationGuard.current.operation !== 'confirm') return;
    const version = startOperation('delete');
    try {
      await clearAllData({
        loadAllEndpoints: endpointStore.loadAll,
        removeCredential: credentialStore.remove,
        clearCredentials: credentialStore.clearAll,
        clearEndpoint: endpointStore.clear,
        clearConversation: conversationRepository.clear,
        clearCatalog: clearCatalogCache,
        clearTransfers: clearTransferCache,
        clearAttachments: clearStagedAttachments,
        clearDiagnostics: clearDiagnosticRing,
        clearWebTools: webToolsStore.clear,
      });
      router.replace('/setup');
    } catch {
      if (operationGuard.current.version === version) startOperation('confirm');
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
    <SafeAreaView edges={[]} style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="light" />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: spacing.screen, padding: spacing.screen, paddingBottom: spacing.xlarge }}>
        <View style={{ gap: 6, paddingVertical: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <Text style={{ flex: 1, color: colors.text, fontFamily: fonts.heading, fontSize: typography.title, lineHeight: 28 }}>
              General
            </Text>
            <StatusBadge label={profile === null ? 'SETUP REQUIRED' : 'SECURE STORAGE'} tone={profile === null ? 'warning' : 'secondary'} />
          </View>
        </View>

        {notice !== null && (
          <View accessibilityRole="alert" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 8, backgroundColor: colors.surfaceHigh, padding: 12 }}>
            <SymbolView name={{ ios: 'info.circle', android: 'info' }} size={18} tintColor={colors.secondary} />
            <Text style={{ flex: 1, color: colors.text, fontFamily: fonts.mono, fontSize: typography.body, lineHeight: 20 }}>{notice}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Dismiss notice" onPress={() => setNotice(null)}
              style={({ pressed }) => ({ minWidth: interaction.compactTouchTarget, minHeight: interaction.compactTouchTarget, alignItems: 'center', justifyContent: 'center', opacity: pressed ? interaction.pressedOpacity : 1 })}>
              <SymbolView name={{ ios: 'xmark', android: 'close' }} size={16} tintColor={colors.muted} />
            </Pressable>
          </View>
        )}

        <Section label="Endpoint and security" icon="endpoint" tone="primary">
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
            disabled={actionsBlocked}
            href="/settings/endpoints"
            icon={{ ios: 'server.rack', android: 'dns' }}
            title="Endpoint profiles"
            body="Switch, import, export, or delete endpoint profiles. Credentials stay on this device."
          />

          <SettingsLink
            disabled={actionsBlocked}
            href="/setup"
            icon={{ ios: 'slider.horizontal.3', android: 'tune' }}
            title="Edit endpoint &amp; API key"
            body="Update base URL, authentication, and compatibility settings."
          />

          {profile?.compat.usagePath !== null && profile?.compat.usagePath !== undefined && (
            <SettingsLink
              disabled={actionsBlocked}
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

        <Section label="Model and protocol" icon="model" tone="secondary">
          <SettingsLink
            disabled={actionsBlocked}
            href="/settings/models"
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
                accessibilityState={{ busy: resetting, disabled: profile === null || actionsBlocked }}
                disabled={profile === null || actionsBlocked}
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
                  opacity: profile === null || actionsBlocked ? interaction.disabledOpacity : pressed ? interaction.pressedOpacity : 1,
                })}>
                {resetting ? <ActivityIndicator size="small" color={colors.secondary} /> : <SymbolView name={{ ios: 'arrow.counterclockwise', android: 'refresh' }} size={15} tintColor={colors.primary} />}
                <Text style={{ color: colors.primary, fontFamily: fonts.heading, fontSize: typography.body }}>
                  {resetting ? 'Resetting...' : 'Reset'}
                </Text>
              </Pressable>
            </View>
            <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 10, lineHeight: 15 }}>
              Clears the cached protocol choice for this endpoint. Auto mode tries Responses first on the next request.
            </Text>
          </View>
        </Section>

        <Section label="Web tools" icon="web" tone="secondary">
          <View style={{ gap: 10, borderRadius: 4, backgroundColor: colors.surface, padding: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ color: colors.text, fontFamily: fonts.heading, fontSize: 13 }}>
                  Enable web search and fetch
                </Text>
                <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 10, lineHeight: 15 }}>
                  {webSearchProvider === 'gateway'
                    ? 'Search requests go only to your configured HTTPS gateway.'
                    : 'Search requests go directly to api.exa.ai.'} Web fetch sends page URLs to Jina AI Reader without an API key.
                </Text>
              </View>
              <Switch
                accessibilityLabel="Enable web search and fetch"
                accessibilityState={{ checked: webToolsEnabled, disabled: !webToolsReady || actionsBlocked }}
                disabled={!webToolsReady || actionsBlocked}
                value={webToolsEnabled}
                onValueChange={(value) => { if (operationGuard.current.operation !== null) return; setNotice(null); setWebToolsEnabled(value); }}
                trackColor={{ false: colors.surfaceHigh, true: colors.primary }}
                thumbColor={colors.text}
              />
            </View>
            <StatusBadge
              label={!webToolsReady || operation === 'provider' ? 'Loading credentials' : draftChanged ? 'Save to apply changes' : !webToolsEnabled ? 'Disabled' : gatewayTokenSaved ? 'Configured' : webSearchProvider === 'exa' ? 'API key required' : 'Token required'}
              tone={!webToolsReady || operation === 'provider' || draftChanged || !gatewayTokenSaved ? 'warning' : 'secondary'}
            />
          </View>

          <View style={{ gap: 6 }}>
            <Text style={{ color: colors.text, fontFamily: fonts.headingMedium, fontSize: typography.body }}>Web search provider</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <SettingsAction
                  label="Gateway"
                  checked={webSearchProvider === 'gateway'}
                  disabled={providerBlocked}
                  onPress={() => void selectWebSearchProvider('gateway')}
                  tone={webSearchProvider === 'gateway' ? 'primary' : 'secondary'}
                />
              </View>
              <View style={{ flex: 1 }}>
                <SettingsAction
                  label="Exa"
                  checked={webSearchProvider === 'exa'}
                  disabled={providerBlocked}
                  onPress={() => void selectWebSearchProvider('exa')}
                  tone={webSearchProvider === 'exa' ? 'primary' : 'secondary'}
                />
              </View>
            </View>
          </View>

          {webSearchProvider === 'gateway' && <View style={{ gap: 6 }}>
            <Text style={{ color: colors.text, fontFamily: fonts.headingMedium, fontSize: typography.body }}>Gateway URL</Text>
            <TextInput
              accessibilityLabel="Gateway URL"
              autoCapitalize="none"
              autoCorrect={false}
              editable={webToolsReady && !actionsBlocked}
              keyboardType="url"
              onChangeText={(value) => { if (operationGuard.current.operation !== null) return; setNotice(null); setGatewayUrl(value); }}
              onFocus={() => setFocusedField('url')}
              onBlur={() => setFocusedField(null)}
              selectionColor={colors.primary}
              placeholder="https://gateway.example.com"
              placeholderTextColor={colors.outline}
              value={gatewayUrl}
              style={{ minHeight: interaction.touchTarget, borderWidth: 1, borderColor: focusedField === 'url' ? colors.primary : colors.border, borderRadius: radius.control, backgroundColor: colors.surfaceLowest, color: colors.text, fontFamily: fonts.mono, fontSize: typography.body, paddingHorizontal: spacing.medium, opacity: actionsBlocked ? interaction.disabledOpacity : 1 }}
            />
          </View>}

          <View style={{ gap: 6 }}>
            <Text style={{ color: colors.text, fontFamily: fonts.headingMedium, fontSize: typography.body }}>
              {webSearchProvider === 'exa' ? 'Exa API key' : 'Gateway token'}
            </Text>
            <TextInput
              accessibilityLabel={webSearchProvider === 'exa' ? 'Exa API key' : 'Gateway token'}
              autoCapitalize="none"
              autoCorrect={false}
              editable={webToolsReady && !actionsBlocked}
              onChangeText={(value) => { if (operationGuard.current.operation !== null) return; setNotice(null); setGatewayToken(value); }}
              onFocus={() => setFocusedField('token')}
              onBlur={() => setFocusedField(null)}
              selectionColor={colors.primary}
              placeholder={gatewayTokenSaved
                ? 'Saved securely. Enter a new value to replace it.'
                : webSearchProvider === 'exa' ? 'Exa API key' : 'Bearer token'}
              placeholderTextColor={colors.outline}
              secureTextEntry
              value={gatewayToken}
              style={{ minHeight: interaction.touchTarget, borderWidth: 1, borderColor: focusedField === 'token' ? colors.primary : colors.border, borderRadius: radius.control, backgroundColor: colors.surfaceLowest, color: colors.text, fontFamily: fonts.mono, fontSize: typography.body, paddingHorizontal: spacing.medium, opacity: actionsBlocked ? interaction.disabledOpacity : 1 }}
            />
            <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 10, lineHeight: 15 }}>
              The credential is stored securely and is never included in diagnostics or tool output.
            </Text>
          </View>

          {webSearchProvider === 'gateway' && <View style={{ gap: 6 }}>
            <Text style={{ color: colors.text, fontFamily: fonts.headingMedium, fontSize: typography.body }}>SearXNG engines</Text>
            <TextInput
              accessibilityLabel="SearXNG engines"
              autoCapitalize="none"
              autoCorrect={false}
              editable={webToolsReady && !actionsBlocked}
              onChangeText={(value) => { if (operationGuard.current.operation !== null) return; setNotice(null); setGatewayEngines(value); }}
              onFocus={() => setFocusedField('engines')}
              onBlur={() => setFocusedField(null)}
              selectionColor={colors.primary}
              placeholder="bing"
              placeholderTextColor={colors.outline}
              value={gatewayEngines}
              style={{ minHeight: interaction.touchTarget, borderWidth: 1, borderColor: focusedField === 'engines' ? colors.primary : colors.border, borderRadius: radius.control, backgroundColor: colors.surfaceLowest, color: colors.text, fontFamily: fonts.mono, fontSize: typography.body, paddingHorizontal: spacing.medium, opacity: actionsBlocked ? interaction.disabledOpacity : 1 }}
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
                label={testingGateway ? 'Testing gateway health...' : 'Test gateway health'}
                disabled={!webToolsReady || actionsBlocked}
                onPress={() => void testGateway()}
                tone="secondary"
              />
            </View>}
            <View style={{ flex: 1 }}>
              <SettingsAction
                label={savingWebTools ? 'Saving...' : 'Save web tools'}
                disabled={!webToolsReady || actionsBlocked}
                onPress={() => void saveWebTools()}
                tone="primary"
              />
            </View>
          </View>
        </Section>

        <Section label="Diagnostics and audit" icon="diagnostics" tone="warning">
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
            accessibilityState={{ busy: exporting, disabled: actionsBlocked }}
            disabled={actionsBlocked}
            onPress={() => void exportDiagnostics()}
            style={({ pressed }) => ({
              minHeight: 48,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              borderRadius: 4,
              backgroundColor: colors.surfaceHigh,
              opacity: actionsBlocked ? interaction.disabledOpacity : pressed ? interaction.pressedOpacity : 1,
            })}>
            {exporting ? <ActivityIndicator size="small" color={colors.secondary} /> : <SymbolView name={{ ios: 'square.and.arrow.up', android: 'ios_share' }} size={16} tintColor={colors.secondary} />}
            <Text style={{ color: colors.text, fontFamily: fonts.heading, fontSize: typography.body }}>
              {exporting ? 'Opening share sheet...' : 'Share diagnostic JSON'}
            </Text>
          </Pressable>
        </Section>

        <Section label="Delete local data" icon="danger" tone="error">
          <View style={{ gap: 10, borderRadius: 4, backgroundColor: colors.surface, padding: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <SymbolView name={{ ios: 'trash.fill', android: 'delete_forever' }} size={20} tintColor={colors.error} />
              <Text style={{ color: colors.text, fontFamily: fonts.heading, fontSize: 18 }}>Delete all app data</Text>
            </View>
            <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: typography.body, lineHeight: 20 }}>
              Permanently deletes endpoints, saved credentials, conversations, model data, diagnostics, and transfer files.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Delete all app data"
              accessibilityHint="Open a confirmation before permanently deleting local data"
              accessibilityState={{ disabled: actionsBlocked }}
              disabled={actionsBlocked}
              onPress={openClearData}
              style={({ pressed }) => ({
                minHeight: 48,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                borderRadius: 4,
                backgroundColor: colors.error,
                opacity: actionsBlocked ? interaction.disabledOpacity : pressed ? interaction.pressedOpacity : 1,
              })}>
              <SymbolView name={{ ios: 'trash.fill', android: 'delete_forever' }} size={18} tintColor={colors.errorButtonText} />
              <Text style={{ color: colors.errorButtonText, fontFamily: fonts.heading, fontSize: typography.body }}>Delete all app data</Text>
            </Pressable>
          </View>
        </Section>
      </ScrollView>
      <ClearDataSheet visible={clearOpen} busy={clearing} onCancel={cancelClearData} onConfirm={() => void clearData()} />
    </SafeAreaView>
  );
}

function LoadingScreen() {
  return (
    <SafeAreaView edges={[]} style={{ flex: 1, backgroundColor: colors.background }}>
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
        <Text style={{ color: colors.text, fontFamily: fonts.heading, fontSize: typography.componentTitle }}>{label}</Text>
      </View>
      <View style={cardStyle}>{children}</View>
    </View>
  );
}

function SettingsAction({ label, disabled, onPress, tone, checked }: { label: string; disabled: boolean; onPress: () => void; tone: 'primary' | 'secondary'; checked?: boolean }) {
  const color = colors[tone];
  return (
    <Pressable
      accessibilityRole={checked === undefined ? 'button' : 'radio'}
      accessibilityLabel={label}
      accessibilityState={{ disabled, ...(checked === undefined ? {} : { checked }) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: interaction.touchTarget,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.control,
        paddingHorizontal: spacing.small,
        paddingVertical: spacing.small,
        backgroundColor: tone === 'primary' ? color : colors.surfaceHigh,
        opacity: disabled ? interaction.disabledOpacity : pressed ? interaction.pressedOpacity : 1,
      })}>
      <Text style={{ color: tone === 'primary' ? colors.surfaceLowest : color, fontFamily: fonts.heading, fontSize: typography.body, textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );
}

function SettingsLink({ href, icon, title, body, disabled }: {
  href: string;
  icon: {
    ios: 'slider.horizontal.3' | 'cpu' | 'server.rack' | 'chart.bar.xaxis';
    android: 'tune' | 'memory' | 'dns' | 'monitoring';
  };
  title: string;
  body: string;
  disabled: boolean;
}) {
  return (
    <Link href={href as never} asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityHint={body}
        accessibilityState={{ disabled }}
        disabled={disabled}
        style={({ pressed }) => ({
          minHeight: 64,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          borderRadius: 4,
          backgroundColor: colors.surfaceHigh,
          paddingHorizontal: 10,
          opacity: disabled ? interaction.disabledOpacity : pressed ? interaction.pressedOpacity : 1,
        })}>
        <View style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 4, backgroundColor: colors.surface }}>
          <SymbolView name={icon} size={18} tintColor={colors.primary} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={{ color: colors.text, fontFamily: fonts.heading, fontSize: typography.componentTitle }}>{title}</Text>
          <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: typography.label, lineHeight: 16 }}>{body}</Text>
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
        <View style={{ gap: spacing.screen, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, backgroundColor: colors.surfaceLow, paddingHorizontal: spacing.screen, paddingTop: spacing.medium, paddingBottom: spacing.large }}>
          <View style={{ alignItems: 'center' }}>
            <View style={{ width: 32, height: 4, borderRadius: 2, backgroundColor: colors.outline }} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: colors.errorBackground }}>
              <SymbolView name={{ ios: 'exclamationmark.triangle.fill', android: 'warning' }} size={22} tintColor={colors.errorText} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: colors.text, fontFamily: fonts.heading, fontSize: typography.subtitle, lineHeight: 24 }}>Delete all app data?</Text>
            </View>
          </View>
          <View style={{ gap: 4, borderRadius: 4, backgroundColor: colors.surfaceLowest, padding: 10 }}>
            <Text style={{ color: colors.text, fontFamily: fonts.mono, fontSize: typography.body, lineHeight: 20 }}>
              This removes all local data, clears saved credentials, and returns this device to endpoint setup.
            </Text>
            <Text style={{ color: colors.errorText, fontFamily: fonts.monoMedium, fontSize: typography.body, lineHeight: 20 }}>
              This action cannot be undone.
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><SheetButton label="Cancel" disabled={busy} onPress={onCancel} /></View>
            <View style={{ flex: 1 }}><SheetButton label={busy ? 'Deleting...' : 'Delete data'} danger busy={busy} disabled={busy} onPress={onConfirm} /></View>
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
        minHeight: interaction.touchTarget,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.control,
        backgroundColor: danger ? colors.error : colors.surfaceHigh,
        opacity: disabled ? interaction.disabledOpacity : pressed ? interaction.pressedOpacity : 1,
      })}>
      <Text style={{ color: danger ? colors.errorButtonText : colors.text, fontFamily: fonts.heading, fontSize: typography.body }}>{label}</Text>
    </Pressable>
  );
}
