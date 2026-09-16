import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { AuthModeSchema, validateBaseUrl } from '../src/domain/endpoint';
import { describe, type ErrorCopy } from '../src/features/setup/error-copy';
import { connectAndDiscover, suggestName, type SetupInput } from '../src/features/setup/onboarding';
import { useActiveEndpoint } from '../src/features/setup/use-active-endpoint';
import { modelsUrl } from '../src/services/transport/models';
import { seedCatalogCache } from '../src/services/persistence/catalog-seed';
import { fileCatalogStorage, readBundledDefaults } from '../src/services/persistence/catalog-files';
import { InfoBlock, PrimaryButton, Screen } from '../src/ui/components';
import { useTheme } from '../src/ui/theme';

type Edits = Partial<SetupInput>;

export default function SetupScreen() {
  const router = useRouter();
  const { status, profile } = useActiveEndpoint();
  const theme = useTheme();
  // Field yang belum disentuh tetap mengikuti nilai dari endpoint tersimpan.
  const [edits, setEdits] = useState<Edits>({});
  // Key hanya hidup selama flow submit, tidak pernah dibaca ulang dari storage.
  const [keyDraft, setKeyDraft] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ErrorCopy | null>(null);
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
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center', padding: theme.spacing.screen }}>
          <Text style={{ color: theme.colors.textMuted, fontSize: theme.typography.body }}>
            Memuat endpoint.
          </Text>
        </View>
      </Screen>
    );
  }

  const inputStyle = {
    minHeight: 48,
    paddingHorizontal: theme.spacing.screen,
    paddingVertical: 10,
    borderRadius: theme.radius.control,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
    fontSize: theme.typography.body,
  } as const;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ gap: theme.spacing.screen, padding: theme.spacing.screen }}
        keyboardShouldPersistTaps="handled">
        <View style={{ gap: 4 }}>
          <Text style={{ color: theme.colors.text, fontSize: theme.typography.title, fontWeight: '700' }}>
            {profile === null ? 'Setup endpoint' : 'Endpoint'}
          </Text>
          <Text style={{ color: theme.colors.textMuted, fontSize: theme.typography.body }}>
            Endpoint OpenAI-compatible. Protokol fase ini hanya Responses (MVP support).
          </Text>
        </View>

        <Field label="Endpoint name">
          <TextInput
            style={inputStyle}
            value={name}
            onChangeText={(value) => setEdits((current) => ({ ...current, name: value }))}
            placeholder={suggestName(baseUrl) || 'Endpoint saya'}
            placeholderTextColor={theme.colors.textMuted}
            autoCapitalize="none"
          />
        </Field>

        <Field label="Base URL">
          <TextInput
            style={inputStyle}
            value={baseUrl}
            onChangeText={(value) => setEdits((current) => ({ ...current, baseUrl: value }))}
            placeholder="https://api.amanai.dev/v1"
            placeholderTextColor={theme.colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
        </Field>
        {urlError === null ? (
          <Text style={{ color: theme.colors.textMuted, fontSize: theme.typography.meta }}>
            Preview: GET {previewUrl ?? '(lengkapi base URL)'}
          </Text>
        ) : (
          <Text style={{ color: theme.colors.danger, fontSize: theme.typography.meta }}>
            {urlError}
          </Text>
        )}

        <Field label="API key">
          <TextInput
            style={inputStyle}
            value={apiKey}
            onChangeText={setKeyDraft}
            placeholder={
              canReuseKey ? 'Tersimpan di secure storage. Isi untuk mengganti.' : 'sk-...'
            }
            placeholderTextColor={theme.colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
        </Field>

        <Field label="Auth mode">
          <View style={{ flexDirection: 'row', gap: theme.spacing.gap }}>
            {AuthModeSchema.options.map((mode) => (
              <Pressable
                key={mode}
                onPress={() => setEdits((current) => ({ ...current, authMode: mode }))}
                accessibilityRole="button"
                accessibilityState={{ selected: authMode === mode }}
                style={{
                  minHeight: 48,
                  justifyContent: 'center',
                  paddingHorizontal: theme.spacing.screen,
                  borderRadius: theme.radius.control,
                  borderWidth: 1,
                  borderColor: authMode === mode ? theme.colors.accent : theme.colors.border,
                  backgroundColor: authMode === mode ? theme.colors.accent : theme.colors.surface,
                }}>
                <Text
                  style={{
                    color: authMode === mode ? theme.colors.accentText : theme.colors.text,
                    fontSize: theme.typography.body,
                    fontWeight: authMode === mode ? '700' : '400',
                  }}>
                  {mode}
                </Text>
              </Pressable>
            ))}
          </View>
        </Field>

        <Pressable onPress={() => setAdvanced(!advanced)}>
          <Text style={{ color: theme.colors.accent, fontSize: theme.typography.meta }}>
            {advanced ? 'Sembunyikan advanced' : 'Advanced'}
          </Text>
        </Pressable>
        {advanced && (
          <Field label="Models path">
            <TextInput
              style={inputStyle}
              value={modelListPath}
              onChangeText={(value) =>
                setEdits((current) => ({ ...current, modelListPath: value }))
              }
              placeholder="/models"
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="none"
            />
          </Field>
        )}

        <PrimaryButton
          label={busy ? 'Menghubungkan...' : 'Connect & discover models'}
          hint="Menguji endpoint, menyimpan key, dan mengambil daftar model"
          busy={busy}
          disabled={!canConnect}
          onPress={() => void onConnect()}
        />

        {failure !== null && (
          <InfoBlock title={failure.title} body={failure.body} tone="danger" />
        )}
      </ScrollView>
    </Screen>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 4 }}>
      <Text
        style={{ color: theme.colors.text, fontSize: theme.typography.meta, fontWeight: '600' }}>
        {label}
      </Text>
      {children}
    </View>
  );
}
