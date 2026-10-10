import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthModeSchema, ProtocolModeSchema, validateBaseUrl } from '../src/domain/endpoint';
import { describe, type ErrorCopy } from '../src/features/setup/error-copy';
import { connectAndDiscover, suggestName, type SetupInput } from '../src/features/setup/onboarding';
import { useActiveEndpoint } from '../src/features/setup/use-active-endpoint';
import { modelsUrl } from '../src/services/transport/models';
import { seedCatalogCache } from '../src/services/persistence/catalog-seed';
import { fileCatalogStorage, readBundledDefaults } from '../src/services/persistence/catalog-files';
import { colors, fonts, interaction, radius, spacing, typography } from '../src/ui/tokens';

type Edits = Partial<SetupInput>;

const cardStyle = {
  gap: spacing.medium,
  padding: spacing.medium,
  borderRadius: radius.card,
  backgroundColor: colors.panel,
} as const;

export default function SetupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const { status, profile } = useActiveEndpoint();
  const editingProfile = params.mode === 'new' ? null : profile;
  // Field yang belum disentuh tetap mengikuti nilai dari endpoint tersimpan.
  const [edits, setEdits] = useState<Edits>({});
  // Key hanya hidup selama flow submit, tidak pernah dibaca ulang dari storage.
  const [keyDraft, setKeyDraft] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ErrorCopy | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [focusedControl, setFocusedControl] = useState<string | null>(null);
  const mounted = useRef(true);
  const submitting = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const name = edits.name ?? editingProfile?.name ?? '';
  const baseUrl = edits.baseUrl ?? editingProfile?.baseUrl ?? '';
  const authMode = edits.authMode ?? editingProfile?.authMode ?? 'bearer';
  const protocol = edits.protocol ?? editingProfile?.protocol ?? 'responses';
  const modelListPath = edits.modelListPath ?? editingProfile?.compat.modelListPath ?? '/models';
  // Key lama tidak pernah dibaca ke form, jadi field tetap kosong sampai pengguna mengetik.
  const canReuseKey = editingProfile?.credentialRef != null;
  const apiKey = keyDraft ?? '';

  const urlError = baseUrl.length === 0 ? null : validateBaseUrl(baseUrl);
  const previewUrl = useMemo(() => {
    if (urlError !== null || baseUrl.length === 0) {
      return null;
    }
    try {
      return modelsUrl({ baseUrl, compat: { modelListPath } } as never);
    } catch {
      return null;
    }
  }, [baseUrl, modelListPath, urlError]);

  const canConnect =
    !busy && previewUrl !== null && (apiKey.length > 0 || canReuseKey);

  async function onConnect() {
    if (submitting.current || !canConnect) return;
    submitting.current = true;
    setFailure(null);
    setBusy(true);
    const input: SetupInput = {
      name: name.trim().length > 0 ? name : suggestName(baseUrl),
      baseUrl,
      apiKey,
      apiKeyChanged: keyDraft !== null,
      authMode,
      protocol,
      modelListPath,
    };
    try {
      const result = await connectAndDiscover(input, editingProfile, {
        seedCatalog: async (nextProfile, models) => {
          const result = await seedCatalogCache(nextProfile, models, {
            storage: fileCatalogStorage,
            readDefaults: readBundledDefaults,
          });
          return result;
        },
      });
      if (!mounted.current) return;
      if (!result.ok) {
        setFailure(describe(result.error, previewUrl ?? baseUrl));
        return;
      }
      router.replace('/(tabs)');
    } catch {
      if (mounted.current) {
        setFailure({ title: 'Could not connect', body: 'The connection could not be completed. Try again.', retryable: true });
      }
    } finally {
      submitting.current = false;
      if (mounted.current) {
        setBusy(false);
        // Field dikosongkan baik saat save berhasil maupun saat gagal.
        setKeyDraft(null);
      }
    }
  }

  if (status === 'loading') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <StatusBar style="light" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.medium, padding: spacing.screen }}>
          <ActivityIndicator accessible accessibilityRole="progressbar" accessibilityLabel="Loading endpoint" accessibilityState={{ busy: true }} color={colors.primary} />
          <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: typography.body }}>
            Loading endpoint configuration.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const inputStyle = (field: string) => ({
    minHeight: interaction.touchTarget,
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: focusedField === field ? colors.primary : colors.border,
    backgroundColor: focusedField === field ? colors.controlActive : colors.control,
    color: colors.text,
    fontFamily: fonts.mono,
    fontSize: typography.body,
    opacity: busy ? interaction.disabledOpacity : 1,
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ gap: spacing.screen, padding: spacing.screen, paddingBottom: spacing.xlarge }} keyboardShouldPersistTaps="handled">
        {profile !== null && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/settings'); }}
            style={({ pressed }) => ({ minHeight: interaction.touchTarget, alignSelf: 'flex-start', justifyContent: 'center', opacity: pressed ? interaction.pressedOpacity : 1 })}>
            <Text style={{ color: colors.secondary, fontFamily: fonts.headingMedium, fontSize: typography.body }}>← Back</Text>
          </Pressable>
        )}
        <Text style={{ color: colors.text, fontFamily: fonts.heading, fontSize: typography.display }}>
          {editingProfile === null ? 'Connect an endpoint' : 'Update endpoint'}
        </Text>

        <View style={cardStyle}>
          <Field label="Endpoint name">
            <TextInput
              accessibilityLabel="Endpoint name"
              accessibilityHint="Name shown in the app"
              accessibilityState={{ disabled: busy }}
              editable={!busy}
              style={inputStyle('name')}
              value={name}
              onChangeText={(value) => setEdits((current) => ({ ...current, name: value }))}
              placeholder={suggestName(baseUrl) || 'My endpoint'}
              placeholderTextColor={colors.outline}
              selectionColor={colors.primary}
              cursorColor={colors.primary}
              onFocus={() => setFocusedField('name')}
              onBlur={() => setFocusedField(null)}
              autoCapitalize="none"
            />
          </Field>
          <Field label="Base URL">
            <TextInput
              accessibilityLabel="Endpoint base URL"
              accessibilityHint="HTTPS URL for the OpenAI-compatible endpoint"
              accessibilityState={{ disabled: busy }}
              editable={!busy}
              style={inputStyle('baseUrl')}
              value={baseUrl}
              onChangeText={(value) => setEdits((current) => ({ ...current, baseUrl: value }))}
              placeholder="https://api.example.com/v1"
              placeholderTextColor={colors.outline}
              selectionColor={colors.primary}
              cursorColor={colors.primary}
              onFocus={() => setFocusedField('baseUrl')}
              onBlur={() => setFocusedField(null)}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </Field>
          {urlError !== null && (
            <Text accessibilityRole="alert" style={{ color: colors.errorText, fontFamily: fonts.mono, fontSize: typography.label }}>{urlError}</Text>
          )}
          <Field label="API key">
            <TextInput
              accessibilityLabel="API key"
              accessibilityHint="Credential is stored in secure storage"
              accessibilityState={{ disabled: busy }}
              editable={!busy}
              style={inputStyle('apiKey')}
              value={apiKey}
              onChangeText={setKeyDraft}
              placeholder={canReuseKey ? 'Leave blank to use the saved key' : 'Enter your API key'}
              placeholderTextColor={colors.outline}
              selectionColor={colors.primary}
              cursorColor={colors.primary}
              onFocus={() => setFocusedField('apiKey')}
              onBlur={() => setFocusedField(null)}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />
            <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: typography.label }}>
              Keys are saved in Android Keystore after connecting. Saved keys stay hidden.
            </Text>
          </Field>
        </View>

        {failure !== null && (
          <View accessible accessibilityRole="alert" style={{ gap: spacing.small, borderRadius: radius.control, backgroundColor: colors.errorBackground, padding: spacing.medium }}>
            <Text style={{ color: colors.errorText, fontFamily: fonts.heading, fontSize: typography.componentTitle }}>{failure.title}</Text>
            <Text style={{ color: colors.errorText, fontFamily: fonts.mono, fontSize: typography.label }}>{failure.body}</Text>
          </View>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={busy ? 'Connecting to endpoint' : 'Connect'}
          accessibilityHint="Retrieve the model list and save the endpoint"
          accessibilityState={{ busy, disabled: !canConnect }}
          disabled={!canConnect}
          onPress={() => void onConnect()}
          onFocus={() => setFocusedControl('connect')}
          onBlur={() => setFocusedControl(null)}
          style={({ pressed }) => ({
            minHeight: interaction.touchTarget,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.small,
            borderRadius: radius.control,
            borderWidth: focusedControl === 'connect' ? 2 : 0,
            borderColor: colors.primary,
            backgroundColor: colors.primary,
            paddingHorizontal: spacing.medium,
            opacity: !canConnect ? interaction.disabledOpacity : pressed ? interaction.pressedOpacity : 1,
          })}>
          {busy && <ActivityIndicator size="small" color={colors.primaryText} />}
          <Text style={{ color: colors.primaryText, fontFamily: fonts.heading, fontSize: typography.componentTitle }}>
            {busy ? 'Connecting…' : 'Connect'}
          </Text>
        </Pressable>
        <Text accessibilityLiveRegion="polite" style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: typography.label }}>
          {busy ? 'Retrieving the model list…' : 'Connect retrieves the model list. No billable test request is sent.'}
        </Text>

        <View style={{ ...cardStyle, padding: 0 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={advanced ? 'Hide advanced settings' : 'Show advanced settings'}
            accessibilityState={{ expanded: advanced, disabled: busy }}
            disabled={busy}
            onFocus={() => setFocusedControl('advanced')}
            onBlur={() => setFocusedControl(null)}
            onPress={() => setAdvanced(!advanced)}
            style={({ pressed }) => ({
              minHeight: interaction.touchTarget,
              justifyContent: 'center',
              borderRadius: radius.control,
              borderWidth: focusedControl === 'advanced' ? 1 : 0,
              borderColor: colors.primary,
              backgroundColor: advanced ? colors.controlActive : 'transparent',
              paddingHorizontal: spacing.medium,
              opacity: busy ? interaction.disabledOpacity : pressed ? interaction.pressedOpacity : 1,
            })}>
            <Text style={{ color: colors.text, fontFamily: fonts.heading, fontSize: typography.body }}>Advanced</Text>
          </Pressable>
          {advanced && (
            <View style={{ gap: spacing.medium, padding: spacing.medium }}>
              <Field label="Authentication">
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xsmall }}>
                  {AuthModeSchema.options.map((mode) => (
                    <Pressable
                      key={mode}
                      onPress={() => setEdits((current) => ({ ...current, authMode: mode }))}
                      onFocus={() => setFocusedControl('auth-' + mode)}
                      onBlur={() => setFocusedControl(null)}
                      accessibilityRole="button"
                      accessibilityLabel={'Auth mode ' + mode}
                      accessibilityState={{ selected: authMode === mode, disabled: busy }}
                      disabled={busy}
                      style={({ pressed }) => ({
                        flexGrow: 1,
                        minHeight: interaction.touchTarget,
                        alignItems: 'center',
                        justifyContent: 'center',
                        paddingHorizontal: spacing.small,
                        borderRadius: radius.control,
                        borderWidth: focusedControl === 'auth-' + mode ? 1 : 0,
                        borderColor: colors.primary,
                        backgroundColor: authMode === mode ? colors.controlActive : colors.control,
                        opacity: busy ? interaction.disabledOpacity : pressed ? interaction.pressedOpacity : 1,
                      })}>
                      <Text style={{ color: authMode === mode ? colors.primary : colors.muted, fontFamily: fonts.headingMedium, fontSize: typography.body }}>
                        {mode === 'bearer' ? 'Bearer token' : 'API key header'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </Field>
              <Field label="Chat protocol">
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xsmall }}>
                  {ProtocolModeSchema.options.map((mode) => (
                    <Pressable
                      key={mode}
                      onPress={() => setEdits((current) => ({ ...current, protocol: mode }))}
                      onFocus={() => setFocusedControl('protocol-' + mode)}
                      onBlur={() => setFocusedControl(null)}
                      accessibilityRole="button"
                      accessibilityLabel={'Chat protocol ' + mode}
                      accessibilityState={{ selected: protocol === mode, disabled: busy }}
                      disabled={busy}
                      style={({ pressed }) => ({
                        flexGrow: 1,
                        minHeight: interaction.touchTarget,
                        alignItems: 'center',
                        justifyContent: 'center',
                        paddingHorizontal: spacing.small,
                        borderRadius: radius.control,
                        borderWidth: focusedControl === 'protocol-' + mode ? 1 : 0,
                        borderColor: colors.primary,
                        backgroundColor: protocol === mode ? colors.controlActive : colors.control,
                        opacity: busy ? interaction.disabledOpacity : pressed ? interaction.pressedOpacity : 1,
                      })}>
                      <Text style={{ color: protocol === mode ? colors.primary : colors.muted, fontFamily: fonts.headingMedium, fontSize: typography.body }}>
                        {mode === 'chat-completions' ? 'Chat Completions' : mode === 'responses' ? 'Responses' : 'Auto'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </Field>
              <Field label="Models path">
                <TextInput
                  accessibilityLabel="Models path"
                  accessibilityHint="Endpoint path used to list models"
                  accessibilityState={{ disabled: busy }}
                  editable={!busy}
                  style={inputStyle('modelListPath')}
                  value={modelListPath}
                  onChangeText={(value) => setEdits((current) => ({ ...current, modelListPath: value }))}
                  placeholder="/models"
                  placeholderTextColor={colors.outline}
                  selectionColor={colors.primary}
                  cursorColor={colors.primary}
                  onFocus={() => setFocusedField('modelListPath')}
                  onBlur={() => setFocusedField(null)}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </Field>
              <Field label="Model list URL">
                <Text selectable style={{ color: colors.secondary, fontFamily: fonts.mono, fontSize: typography.label }}>
                  {previewUrl ?? 'Enter a valid base URL and models path.'}
                </Text>
              </Field>
              {baseUrl.length > 0 && urlError === null && previewUrl === null && (
                <Text accessibilityRole="alert" style={{ color: colors.errorText, fontFamily: fonts.mono, fontSize: typography.label }}>Enter a valid models path.</Text>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: spacing.small }}>
      <Text style={{ color: colors.text, fontFamily: fonts.headingMedium, fontSize: typography.body }}>{label}</Text>
      {children}
    </View>
  );
}
