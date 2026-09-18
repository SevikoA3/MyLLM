import { useState } from 'react';
import { router } from 'expo-router';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { pickOverridesJson, shareOverridesJson } from '../../services/persistence/catalog-transfer';
import type { OverridesPreview } from '../../services/persistence/catalog-store';
import { PrimaryButton, Screen } from '../../ui/components';
import { useTheme } from '../../ui/theme';
import { useActiveEndpoint } from '../setup/use-active-endpoint';
import { useModelCatalog } from './use-model-catalog';

export default function ModelsJsonScreen() {
  const { status, profile } = useActiveEndpoint();
  const catalog = useModelCatalog(profile);
  const theme = useTheme();
  const [draft, setDraft] = useState<string | null>(null);
  const [preview, setPreview] = useState<OverridesPreview | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (status === 'loading' || catalog.loading || catalog.runtime === null) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      </Screen>
    );
  }

  const text = draft ?? catalog.exportOverrides();

  const check = async (value = text) => {
    const result = await catalog.previewOverrides(value);
    setPreview(result);
    setMessage(null);
    return result;
  };

  const save = async () => {
    const result = await catalog.applyOverridesText(text);
    setPreview(result);
    if (result.ok) {
      setDraft(catalog.exportOverrides());
      setMessage('Override tersimpan atomik. Backup satu generasi dibuat.');
    }
  };

  const importFile = async () => {
    try {
      const imported = await pickOverridesJson();
      if (imported === null) return;
      setDraft(imported);
      await check(imported);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Import gagal dibaca.');
    }
  };

  const exportFile = async () => {
    try {
      await shareOverridesJson(catalog.exportOverrides());
      setMessage('File export siap dibagikan.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Export gagal.');
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: 12, padding: theme.spacing.screen, paddingBottom: 40 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Action label="Kembali" onPress={() => router.back()} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.text, fontSize: theme.typography.title, fontWeight: '700' }}>
                Model JSON
              </Text>
              <Text style={{ color: theme.colors.textMuted, fontSize: theme.typography.meta }}>
                Import divalidasi di memory. Credential tidak ikut export.
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Action label="Import" onPress={() => void importFile()} />
            <Action label="Export" onPress={() => void exportFile()} />
            <Action label="Preview" onPress={() => void check()} />
          </View>

          <TextInput
            accessibilityLabel="Raw model overrides JSON"
            value={text}
            onChangeText={(value) => {
              setDraft(value);
              setPreview(null);
              setMessage(null);
            }}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            textAlignVertical="top"
            style={{
              minHeight: 360,
              color: theme.colors.text,
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderWidth: 1,
              borderRadius: theme.radius.card,
              padding: 12,
              fontFamily: Platform.select({ android: 'monospace', default: undefined }),
              fontSize: 13,
            }}
          />

          {preview !== null &&
            (preview.ok ? (
              <Text style={{ color: theme.colors.text }}>
                {preview.affectedModelIds.length === 0
                  ? 'Valid. Tidak ada model berubah.'
                  : 'Valid. Model berubah: ' + preview.affectedModelIds.join(', ')}
              </Text>
            ) : (
              <Text selectable style={{ color: theme.colors.danger }}>
                {preview.path}: {preview.message}
              </Text>
            ))}
          {message !== null && <Text style={{ color: theme.colors.text }}>{message}</Text>}
          <PrimaryButton label="Validasi dan simpan" onPress={() => void save()} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Action({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        minHeight: 48,
        justifyContent: 'center',
        paddingHorizontal: 12,
        borderRadius: theme.radius.control,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
      }}>
      <Text style={{ color: theme.colors.text, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}
