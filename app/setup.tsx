import { useRouter } from 'expo-router';
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

type Edits = Partial<SetupInput>;

const colors = {
  background: '#0b1326',
  panel: '#131b2e',
  panelLowest: '#060e20',
  control: '#1e293b',
  controlActive: '#222a3d',
  border: '#3c4a42',
  outline: '#86948a',
  text: '#dae2fd',
  muted: '#bbcabf',
  primary: '#4edea3',
  primaryText: '#003824',
  secondary: '#4cd7f6',
  warning: '#ffb95f',
  errorBackground: '#93000a',
  errorText: '#ffdad6',
} as const;

const cardStyle = {
  gap: 12,
  padding: 12,
  borderRadius: 8,
  borderWidth: 1,
  borderColor: colors.border,
  backgroundColor: colors.panel,
} as const;

const fonts = {
  heading: 'Inter_600SemiBold',
  mono: 'JetBrainsMono_400Regular',
  monoMedium: 'JetBrainsMono_500Medium',
} as const;

export default function SetupScreen() {
  const router = useRouter();
  const { status, profile } = useActiveEndpoint();
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

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const name = edits.name ?? profile?.name ?? '';
  const baseUrl = edits.baseUrl ?? profile?.baseUrl ?? '';
  const authMode = edits.authMode ?? profile?.authMode ?? 'bearer';
  const protocol = edits.protocol ?? profile?.protocol ?? 'responses';
  const modelListPath = edits.modelListPath ?? profile?.compat.modelListPath ?? '/models';
  // Key lama tidak pernah dibaca ke form, jadi field tetap kosong sampai pengguna mengetik.
  const canReuseKey = profile?.credentialRef != null;
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
    !busy && baseUrl.length > 0 && urlError === null && (apiKey.length > 0 || canReuseKey);

  // Setelah connect, pengguna memilih model lewat layar picker, bukan lewat
  // routing diam-diam ke tab utama.
  const seeded = useRef(false);

  async function onConnect() {
    setFailure(null);
    setBusy(true);
    const input: SetupInput = {
      name: edits.name ?? suggestName(baseUrl),
      baseUrl,
      apiKey,
      apiKeyChanged: keyDraft !== null,
      authMode,
      protocol,
      modelListPath,
    };
    const result = await connectAndDiscover(input, profile, {
      seedCatalog: async (nextProfile, models) => {
        const result = await seedCatalogCache(nextProfile, models, {
          storage: fileCatalogStorage,
          readDefaults: readBundledDefaults,
        });
        seeded.current = result.ok;
        return result;
      },
    });
    if (!mounted.current) {
      return;
    }
    setBusy(false);
    // Field dikosongkan baik saat save berhasil maupun saat gagal.
    setKeyDraft(null);
    if (!result.ok) {
      setFailure(describe(result.error, previewUrl ?? baseUrl));
      return;
    }
    router.replace(seeded.current ? '/models' : '/(tabs)');
  }

  if (status === 'loading') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <StatusBar style="light" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 16 }}>
          <ActivityIndicator color={colors.primary} />
          <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 13 }}>
            Loading endpoint configuration.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const inputStyle = (field: string) => ({
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: focusedField === field ? colors.primary : colors.border,
    backgroundColor: focusedField === field ? colors.controlActive : colors.control,
    color: colors.text,
    fontFamily: fonts.mono,
    fontSize: 13,
  });
  const diagnosticLabel = busy ? 'CONNECTING' : failure === null ? 'READY' : 'FAILED';
  const diagnosticColor = busy ? colors.secondary : failure === null ? colors.primary : colors.errorText;
  const diagnosticText = busy
    ? 'Testing endpoint and retrieving the model catalog.'
    : failure === null
      ? 'Enter endpoint details, then run model discovery.'
      : 'Connection failed. Review the diagnostic record below.';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="light" />
      <View
        style={{
          height: 56,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: colors.panel,
        }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ color: colors.primary, fontFamily: fonts.heading, fontSize: 18, letterSpacing: -0.4 }}>
            MyLLM
          </Text>
          <Text style={{ color: colors.muted, fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 0.6 }}>
            SETUP
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: profile === null ? colors.warning : colors.primary,
            }}
          />
          <Text style={{ color: profile === null ? colors.warning : colors.primary, fontFamily: fonts.monoMedium, fontSize: 10 }}>
            {profile === null ? 'NEW' : 'CONFIGURED'}
          </Text>
        </View>
      </View>
      <ScrollView
        contentContainerStyle={{ gap: 12, padding: 16, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled">
        <View style={{ gap: 4, paddingTop: 4, paddingBottom: 4 }}>
          <Text
            style={{ color: colors.secondary, fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 0.8 }}>
            ENDPOINT ONBOARDING
          </Text>
          <Text style={{ color: colors.text, fontFamily: fonts.heading, fontSize: 26, lineHeight: 32 }}>
            {profile === null ? 'Connect an endpoint' : 'Update endpoint'}
          </Text>
          <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 13, lineHeight: 20 }}>
            Configure an OpenAI-compatible endpoint, then validate its model catalog.
          </Text>
        </View>

        <View style={cardStyle}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: diagnosticColor }} />
              <Text style={{ color: colors.muted, fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 0.6 }}>
                CONNECTION DIAGNOSTICS
              </Text>
            </View>
            <Text style={{ color: diagnosticColor, fontFamily: fonts.monoMedium, fontSize: 10 }}>
              {diagnosticLabel}
            </Text>
          </View>
          <Text style={{ color: colors.text, fontFamily: fonts.mono, fontSize: 11, lineHeight: 16 }}>
            {diagnosticText}
          </Text>
        </View>

        <View style={cardStyle}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Text style={{ color: colors.muted, fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 0.6 }}>
              ENDPOINT PROFILE
            </Text>
            <Text style={{ color: colors.secondary, fontFamily: fonts.monoMedium, fontSize: 10 }}>
              {profile === null ? 'NEW' : 'EDIT'}
            </Text>
          </View>

          <Field label="Endpoint name" detail="DISPLAY LABEL">
            <TextInput
              accessibilityLabel="Endpoint name"
              accessibilityHint="Name shown in the app"
              style={inputStyle('name')}
              value={name}
              onChangeText={(value) => setEdits((current) => ({ ...current, name: value }))}
              placeholder={suggestName(baseUrl) || 'My endpoint'}
              placeholderTextColor={colors.muted}
              selectionColor={colors.primary}
              cursorColor={colors.primary}
              onFocus={() => setFocusedField('name')}
              onBlur={() => setFocusedField(null)}
              autoCapitalize="none"
            />
          </Field>

          <Field label="Base URL" detail="HTTPS OR HTTP LOOPBACK">
            <TextInput
              accessibilityLabel="Endpoint base URL"
              accessibilityHint="HTTPS URL for the OpenAI-compatible endpoint"
              style={inputStyle('baseUrl')}
              value={baseUrl}
              onChangeText={(value) => setEdits((current) => ({ ...current, baseUrl: value }))}
              placeholder="https://api.amanai.dev/v1"
              placeholderTextColor={colors.muted}
              selectionColor={colors.primary}
              cursorColor={colors.primary}
              onFocus={() => setFocusedField('baseUrl')}
              onBlur={() => setFocusedField(null)}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </Field>
          {urlError === null ? (
            <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 11 }}>
              Route preview updates as you type.
            </Text>
          ) : (
            <Text style={{ color: colors.errorText, fontFamily: fonts.mono, fontSize: 11, lineHeight: 16 }}>
              {urlError}
            </Text>
          )}

          <Field label="API key" detail="NEW OR SAVED KEY" detailColor={colors.warning}>
            <TextInput
              accessibilityLabel="API key"
              accessibilityHint="Credential is stored in secure storage"
              style={inputStyle('apiKey')}
              value={apiKey}
              onChangeText={setKeyDraft}
              placeholder={
                canReuseKey ? 'Saved in secure storage. Enter a new key to replace it.' : 'sk-...'
              }
              placeholderTextColor={colors.muted}
              selectionColor={colors.primary}
              cursorColor={colors.primary}
              onFocus={() => setFocusedField('apiKey')}
              onBlur={() => setFocusedField(null)}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />
            <View
              style={{
                borderLeftWidth: 2,
                borderLeftColor: colors.primary,
                backgroundColor: colors.panelLowest,
                paddingHorizontal: 10,
                paddingVertical: 8,
              }}>
              <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 10, lineHeight: 14 }}>
                Keys are stored in Android Keystore after a successful connection. A saved key is never loaded back into this field.
              </Text>
            </View>
          </Field>
        </View>

        <View style={cardStyle}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Text style={{ color: colors.muted, fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 0.6 }}>
              MODEL DISCOVERY ROUTE
            </Text>
            <Text style={{ color: colors.secondary, fontFamily: fonts.monoMedium, fontSize: 10 }}>
              GET
            </Text>
          </View>
          <View style={{ borderRadius: 4, backgroundColor: colors.controlActive, padding: 10 }}>
            <Text
              selectable
              style={{
                color: previewUrl === null ? colors.muted : colors.secondary,
                fontFamily: fonts.mono,
                fontSize: 11,
                lineHeight: 16,
              }}>
              {previewUrl ?? 'Waiting for a valid base URL'}
            </Text>
          </View>
          <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 10, lineHeight: 14 }}>
            Exact route checked before model selection.
          </Text>
        </View>

        <View style={cardStyle}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Text style={{ color: colors.muted, fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 0.6 }}>
              COMPATIBILITY
            </Text>
            <Text style={{ color: colors.secondary, fontFamily: fonts.monoMedium, fontSize: 10 }}>
              MVP SUPPORT
            </Text>
          </View>

          <Field label="Auth mode" detail="REQUEST HEADER">
            <View style={{ flexDirection: 'row', gap: 4, borderRadius: 4, backgroundColor: colors.control, padding: 4 }}>
              {AuthModeSchema.options.map((mode) => (
                <Pressable
                  key={mode}
                  onPress={() => setEdits((current) => ({ ...current, authMode: mode }))}
                  onFocus={() => setFocusedControl('auth-' + mode)}
                  onBlur={() => setFocusedControl(null)}
                  accessibilityRole="button"
                  accessibilityLabel={'Auth mode ' + mode}
                  accessibilityHint="Choose the endpoint authentication mode"
                  accessibilityState={{ selected: authMode === mode }}
                  style={{
                    flex: 1,
                    minHeight: 48,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 4,
                    borderWidth: 1,
                    borderColor:
                      focusedControl === 'auth-' + mode || authMode === mode ? colors.primary : 'transparent',
                    backgroundColor: authMode === mode ? colors.controlActive : 'transparent',
                  }}>
                  <Text
                    style={{
                      color: authMode === mode ? colors.primary : colors.muted,
                      fontFamily: authMode === mode ? fonts.monoMedium : fonts.mono,
                      fontSize: 11,
                    }}>
                    {mode}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Field>

          <Field label="Chat protocol" detail="STREAM SCHEMA">
            <View style={{ flexDirection: 'row', gap: 4, borderRadius: 4, backgroundColor: colors.control, padding: 4 }}>
              {ProtocolModeSchema.options.map((mode) => (
                <Pressable
                  key={mode}
                  onPress={() => setEdits((current) => ({ ...current, protocol: mode }))}
                  onFocus={() => setFocusedControl('protocol-' + mode)}
                  onBlur={() => setFocusedControl(null)}
                  accessibilityRole="button"
                  accessibilityLabel={'Chat protocol ' + mode}
                  accessibilityHint="Choose the endpoint chat protocol"
                  accessibilityState={{ selected: protocol === mode }}
                  style={{
                    flex: 1,
                    minHeight: 48,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 4,
                    borderWidth: 1,
                    borderColor:
                      focusedControl === 'protocol-' + mode || protocol === mode ? colors.primary : 'transparent',
                    backgroundColor: protocol === mode ? colors.controlActive : 'transparent',
                  }}>
                  <Text
                    numberOfLines={1}
                    style={{
                      color: protocol === mode ? colors.primary : colors.muted,
                      fontFamily: protocol === mode ? fonts.monoMedium : fonts.mono,
                      fontSize: 10,
                    }}>
                    {mode === 'chat-completions' ? 'Completions' : mode}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Field>
        </View>

        <View style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={advanced ? 'Hide advanced settings' : 'Show advanced settings'}
            accessibilityState={{ expanded: advanced }}
            onFocus={() => setFocusedControl('advanced')}
            onBlur={() => setFocusedControl(null)}
            style={{
              minHeight: 48,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottomWidth: advanced || focusedControl === 'advanced' ? 1 : 0,
              borderBottomColor: focusedControl === 'advanced' ? colors.primary : colors.border,
              paddingHorizontal: 12,
            }}
            onPress={() => setAdvanced(!advanced)}>
            <View>
              <Text style={{ color: colors.text, fontFamily: fonts.heading, fontSize: 13 }}>
                Advanced parameters
              </Text>
              <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 10, marginTop: 2 }}>
                Custom model discovery path
              </Text>
            </View>
            <Text style={{ color: colors.secondary, fontFamily: fonts.monoMedium, fontSize: 10 }}>
              {advanced ? 'HIDE' : 'SHOW'}
            </Text>
          </Pressable>
          {advanced && (
            <View style={{ gap: 8, padding: 12 }}>
              <Field label="Models path" detail="DISCOVERY PATH">
                <TextInput
                  accessibilityLabel="Models path"
                  accessibilityHint="Endpoint path used to list models"
                  style={inputStyle('modelListPath')}
                  value={modelListPath}
                  onChangeText={(value) =>
                    setEdits((current) => ({ ...current, modelListPath: value }))
                  }
                  placeholder="/models"
                  placeholderTextColor={colors.muted}
                  selectionColor={colors.primary}
                  cursorColor={colors.primary}
                  onFocus={() => setFocusedField('modelListPath')}
                  onBlur={() => setFocusedField(null)}
                  autoCapitalize="none"
                />
              </Field>
            </View>
          )}
        </View>

        {failure !== null && (
          <View
            accessibilityRole="alert"
            style={{
              gap: 6,
              borderLeftWidth: 2,
              borderLeftColor: colors.errorText,
              borderRadius: 4,
              backgroundColor: colors.errorBackground,
              padding: 12,
            }}>
            <Text style={{ color: colors.errorText, fontFamily: fonts.heading, fontSize: 15 }}>
              {failure.title}
            </Text>
            <Text style={{ color: colors.errorText, fontFamily: fonts.mono, fontSize: 11, lineHeight: 16 }}>
              {failure.body}
            </Text>
          </View>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={busy ? 'Connecting to endpoint' : 'Connect and discover models'}
          accessibilityHint="Test the endpoint, store the key, and fetch the model list"
          accessibilityState={{ busy, disabled: !canConnect }}
          disabled={!canConnect}
          onPress={() => void onConnect()}
          onFocus={() => setFocusedControl('connect')}
          onBlur={() => setFocusedControl(null)}
          style={{
            minHeight: 52,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            borderRadius: 4,
            borderWidth: focusedControl === 'connect' ? 2 : 1,
            borderColor: focusedControl === 'connect' || canConnect ? colors.primary : colors.outline,
            backgroundColor: canConnect ? colors.primary : colors.control,
            paddingHorizontal: 12,
          }}>
          {busy && <ActivityIndicator size="small" color={colors.secondary} />}
          <Text
            style={{
              color: canConnect ? colors.primaryText : colors.muted,
              fontFamily: fonts.heading,
              fontSize: 15,
            }}>
            {busy ? 'Connecting...' : 'Connect and discover models'}
          </Text>
        </Pressable>

        <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 10, lineHeight: 14 }}>
          Credentials are sent only to the configured origin. Redirects are not followed.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({
  label,
  detail,
  detailColor = colors.muted,
  children,
}: {
  label: string;
  detail?: string;
  detailColor?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Text style={{ flex: 1, minWidth: 0, color: colors.text, fontFamily: fonts.heading, fontSize: 13 }}>
          {label}
        </Text>
        {detail !== undefined && (
          <Text
            style={{
              flexShrink: 1,
              color: detailColor,
              fontFamily: fonts.monoMedium,
              fontSize: 10,
              letterSpacing: 0.4,
              textAlign: 'right',
            }}>
            {detail}
          </Text>
        )}
      </View>
      {children}
    </View>
  );
}
