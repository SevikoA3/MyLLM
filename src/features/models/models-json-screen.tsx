import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
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

import type { EndpointProfile } from '../../domain/endpoint';
import { redactText } from '../../domain/error';
import { pickOverridesJson, shareOverridesJson } from '../../services/persistence/catalog-transfer';
import type { OverridesPreview } from '../../services/persistence/catalog-store';
import { colors, fonts, interaction, radius, spacing, typography } from '../../ui/tokens';
import { useActiveEndpoint } from '../setup/use-active-endpoint';
import { useModelCatalog } from './use-model-catalog';

export default function ModelsJsonScreen() {
  const { status, profile } = useActiveEndpoint();
  if (status === 'loading') return <LoadingScreen />;
  if (profile === null) {
    return <LoadingScreen loading={false} message="Connect an endpoint to edit model overrides." connect />;
  }
  return <ModelsJsonEditor key={JSON.stringify([profile.id, profile.baseUrl, profile.credentialRef])} profile={profile} />;
}

function ModelsJsonEditor({ profile }: { profile: EndpointProfile }) {
  const catalog = useModelCatalog(profile);
  const [draft, setDraft] = useState<string | null>(null);
  const [preview, setPreview] = useState<OverridesPreview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<'import' | 'export' | 'preview' | 'save' | 'reload' | null>(null);
  const [focused, setFocused] = useState(false);
  const busyRef = useRef(false);
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  if (catalog.loading) {
    return <LoadingScreen />;
  }
  if (catalog.runtime === null) {
    return <LoadingScreen loading={false} message={message ?? 'Could not load model overrides. Try again.'} onRetry={() => void reload()} retrying={busy !== null} />;
  }

  const text = draft ?? catalog.exportOverrides();
  const currentEndpoint = profile.name;
  const hasEdits = draft !== null && draft !== catalog.exportOverrides();

  async function reload() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy('reload');
    try {
      await catalog.reload();
      setMessage(null);
    } catch {
      setMessage('Could not load model overrides. Try again.');
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  async function check(value = text) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy('preview');
    setDraft(value);
    setPreview(null);
    setMessage(null);
    try {
      const result = await catalog.previewOverrides(value);
      setPreview(result);
      setMessage(null);
      return result;
    } catch {
      setMessage('Could not validate model overrides. Try again.');
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  async function save() {
    if (busyRef.current) return;
    if (preview === null || !preview.ok) {
      await check();
      return;
    }
    busyRef.current = true;
    setBusy('save');
    setMessage(null);
    try {
      const result = await catalog.applyOverridesText(text);
      setPreview(result);
      if (result.ok) {
        setDraft(catalog.exportOverrides());
        setMessage('Model overrides saved.');
      }
    } catch {
      setMessage('Could not save model overrides. Try again.');
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  async function importFile() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy('import');
    setMessage(null);
    try {
      const imported = await pickOverridesJson();
      if (imported === null || !active.current) {
        return;
      }
      setDraft(imported);
      setPreview(null);
      const result = await catalog.previewOverrides(imported);
      setPreview(result);
      setMessage(null);
    } catch {
      setMessage('Could not import model overrides. Try again.');
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  async function exportFile() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy('export');
    setMessage(null);
    try {
      await shareOverridesJson(catalog.exportOverrides());
      setMessage('Saved model overrides are ready to share.');
    } catch {
      setMessage('Could not export saved model overrides. Try again.');
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="light" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12, padding: 16, paddingBottom: 32 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.medium }}>
            <BackButton />
            <EndpointBadge label={currentEndpoint} />
          </View>

          <View style={{ gap: 4 }}>
            <Text accessibilityRole="header" style={{ color: colors.text, fontFamily: fonts.heading, fontSize: typography.title }}>Model JSON overrides</Text>
            <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 11, lineHeight: 16 }}>
              Edit model metadata and request limits, then validate and save your changes.
            </Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 8, borderRadius: 4, backgroundColor: colors.surfaceLow, padding: 10 }}>
            <SymbolView name={{ ios: 'lock.shield', android: 'enhanced_encryption' }} size={18} tintColor={colors.warning} />
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text style={{ color: colors.warning, fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 0.5 }}>
                CREDENTIAL ISOLATION
              </Text>
              <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 10, lineHeight: 15 }}>
                Endpoint credentials are not added to this file. Keep private credentials out of model metadata. Export shares saved overrides.
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <ToolbarButton label="Import" icon={{ ios: 'square.and.arrow.down', android: 'file_upload' }} busy={busy === 'import'} disabled={busy !== null} onPress={() => void importFile()} />
            <ToolbarButton label="Export saved JSON" icon={{ ios: 'square.and.arrow.up', android: 'file_download' }} busy={busy === 'export'} disabled={busy !== null} onPress={() => void exportFile()} tone="secondary" />
            <ToolbarButton label="Validate" icon={{ ios: 'checkmark.seal', android: 'fact_check' }} busy={busy === 'preview'} disabled={busy !== null} onPress={() => void check()} />
          </View>
          <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: typography.label }}>
            Export shares saved overrides. Unsaved edits are not included.
          </Text>

          <View style={{ borderRadius: 8, borderWidth: 1, borderColor: focused ? colors.primary : colors.border, backgroundColor: colors.surfaceLowest }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surfaceLow, paddingHorizontal: 10, paddingVertical: 8 }}>
              <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ flex: 1, color: colors.muted, fontFamily: fonts.mono, fontSize: 10 }}>
                  model-overrides.json
                </Text>
              </View>
              <Text style={{ color: colors.secondary, fontFamily: fonts.monoMedium, fontSize: 10 }}>JSON</Text>
            </View>
            <TextInput
              accessibilityLabel="Raw model overrides JSON"
              accessibilityHint="Edit the model override JSON before validating and applying it"
              value={text}
              editable={busy === null}
              accessibilityState={{ disabled: busy !== null, busy: busy !== null }}
              onChangeText={(value) => {
                if (busyRef.current) return;
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
                fontFamily: fonts.mono,
                fontSize: typography.body,
                lineHeight: 18,
                padding: 12,
              }}
            />
          </View>

          <ValidationNotice preview={preview} changed={hasEdits} />
          <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: typography.label }}>
            Replaces model overrides for every endpoint in this JSON file. Removed entries inherit defaults.
          </Text>

          {message !== null && (
            <View accessibilityRole="alert" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 4, backgroundColor: colors.surfaceHigh, padding: 10 }}>
              <SymbolView name={{ ios: 'info.circle', android: 'info' }} size={16} tintColor={colors.secondary} />
              <Text style={{ flex: 1, color: colors.text, fontFamily: fonts.mono, fontSize: 10, lineHeight: 15 }}>{message}</Text>
            </View>
          )}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={preview?.ok ? 'Apply overrides' : 'Review changes'}
            accessibilityHint={preview?.ok ? 'Replace the full model overrides file with the reviewed JSON' : 'Validate JSON and review changes before replacing model overrides'}
            accessibilityState={{ busy: busy === 'save' || busy === 'preview', disabled: busy !== null }}
            disabled={busy !== null}
            onPress={() => void save()}
            style={({ pressed }) => ({
              minHeight: interaction.touchTarget,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              borderRadius: 4,
              backgroundColor: colors.primary,
              opacity: busy !== null ? interaction.disabledOpacity : pressed ? interaction.pressedOpacity : 1,
            })}>
            {busy === 'save' || busy === 'preview' ? <ActivityIndicator size="small" color={colors.primaryText} /> : <SymbolView name={{ ios: 'checkmark.seal.fill', android: 'published_with_changes' }} size={20} tintColor={colors.primaryText} />}
            <Text style={{ flexShrink: 1, textAlign: 'center', color: colors.primaryText, fontFamily: fonts.heading, fontSize: typography.body }}>
              {busy === 'save' ? 'Saving overrides...' : busy === 'preview' ? 'Reviewing changes...' : preview?.ok ? 'Apply overrides' : 'Review changes'}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function BackButton() {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back to model catalog"
      onPress={() => router.back()}
      style={({ pressed }) => ({
        minHeight: interaction.compactTouchTarget,
        maxWidth: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xsmall,
        opacity: pressed ? interaction.pressedOpacity : 1,
      })}>
      <SymbolView name={{ ios: 'chevron.left', android: 'arrow_back' }} size={18} tintColor={colors.muted} />
      <Text style={{ color: colors.muted, fontFamily: fonts.heading, fontSize: typography.body }}>Catalog</Text>
    </Pressable>
  );
}

function LoadingScreen({ loading = true, message = 'Loading model overrides.', connect = false, onRetry, retrying = false }: { loading?: boolean; message?: string; connect?: boolean; onRetry?: () => void; retrying?: boolean }) {
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="light" />
      <View style={{ paddingHorizontal: spacing.screen }}><BackButton /></View>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 16 }}>
        {loading || retrying ? <ActivityIndicator color={colors.primary} /> : null}
        <Text accessibilityRole={loading ? undefined : 'alert'} style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: typography.body }}>{message}</Text>
        {connect || onRetry !== undefined ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={connect ? 'Connect endpoint' : 'Retry'}
            accessibilityState={{ disabled: retrying, busy: retrying }}
            disabled={retrying}
            onPress={connect ? () => router.push('/setup') : onRetry}
            style={({ pressed }) => ({
              minHeight: interaction.touchTarget,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: spacing.screen,
              borderRadius: radius.control,
              backgroundColor: colors.primary,
              opacity: retrying ? interaction.disabledOpacity : pressed ? interaction.pressedOpacity : 1,
            })}>
            <Text style={{ color: colors.primaryText, fontFamily: fonts.heading, fontSize: typography.body }}>{connect ? 'Connect endpoint' : 'Retry'}</Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function EndpointBadge({ label }: { label: string }) {
  return (
    <View style={{ flexShrink: 1, borderRadius: radius.control, backgroundColor: colors.surfaceHigh, paddingHorizontal: spacing.small, paddingVertical: spacing.xsmall }}>
      <Text style={{ color: colors.secondary, fontFamily: fonts.heading, fontSize: typography.body }}>{redactText(label)}</Text>
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
        minHeight: interaction.compactTouchTarget,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        maxWidth: '100%',
        gap: 6,
        borderRadius: 4,
        backgroundColor: colors.surfaceHigh,
        paddingHorizontal: 10,
        opacity: disabled ? interaction.disabledOpacity : pressed ? interaction.pressedOpacity : 1,
      })}>
      {busy ? <ActivityIndicator size="small" color={color} /> : <SymbolView name={icon} size={15} tintColor={color} />}
      <Text style={{ flexShrink: 1, color: colors.text, fontFamily: fonts.heading, fontSize: typography.body }}>{label}</Text>
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
        <Text accessibilityRole="alert" selectable style={{ flex: 1, color: colors.errorText, fontFamily: fonts.mono, fontSize: 10, lineHeight: 15 }}>
          {redactText(preview.path + ': ' + preview.message)}
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
          : redactText('Valid schema. Changed models: ' + preview.affectedModelIds.join(', '))}
      </Text>
    </View>
  );
}
