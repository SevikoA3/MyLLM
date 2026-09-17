import { useMemo, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ModelOverrideSchema, type ModelOverride } from '../../domain/catalog';
import type { MergedModel } from '../../domain/catalog-merge';
import { effectiveMaxOutput, protocolOutputCap, reasoningChoices } from '../../domain/model-config';
import type { CapabilityState, InputModality } from '../../domain/model';
import { PrimaryButton, Screen } from '../../ui/components';
import { useTheme } from '../../ui/theme';
import { useActiveEndpoint } from '../setup/use-active-endpoint';
import { formatTokens } from './model-badges';
import { useModelCatalog } from './use-model-catalog';

type InheritBoolean = 'inherit' | 'true' | 'false';
type CapabilityChoice = 'inherit' | CapabilityState;
type Form = {
  displayName: string;
  enabled: InheritBoolean;
  contextWindow: string;
  maxOutputTokens: string;
  reasoningEfforts: string;
  inputModalities: string;
  streaming: CapabilityChoice;
  tools: CapabilityChoice;
  structuredOutput: CapabilityChoice;
  nativeCompaction: CapabilityChoice;
  reasoningEffort: string;
  outputLimit: string;
};

export default function ModelDetailScreen() {
  const { modelId } = useLocalSearchParams<{ modelId?: string }>();
  const { status, profile } = useActiveEndpoint();
  const catalog = useModelCatalog(profile);
  const theme = useTheme();
  const model = catalog.runtime?.models.find((entry) => entry.id === modelId) ?? null;
  const override =
    profile === null || modelId === undefined
      ? undefined
      : catalog.runtime?.overrides.endpoints[profile.id]?.models[modelId];
  const [draft, setDraft] = useState<Form | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const choices = useMemo(
    () => (model === null ? [] : reasoningChoices(model.reasoningEfforts)),
    [model],
  );

  if (status === 'loading' || catalog.loading || model === null || profile === null) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          {modelId === undefined || (status !== 'loading' && !catalog.loading && model === null) ? (
            <Text style={{ color: theme.colors.danger }}>Model tidak ditemukan.</Text>
          ) : (
            <ActivityIndicator color={theme.colors.accent} />
          )}
        </View>
      </Screen>
    );
  }

  const form = draft ?? formFrom(override);
  const setForm = setDraft;
  const ceiling = effectiveMaxOutput(model.maxOutputTokens, protocolOutputCap(profile));

  const save = async () => {
    setMessage(null);
    const built = buildOverride(form, choices.length > 0, ceiling);
    if (!built.ok) {
      setMessage(built.message);
      return;
    }
    try {
      await catalog.setOverride(model.id, built.value);
      setMessage('Tersimpan. Refresh katalog tidak akan menimpa override.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Override gagal disimpan.');
    }
  };

  const resetModel = () => {
    Alert.alert('Reset model?', 'Semua override model ini akan dihapus.', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: () => {
          void catalog.setOverride(model.id, null).then(() => {
            setForm(formFrom(undefined));
            setMessage('Override model direset.');
          });
        },
      },
    ]);
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: 14, padding: theme.spacing.screen, paddingBottom: 40 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Action label="Kembali" onPress={() => router.back()} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.text, fontSize: theme.typography.title, fontWeight: '700' }}>
                Detail model
              </Text>
              <Text selectable style={{ color: theme.colors.textMuted, fontSize: theme.typography.meta }}>
                {model.id}
              </Text>
            </View>
          </View>

          <Section title="Nilai efektif dan sumber">
            <ProvenanceRow model={model} path="displayName" label="Nama" value={model.displayName} />
            <ProvenanceRow model={model} path="contextWindow" label="Context" value={model.contextWindow} />
            <ProvenanceRow model={model} path="maxOutputTokens" label="Max output" value={model.maxOutputTokens} />
            <ProvenanceRow model={model} path="reasoningEfforts" label="Reasoning" value={model.reasoningEfforts} />
            <ProvenanceRow model={model} path="inputModalities" label="Modalitas" value={model.inputModalities} />
            <ProvenanceRow model={model} path="enabled" label="Enabled" value={model.enabled} />
            <ProvenanceRow model={model} path="capabilities.streaming" label="Streaming" value={model.capabilities.streaming} />
            <ProvenanceRow model={model} path="capabilities.tools" label="Tools" value={model.capabilities.tools} />
            <ProvenanceRow model={model} path="capabilities.structuredOutput" label="Structured output" value={model.capabilities.structuredOutput} />
            <ProvenanceRow model={model} path="capabilities.nativeCompaction" label="Native compaction" value={model.capabilities.nativeCompaction} />
            <Text style={{ color: theme.colors.textMuted, fontSize: theme.typography.meta }}>
              Batas output efektif: {ceiling === null ? 'Unknown' : formatTokens(ceiling)}
            </Text>
          </Section>

          <Section title="Override metadata">
            <Field
              label="Display name"
              value={form.displayName}
              placeholder={model.displayName}
              onChange={(value) => setForm({ ...form, displayName: value })}
              onReset={() => setForm({ ...form, displayName: '' })}
            />
            <Choice
              label="Enabled"
              value={form.enabled}
              values={['inherit', 'true', 'false']}
              onChange={(value) => setForm({ ...form, enabled: value as InheritBoolean })}
            />
            <Field
              label="Context window"
              value={form.contextWindow}
              placeholder={numberText(model.contextWindow)}
              keyboardType="number-pad"
              onChange={(value) => setForm({ ...form, contextWindow: value })}
              onReset={() => setForm({ ...form, contextWindow: '' })}
            />
            <Field
              label="Max output tokens"
              value={form.maxOutputTokens}
              placeholder={numberText(model.maxOutputTokens)}
              keyboardType="number-pad"
              onChange={(value) => setForm({ ...form, maxOutputTokens: value })}
              onReset={() => setForm({ ...form, maxOutputTokens: '' })}
            />
            <Field
              label="Reasoning efforts"
              value={form.reasoningEfforts}
              placeholder="auto, low, high"
              help="Urutan dipertahankan. Kosong = inherit; [] = array kosong."
              onChange={(value) => setForm({ ...form, reasoningEfforts: value })}
              onReset={() => setForm({ ...form, reasoningEfforts: '' })}
            />
            <Field
              label="Input modalities"
              value={form.inputModalities}
              placeholder="text, image"
              help="Pilihan: text, image, file, video. Kosong = inherit; [] = array kosong."
              onChange={(value) => setForm({ ...form, inputModalities: value })}
              onReset={() => setForm({ ...form, inputModalities: '' })}
            />
          </Section>

          <Section title="Capability">
            {(['streaming', 'tools', 'structuredOutput', 'nativeCompaction'] as const).map((key) => (
              <Choice
                key={key}
                label={key}
                value={form[key]}
                values={['inherit', 'supported', 'unsupported', 'unknown']}
                onChange={(value) => setForm({ ...form, [key]: value as CapabilityChoice })}
              />
            ))}
          </Section>

          <Section title="Request">
            {choices.length > 0 && (
              <Choice
                label="Reasoning"
                value={form.reasoningEffort}
                values={choices}
                onChange={(value) => setForm({ ...form, reasoningEffort: value })}
              />
            )}
            <Field
              label="Output limit"
              value={form.outputLimit}
              placeholder="Auto"
              help="Kosong = Auto. Request menghapus field max_output_tokens."
              keyboardType="number-pad"
              onChange={(value) => setForm({ ...form, outputLimit: value })}
              onReset={() => setForm({ ...form, outputLimit: '' })}
            />
          </Section>

          {message !== null && (
            <Text style={{ color: message.startsWith('Tersimpan') ? theme.colors.text : theme.colors.danger }}>
              {message}
            </Text>
          )}
          <PrimaryButton label="Simpan" onPress={() => void save()} />
          <Action label="Reset model" danger onPress={resetModel} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function formFrom(override: ModelOverride | undefined): Form {
  return {
    displayName: override?.displayName ?? '',
    enabled:
      typeof override?.enabled === 'boolean' ? String(override.enabled) as InheritBoolean : 'inherit',
    contextWindow: numberText(override?.contextWindow),
    maxOutputTokens: numberText(override?.maxOutputTokens),
    reasoningEfforts: arrayText(override?.reasoningEfforts),
    inputModalities: arrayText(override?.inputModalities),
    streaming: capabilityChoice(override?.capabilities?.streaming),
    tools: capabilityChoice(override?.capabilities?.tools),
    structuredOutput: capabilityChoice(override?.capabilities?.structuredOutput),
    nativeCompaction: capabilityChoice(override?.capabilities?.nativeCompaction),
    reasoningEffort: override?.request?.reasoningEffort ?? 'auto',
    outputLimit: numberText(override?.request?.outputLimit),
  };
}

function buildOverride(
  form: Form,
  hasReasoningPicker: boolean,
  ceiling: number | null,
): { ok: true; value: ModelOverride } | { ok: false; message: string } {
  const contextWindow = positiveInteger(form.contextWindow, 'Context window');
  if (!contextWindow.ok) return contextWindow;
  const maxOutputTokens = positiveInteger(form.maxOutputTokens, 'Max output tokens');
  if (!maxOutputTokens.ok) return maxOutputTokens;
  const outputLimit = positiveInteger(form.outputLimit, 'Output limit');
  if (!outputLimit.ok) return outputLimit;
  if (outputLimit.value !== null && ceiling !== null && outputLimit.value > ceiling) {
    return { ok: false, message: `Output limit maksimal ${String(ceiling)}.` };
  }
  const reasoningEfforts = stringArray(form.reasoningEfforts);
  const inputModalities = stringArray(form.inputModalities);
  const candidate = {
    displayName: form.displayName.trim() || null,
    enabled: form.enabled === 'inherit' ? null : form.enabled === 'true',
    contextWindow: contextWindow.value,
    maxOutputTokens: maxOutputTokens.value,
    reasoningEfforts,
    inputModalities: inputModalities as InputModality[] | null,
    capabilities: {
      streaming: inherited(form.streaming),
      tools: inherited(form.tools),
      structuredOutput: inherited(form.structuredOutput),
      nativeCompaction: inherited(form.nativeCompaction),
    },
    request: {
      reasoningEffort: hasReasoningPicker ? form.reasoningEffort : null,
      outputLimit: outputLimit.value,
    },
  };
  const parsed = ModelOverrideSchema.safeParse(candidate);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, message: `${issue.path.map(String).join('.')}: ${issue.message}` };
  }
  return { ok: true, value: parsed.data };
}

function positiveInteger(
  text: string,
  label: string,
): { ok: true; value: number | null } | { ok: false; message: string } {
  if (text.trim() === '') return { ok: true, value: null };
  const value = Number(text);
  return Number.isSafeInteger(value) && value > 0
    ? { ok: true, value }
    : { ok: false, message: `${label} harus bilangan bulat positif.` };
}

function stringArray(text: string): string[] | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  if (trimmed === '[]') return [];
  return trimmed.split(',').map((value) => value.trim()).filter(Boolean);
}

function inherited(value: CapabilityChoice): CapabilityState | null {
  return value === 'inherit' ? null : value;
}

function capabilityChoice(value: CapabilityState | null | undefined): CapabilityChoice {
  return value ?? 'inherit';
}

function numberText(value: number | null | undefined): string {
  return typeof value === 'number' ? String(value) : '';
}

function arrayText(value: readonly string[] | null | undefined): string {
  if (value === undefined || value === null) return '';
  return value.length === 0 ? '[]' : value.join(', ');
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 10, padding: 14, borderRadius: theme.radius.card, backgroundColor: theme.colors.surface }}>
      <Text style={{ color: theme.colors.text, fontSize: theme.typography.subtitle, fontWeight: '700' }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function ProvenanceRow({
  model,
  path,
  label,
  value,
}: {
  model: MergedModel;
  path: string;
  label: string;
  value: string | number | boolean | null | string[];
}) {
  const theme = useTheme();
  const source = model.provenance[path]?.source ?? 'unknown';
  const text = Array.isArray(value) ? (value.length === 0 ? 'Unknown' : value.join(', ')) : value ?? 'Unknown';
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Text style={{ color: theme.colors.textMuted, flex: 1 }}>{label}</Text>
      <Text selectable style={{ color: theme.colors.text, flex: 2, textAlign: 'right' }}>
        {String(text)} · {source}
      </Text>
    </View>
  );
}

function Field({
  label,
  value,
  placeholder,
  help,
  keyboardType,
  onChange,
  onReset,
}: {
  label: string;
  value: string;
  placeholder: string;
  help?: string;
  keyboardType?: 'default' | 'number-pad';
  onChange: (value: string) => void;
  onReset: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: theme.colors.text, fontWeight: '600' }}>{label}</Text>
        <Pressable accessibilityRole="button" onPress={onReset}>
          <Text style={{ color: theme.colors.accent, fontWeight: '700' }}>Reset</Text>
        </Pressable>
      </View>
      <TextInput
        accessibilityLabel={label}
        value={value}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textMuted}
        keyboardType={keyboardType}
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={onChange}
        style={{
          minHeight: 46,
          color: theme.colors.text,
          backgroundColor: theme.colors.background,
          borderColor: theme.colors.border,
          borderWidth: 1,
          borderRadius: theme.radius.control,
          paddingHorizontal: 12,
        }}
      />
      {help !== undefined && <Text style={{ color: theme.colors.textMuted, fontSize: theme.typography.meta }}>{help}</Text>}
    </View>
  );
}

function Choice({
  label,
  value,
  values,
  onChange,
}: {
  label: string;
  value: string;
  values: readonly string[];
  onChange: (value: string) => void;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: theme.colors.text, fontWeight: '600' }}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {values.map((entry) => (
          <Pressable
            key={entry}
            accessibilityRole="radio"
            accessibilityState={{ checked: value === entry }}
            onPress={() => onChange(entry)}
            style={{
              minHeight: 40,
              justifyContent: 'center',
              paddingHorizontal: 10,
              borderRadius: theme.radius.pill,
              borderWidth: 1,
              borderColor: value === entry ? theme.colors.borderStrong : theme.colors.border,
              backgroundColor: value === entry ? theme.colors.accent : theme.colors.background,
            }}>
            <Text style={{ color: value === entry ? theme.colors.accentText : theme.colors.text }}>
              {entry}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Action({ label, danger = false, onPress }: { label: string; danger?: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        minHeight: 44,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 12,
        borderRadius: theme.radius.control,
        borderWidth: 1,
        borderColor: danger ? theme.colors.danger : theme.colors.border,
      }}>
      <Text style={{ color: danger ? theme.colors.danger : theme.colors.text, fontWeight: '700' }}>
        {label}
      </Text>
    </Pressable>
  );
}
