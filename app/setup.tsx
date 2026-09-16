import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthModeSchema, validateBaseUrl } from '../src/domain/endpoint';
import { describe, type ErrorCopy } from '../src/features/setup/error-copy';
import { connectAndDiscover, suggestName, type SetupInput } from '../src/features/setup/onboarding';
import { useActiveEndpoint } from '../src/features/setup/use-active-endpoint';
import { modelsUrl } from '../src/services/transport/models';
import { seedCatalogCache } from '../src/services/persistence/catalog-seed';
import { fileCatalogStorage, readBundledDefaults } from '../src/services/persistence/catalog-files';

const inputClass =
  'rounded-lg border border-neutral-300 bg-white px-3 py-2 text-base text-black dark:border-neutral-700 dark:bg-neutral-900 dark:text-white';

type Edits = Partial<SetupInput>;

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
      <SafeAreaView className="flex-1 items-center justify-center bg-white dark:bg-black">
        <Text className="text-base text-neutral-600 dark:text-neutral-400">Memuat endpoint.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-black">
      <ScrollView contentContainerClassName="gap-4 p-4" keyboardShouldPersistTaps="handled">
        <View className="gap-1">
          <Text className="text-xl font-bold text-black dark:text-white">
            {profile === null ? 'Setup endpoint' : 'Endpoint'}
          </Text>
          <Text className="text-base text-neutral-600 dark:text-neutral-400">
            Endpoint OpenAI-compatible. Protokol fase ini hanya Responses (MVP support).
          </Text>
        </View>

        <Field label="Endpoint name">
          <TextInput
            className={inputClass}
            value={name}
            onChangeText={(value) => setEdits((current) => ({ ...current, name: value }))}
            placeholder={suggestName(baseUrl) || 'Endpoint saya'}
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
          />
        </Field>

        <Field label="Base URL">
          <TextInput
            className={inputClass}
            value={baseUrl}
            onChangeText={(value) => setEdits((current) => ({ ...current, baseUrl: value }))}
            placeholder="https://api.amanai.dev/v1"
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
        </Field>
        {urlError === null ? (
          <Text className="text-sm text-neutral-500 dark:text-neutral-400">
            Preview: GET {previewUrl ?? '(lengkapi base URL)'}
          </Text>
        ) : (
          <Text className="text-sm text-red-600 dark:text-red-400">{urlError}</Text>
        )}

        <Field label="API key">
          <TextInput
            className={inputClass}
            value={apiKey}
            onChangeText={setKeyDraft}
            placeholder={
              canReuseKey ? 'Tersimpan di secure storage. Isi untuk mengganti.' : 'sk-...'
            }
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
        </Field>

        <Field label="Auth mode">
          <View className="flex-row gap-2">
            {AuthModeSchema.options.map((mode) => (
              <Pressable
                key={mode}
                onPress={() => setEdits((current) => ({ ...current, authMode: mode }))}
                className={
                  'rounded-lg border px-3 py-2 ' +
                  (authMode === mode
                    ? 'border-black bg-black dark:border-white dark:bg-white'
                    : 'border-neutral-300 dark:border-neutral-700')
                }>
                <Text
                  className={
                    authMode === mode
                      ? 'text-base text-white dark:text-black'
                      : 'text-base text-black dark:text-white'
                  }>
                  {mode}
                </Text>
              </Pressable>
            ))}
          </View>
        </Field>

        <Pressable onPress={() => setAdvanced(!advanced)}>
          <Text className="text-sm text-blue-600 dark:text-blue-400">
            {advanced ? 'Sembunyikan advanced' : 'Advanced'}
          </Text>
        </Pressable>
        {advanced && (
          <Field label="Models path">
            <TextInput
              className={inputClass}
              value={modelListPath}
              onChangeText={(value) =>
                setEdits((current) => ({ ...current, modelListPath: value }))
              }
              placeholder="/models"
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
            />
          </Field>
        )}

        <Pressable
          disabled={!canConnect}
          onPress={onConnect}
          className={
            'rounded-lg px-4 py-3 ' +
            (canConnect ? 'bg-black dark:bg-white' : 'bg-neutral-300 dark:bg-neutral-700')
          }>
          <Text className="text-center text-base font-semibold text-white dark:text-black">
            {busy ? 'Menghubungkan...' : 'Connect & discover models'}
          </Text>
        </Pressable>

        {failure !== null && (
          <View className="gap-1 rounded-lg border border-red-300 p-3 dark:border-red-800">
            <Text className="text-base font-semibold text-red-700 dark:text-red-400">
              {failure.title}
            </Text>
            <Text className="text-sm text-red-700 dark:text-red-400">{failure.body}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="gap-1">
      <Text className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{label}</Text>
      {children}
    </View>
  );
}
