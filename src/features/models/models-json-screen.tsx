import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';

import { pickOverridesJson, shareOverridesJson } from '../../services/persistence/catalog-transfer';
import type { OverridesPreview } from '../../services/persistence/catalog-store';
import { colors, fonts, typography } from '../../ui/tokens';
import { useActiveEndpoint } from '../setup/use-active-endpoint';
import { useModelCatalog } from './use-model-catalog';

export default function ModelsJsonScreen() {
  const { status, profile } = useActiveEndpoint();
  const catalog = useModelCatalog(profile);
  const [draft, setDraft] = useState<string | null>(null);
  const [preview, setPreview] = useState<OverridesPreview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<'import' | 'export' | 'preview' | 'save' | null>(null);
  const [focused, setFocused] = useState(false);

  if (status === 'loading' || catalog.loading || catalog.runtime === null) {
    return <LoadingScreen />;
  }

  const text = draft ?? catalog.exportOverrides();
  const currentEndpoint = profile?.id ?? 'No endpoint';
  const hasEdits = draft !== null && draft !== catalog.exportOverrides();

  async function check(value = text) {
    setBusy('preview');
    try {
      const result = await catalog.previewOverrides(value);
      setPreview(result);
      setMessage(null);
      return result;
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    setBusy('save');
    try {
      const result = await catalog.applyOverridesText(text);
      setPreview(result);
      if (result.ok) {
        setDraft(catalog.exportOverrides());
        setMessage('Overrides saved atomically. A one-generation backup was retained.');
      }
    } finally {
      setBusy(null);
    }
  }

  async function importFile() {
    setBusy('import');
    try {
      const imported = await pickOverridesJson();
      if (imported === null) {
        return;
      }
      setDraft(imported);
      const result = await catalog.previewOverrides(imported);
      setPreview(result);
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Import could not be read.');
    } finally {
      setBusy(null);
    }
  }

  async function exportFile() {
    setBusy('export');
    try {
      await shareOverridesJson(catalog.exportOverrides());
      setMessage('Override JSON is ready to share.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Export failed.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="light" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12, padding: 16, paddingBottom: 32 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to model catalog"
              onPress={() => router.back()}
              style={({ pressed }) => ({
                minHeight: 44,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                opacity: pressed ? 0.7 : 1,
              })}>
              <SymbolView name={{ ios: 'chevron.left', android: 'arrow_back' }} size={18} tintColor={colors.muted} />
              <Text style={{ color: colors.muted, fontFamily: fonts.monoMedium, fontSize: 10 }}>CATALOG</Text>
            </Pressable>
            <EndpointBadge label={currentEndpoint} />
          </View>

          <View style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <SymbolView name={{ ios: 'terminal', android: 'terminal' }} size={20} tintColor={colors.primary} />
              <Text style={{ color: colors.text, fontFamily: fonts.heading, fontSize: 18 }}>Model JSON Overrides</Text>
            </View>
            <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 11, lineHeight: 16 }}>
              Validate model metadata and request limits before atomically replacing local overrides.
            </Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 8, borderRadius: 4, backgroundColor: colors.surfaceLow, padding: 10 }}>
            <SymbolView name={{ ios: 'lock.shield', android: 'enhanced_encryption' }} size={18} tintColor={colors.warning} />
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text style={{ color: colors.warning, fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 0.5 }}>
                CREDENTIAL ISOLATION
              </Text>
              <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 10, lineHeight: 15 }}>
                API keys, auth headers, and endpoint URLs are excluded from this payload and export.
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <ToolbarButton label="Import" icon={{ ios: 'square.and.arrow.down', android: 'file_upload' }} busy={busy === 'import'} disabled={busy !== null} onPress={() => void importFile()} />
            <ToolbarButton label="Export" icon={{ ios: 'square.and.arrow.up', android: 'file_download' }} busy={busy === 'export'} disabled={busy !== null} onPress={() => void exportFile()} tone="secondary" />
            <ToolbarButton label="Validate" icon={{ ios: 'checkmark.seal', android: 'fact_check' }} busy={busy === 'preview'} disabled={busy !== null} onPress={() => void check()} />
          </View>

          <View style={{ borderRadius: 8, borderWidth: 1, borderColor: focused ? colors.primary : colors.border, backgroundColor: colors.surfaceLowest }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surfaceLow, paddingHorizontal: 10, paddingVertical: 8 }}>
              <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.error }} />
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.warning }} />
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary }} />
                <Text numberOfLines={1} style={{ flex: 1, color: colors.muted, fontFamily: fonts.mono, fontSize: 10 }}>
                  model-overrides.json
                </Text>
              </View>
              <Text style={{ color: colors.secondary, fontFamily: fonts.monoMedium, fontSize: 10 }}>JSON</Text>
            </View>
            <TextInput
              accessibilityLabel="Raw model overrides JSON"
              accessibilityHint="Edit the model override JSON before validating and applying it"
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
              selectionColor={colors.primary}
              cursorColor={colors.primary}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              style={{
                minHeight: 360,
                color: colors.text,
                fontFamily: Platform.select({ android: 'monospace', default: fonts.mono }),
                fontSize: typography.body,
                lineHeight: 18,
                padding: 12,
              }}
            />
          </View>

          <ValidationNotice preview={preview} changed={hasEdits} />

          {message !== null && (
            <View accessibilityRole="alert" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 4, backgroundColor: colors.surfaceHigh, padding: 10 }}>
              <SymbolView name={{ ios: 'info.circle', android: 'info' }} size={16} tintColor={colors.secondary} />
              <Text style={{ flex: 1, color: colors.text, fontFamily: fonts.mono, fontSize: 10, lineHeight: 15 }}>{message}</Text>
            </View>
          )}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Validate and apply overrides"
            accessibilityHint="Validate JSON and atomically replace local model overrides"
            accessibilityState={{ busy: busy === 'save', disabled: busy !== null }}
            disabled={busy !== null}
            onPress={() => void save()}
            style={({ pressed }) => ({
              minHeight: 52,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              borderRadius: 4,
              backgroundColor: colors.primary,
              opacity: busy !== null ? 0.7 : pressed ? 0.8 : 1,
            })}>
            {busy === 'save' ? <ActivityIndicator size="small" color={colors.primaryText} /> : <SymbolView name={{ ios: 'checkmark.seal.fill', android: 'published_with_changes' }} size={20} tintColor={colors.primaryText} />}
            <Text style={{ color: colors.primaryText, fontFamily: fonts.heading, fontSize: 13 }}>
              {busy === 'save' ? 'VALIDATING & APPLYING' : 'VALIDATE & APPLY OVERRIDES'}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function LoadingScreen() {
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="light" />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 16 }}>
        <ActivityIndicator color={colors.primary} />
        <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 13 }}>Loading model overrides.</Text>
      </View>
    </SafeAreaView>
  );
}

function EndpointBadge({ label }: { label: string }) {
  return (
    <View style={{ maxWidth: 180, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 4, backgroundColor: colors.surfaceHigh, paddingHorizontal: 7, paddingVertical: 5 }}>
      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: colors.secondary }} />
      <Text numberOfLines={1} style={{ flexShrink: 1, color: colors.secondary, fontFamily: fonts.monoMedium, fontSize: typography.meta }}>{label}</Text>
    </View>
  );
}

function ToolbarButton({ label, icon, tone = 'primary', busy, disabled, onPress }: { label: string; icon: { ios: 'square.and.arrow.down' | 'square.and.arrow.up' | 'checkmark.seal'; android: 'file_upload' | 'file_download' | 'fact_check' }; tone?: 'primary' | 'secondary'; busy: boolean; disabled: boolean; onPress: () => void }) {
  const color = colors[tone];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        borderRadius: 4,
        backgroundColor: colors.surfaceHigh,
        paddingHorizontal: 10,
        opacity: disabled ? 0.5 : pressed ? 0.75 : 1,
      })}>
      {busy ? <ActivityIndicator size="small" color={color} /> : <SymbolView name={icon} size={15} tintColor={color} />}
      <Text style={{ color: colors.text, fontFamily: fonts.monoMedium, fontSize: 10 }}>{label.toUpperCase()}</Text>
    </Pressable>
  );
}

function ValidationNotice({ preview, changed }: { preview: OverridesPreview | null; changed: boolean }) {
  if (preview === null) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 4, backgroundColor: colors.surfaceHigh, padding: 10 }}>
        <SymbolView name={{ ios: 'exclamationmark.circle', android: 'pending' }} size={18} tintColor={colors.warning} />
        <Text style={{ flex: 1, color: colors.text, fontFamily: fonts.mono, fontSize: 10, lineHeight: 15 }}>
          {changed ? 'Draft changed. Validate before applying.' : 'No validation result yet.'}
        </Text>
      </View>
    );
  }
  if (!preview.ok) {
    return (
      <View accessibilityRole="alert" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 4, backgroundColor: colors.errorBackground, padding: 10 }}>
        <SymbolView name={{ ios: 'xmark.circle.fill', android: 'cancel' }} size={18} tintColor={colors.errorText} />
        <Text selectable style={{ flex: 1, color: colors.errorText, fontFamily: fonts.mono, fontSize: 10, lineHeight: 15 }}>
          {preview.path}: {preview.message}
        </Text>
      </View>
    );
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 4, backgroundColor: colors.surfaceHigh, padding: 10 }}>
      <SymbolView name={{ ios: 'checkmark.circle.fill', android: 'check_circle' }} size={18} tintColor={colors.primary} />
      <Text style={{ flex: 1, color: colors.text, fontFamily: fonts.mono, fontSize: 10, lineHeight: 15 }}>
        {preview.affectedModelIds.length === 0
          ? 'Valid schema. No model overrides change.'
          : 'Valid schema. Changed models: ' + preview.affectedModelIds.join(', ')}
      </Text>
    </View>
  );
}
