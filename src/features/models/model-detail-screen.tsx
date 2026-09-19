import { useMemo, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ModelOverrideSchema, type ModelOverride } from '../../domain/catalog';
import type { CatalogSource, MergedModel } from '../../domain/catalog-merge';
import { effectiveMaxOutput, protocolOutputCap, reasoningChoices } from '../../domain/model-config';
import type { CapabilityState, InputModality } from '../../domain/model';
import { useActiveEndpoint } from '../setup/use-active-endpoint';
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

const colors = {
  background: '#0b1326',
  surfaceLowest: '#060e20',
  surfaceLow: '#131b2e',
  surface: '#171f33',
  surfaceHigh: '#222a3d',
  border: '#334155',
  outline: '#86948a',
  text: '#dae2fd',
  muted: '#bbcabf',
  primary: '#10b981',
  primaryText: '#020617',
  secondary: '#06b6d4',
  warning: '#f59e0b',
  error: '#ef4444',
} as const;

const fonts = {
  heading: 'Inter_600SemiBold',
  mono: 'JetBrainsMono_400Regular',
  monoMedium: 'JetBrainsMono_500Medium',
} as const;

export default function ModelDetailScreen() {
  const { modelId } = useLocalSearchParams<{ modelId?: string }>();
  const { status, profile } = useActiveEndpoint();
  const catalog = useModelCatalog(profile);
  const model = catalog.runtime?.models.find((entry) => entry.id === modelId) ?? null;
  const override =
    profile === null || modelId === undefined
      ? undefined
      : catalog.runtime?.overrides.endpoints[profile.id]?.models[modelId];
  const [draft, setDraft] = useState<Form | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);

  const choices = useMemo(
    () => (model === null ? [] : reasoningChoices(model.reasoningEfforts)),
    [model],
  );

  if (status === 'loading' || catalog.loading || model === null || profile === null) {
    const missing = modelId === undefined || (status !== 'loading' && !catalog.loading && model === null);
    return <DetailState loading={!missing} message={missing ? 'Model not found.' : 'Loading model specification.'} />;
  }

  const form = draft ?? formFrom(override);
  const ceiling = effectiveMaxOutput(model.maxOutputTokens, protocolOutputCap(profile));
  const hasOverride = override !== undefined;

  const save = async () => {
    setMessage(null);
    const built = buildOverride(form, choices.length > 0, ceiling);
    if (!built.ok) {
      setMessage(built.message);
      return;
    }
    try {
      await catalog.setOverride(model.id, built.value);
      setMessage('Overrides saved locally. Catalog refresh will preserve them.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Override could not be saved.');
    }
  };

  const resetModel = async () => {
    try {
      await catalog.setOverride(model.id, null);
      setDraft(formFrom(undefined));
      setMessage('Model overrides reset to inherited values.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Model override could not be reset.');
    } finally {
      setResetOpen(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="light" />
      <AppBar />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12, padding: 16, paddingBottom: 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back to model catalog"
                onPress={() => router.back()}
                hitSlop={4}
                style={({ pressed }) => ({
                  width: 40,
                  height: 40,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 8,
                  backgroundColor: colors.surface,
                  opacity: pressed ? 0.8 : 1,
                })}>
                <SymbolView name={{ ios: 'chevron.left', android: 'arrow_back' }} size={20} tintColor={colors.text} />
              </Pressable>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={{ color: colors.primary, fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 0.8 }}>
                  CATALOG / INSPECTION
                </Text>
                <Text numberOfLines={1} style={{ color: colors.text, fontFamily: fonts.heading, fontSize: 18, lineHeight: 24 }}>
                  Model Spec & Overrides
                </Text>
              </View>
            </View>
            <SourceBadge source={hasOverride ? 'user-override' : null} label={hasOverride ? 'OVERRIDE' : 'INHERITED'} />
          </View>

          <IdentifierCard model={model} />
          <ProvenanceLegend />

          <Panel title="Effective specifications" icon={{ ios: 'slider.horizontal.3', android: 'tune' }} accent={colors.primary}>
            <SpecificationRow model={model} path="displayName" label="Display name" value={model.displayName} />
            <SpecificationRow model={model} path="contextWindow" label="Context window" value={tokenText(model.contextWindow)} />
            <SpecificationRow model={model} path="maxOutputTokens" label="Maximum output" value={tokenText(model.maxOutputTokens)} />
            <SpecificationRow
              model={model}
              path="reasoningEfforts"
              label="Thinking levels"
              value={model.reasoningEfforts.length === 0 ? 'Unknown' : model.reasoningEfforts.join(' · ')}
            />
            <SpecificationRow
              model={model}
              path="inputModalities"
              label="Input modalities"
              value={model.inputModalities.length === 0 ? 'Unknown' : model.inputModalities.join(', ')}
            />
            <SpecificationRow model={model} path="capabilities.streaming" label="Streaming" value={capabilityText(model.capabilities.streaming)} />
            <SpecificationRow model={model} path="capabilities.tools" label="Tool calling" value={capabilityText(model.capabilities.tools)} />
            <SpecificationRow
              model={model}
              path="capabilities.structuredOutput"
              label="Structured output"
              value={capabilityText(model.capabilities.structuredOutput)}
            />
            <SpecificationRow
              model={model}
              path="capabilities.nativeCompaction"
              label="Native compaction"
              value={capabilityText(model.capabilities.nativeCompaction)}
            />
            <DerivedRow label="Effective output cap" value={tokenText(ceiling)} />
          </Panel>

          <Panel title="Modify local overrides" icon={{ ios: 'wrench.and.screwdriver', android: 'build_circle' }} accent={colors.warning} tag="CLIENT SIDE">
            <Field
              label="Display name"
              value={form.displayName}
              placeholder={model.displayName}
              onChange={(value) => setDraft({ ...form, displayName: value })}
              onReset={() => setDraft({ ...form, displayName: '' })}
            />
            <Choice
              label="Show in Chat Model Picker"
              help="Inherit follows the current catalog state."
              value={form.enabled}
              values={['inherit', 'true', 'false']}
              labels={{ inherit: 'INHERIT', true: 'SHOWN', false: 'HIDDEN' }}
              onChange={(value) => setDraft({ ...form, enabled: value as InheritBoolean })}
            />
            <Field
              label="Override max context tokens"
              value={form.contextWindow}
              placeholder={numberText(model.contextWindow)}
              keyboardType="number-pad"
              onChange={(value) => setDraft({ ...form, contextWindow: value })}
              onReset={() => setDraft({ ...form, contextWindow: '' })}
            />
            <Field
              label="Override max output tokens"
              value={form.maxOutputTokens}
              placeholder={numberText(model.maxOutputTokens)}
              keyboardType="number-pad"
              onChange={(value) => setDraft({ ...form, maxOutputTokens: value })}
              onReset={() => setDraft({ ...form, maxOutputTokens: '' })}
            />
            <Field
              label="Reasoning efforts"
              value={form.reasoningEfforts}
              placeholder="auto, low, high"
              help="Order is preserved. Empty inherits; [] clears the list."
              onChange={(value) => setDraft({ ...form, reasoningEfforts: value })}
              onReset={() => setDraft({ ...form, reasoningEfforts: '' })}
            />
            <Field
              label="Input modalities"
              value={form.inputModalities}
              placeholder="text, image"
              help="Options: text, image, file, video. Empty inherits; [] clears the list."
              onChange={(value) => setDraft({ ...form, inputModalities: value })}
              onReset={() => setDraft({ ...form, inputModalities: '' })}
            />

            <View style={{ height: 1, backgroundColor: colors.border }} />
            <Text style={{ color: colors.muted, fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 0.5 }}>
              CAPABILITY OVERRIDES
            </Text>
            {(['streaming', 'tools', 'structuredOutput', 'nativeCompaction'] as const).map((key) => (
              <Choice
                key={key}
                label={capabilityLabel(key)}
                value={form[key]}
                values={['inherit', 'supported', 'unsupported', 'unknown']}
                onChange={(value) => setDraft({ ...form, [key]: value as CapabilityChoice })}
              />
            ))}

            <View style={{ height: 1, backgroundColor: colors.border }} />
            <Text style={{ color: colors.muted, fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 0.5 }}>
              REQUEST CONTROLS
            </Text>
            {choices.length > 0 && (
              <Choice
                label="Thinking"
                value={form.reasoningEffort}
                values={choices}
                onChange={(value) => setDraft({ ...form, reasoningEffort: value })}
              />
            )}
            <Field
              label="Output limit"
              value={form.outputLimit}
              placeholder="Auto"
              help={ceiling === null ? 'Empty uses Auto and omits max_output_tokens.' : 'Empty uses Auto. Maximum available: ' + tokenText(ceiling) + '.'}
              keyboardType="number-pad"
              onChange={(value) => setDraft({ ...form, outputLimit: value })}
              onReset={() => setDraft({ ...form, outputLimit: '' })}
            />
          </Panel>

          <View style={{ flexDirection: 'row', gap: 8, padding: 12, borderRadius: 8, backgroundColor: colors.surfaceLowest }}>
            <View style={{ width: 2, borderRadius: 1, backgroundColor: colors.secondary }} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: colors.secondary, fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 0.5 }}>
                LOCAL OVERRIDE POLICY
              </Text>
              <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 11, lineHeight: 16 }}>
                Overrides are stored locally for this endpoint and take precedence over bundled and discovered catalog values.
              </Text>
            </View>
          </View>

          {message !== null && <StatusMessage message={message} />}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save Overrides"
            onPress={() => void save()}
            style={({ pressed }) => ({
              minHeight: 48,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              borderRadius: 8,
              backgroundColor: colors.primary,
              opacity: pressed ? 0.8 : 1,
            })}>
            <SymbolView name={{ ios: 'square.and.arrow.down', android: 'save' }} size={20} tintColor={colors.primaryText} />
            <Text style={{ color: colors.primaryText, fontFamily: fonts.heading, fontSize: 18 }}>Save Overrides</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reset to Server Defaults"
            onPress={() => setResetOpen(true)}
            hitSlop={2}
            style={({ pressed }) => ({
              minHeight: 44,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              opacity: pressed ? 0.8 : 1,
            })}>
            <SymbolView name={{ ios: 'arrow.counterclockwise', android: 'restart_alt' }} size={18} tintColor={colors.error} />
            <Text style={{ color: colors.text, fontFamily: fonts.heading, fontSize: 13 }}>Reset to Server Defaults</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <ResetSheet modelId={model.id} visible={resetOpen} onCancel={() => setResetOpen(false)} onConfirm={() => void resetModel()} />
    </SafeAreaView>
  );
}

function DetailState({ loading, message }: { loading: boolean; message: string }) {
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="light" />
      <AppBar />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 16 }}>
        {loading && <ActivityIndicator color={colors.primary} />}
        <Text style={{ color: loading ? colors.muted : colors.error, fontFamily: fonts.mono, fontSize: 11 }}>{message}</Text>
      </View>
    </SafeAreaView>
  );
}

function AppBar() {
  return (
    <View
      style={{
        height: 56,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: colors.background,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <SymbolView name={{ ios: 'terminal', android: 'terminal' }} size={20} tintColor={colors.primary} />
        <Text style={{ color: colors.primary, fontFamily: fonts.heading, fontSize: 18, letterSpacing: -0.4 }}>MyLLM</Text>
      </View>
    </View>
  );
}

function IdentifierCard({ model }: { model: MergedModel }) {
  const source = model.provenance.displayName?.source ?? null;
  return (
    <View style={{ gap: 12, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceLow }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Text style={{ color: colors.muted, fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 0.5 }}>
          CANONICAL IDENTIFIER
        </Text>
        <SourceBadge source={source} />
      </View>
      <View style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 4, backgroundColor: colors.surfaceLowest }}>
        <Text selectable numberOfLines={2} style={{ color: colors.primary, fontFamily: fonts.monoMedium, fontSize: 11, lineHeight: 16 }}>
          {model.id}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        <IdentityMetric label="Vendor" value={model.vendor ?? 'Unknown'} />
        <IdentityMetric label="Owner" value={model.ownedBy ?? 'Unknown'} />
        <IdentityMetric label="Catalog" value={model.orphaned ? 'History only' : 'Current'} accent={model.orphaned ? colors.warning : colors.secondary} />
      </View>
    </View>
  );
}

function IdentityMetric({ label, value, accent = colors.text }: { label: string; value: string; accent?: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 3, padding: 8, borderRadius: 4, backgroundColor: colors.surface }}>
      <Text numberOfLines={1} style={{ color: colors.muted, fontFamily: fonts.monoMedium, fontSize: 10 }}>
        {label.toUpperCase()}
      </Text>
      <Text numberOfLines={1} style={{ color: accent, fontFamily: fonts.monoMedium, fontSize: 10 }}>
        {value}
      </Text>
    </View>
  );
}

function ProvenanceLegend() {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.muted, fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 0.5 }}>
        PROVENANCE MAPPING
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        <SourceBadge source="live" />
        <SourceBadge source="bundled" />
        <SourceBadge source="user-override" />
        <SourceBadge source="history" />
        <SourceBadge source={null} />
      </View>
    </View>
  );
}

function Panel({
  title,
  icon,
  accent,
  tag,
  children,
}: {
  title: string;
  icon: { ios: 'slider.horizontal.3' | 'wrench.and.screwdriver'; android: 'tune' | 'build_circle' };
  accent: string;
  tag?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: 12, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceLow }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <SymbolView name={icon} size={18} tintColor={accent} />
          <Text style={{ color: colors.text, fontFamily: fonts.heading, fontSize: 13 }}>{title}</Text>
        </View>
        {tag !== undefined && <Text style={{ color: accent, fontFamily: fonts.monoMedium, fontSize: 10 }}>{tag}</Text>}
      </View>
      {children}
    </View>
  );
}

function SpecificationRow({ model, path, label, value }: { model: MergedModel; path: string; label: string; value: string }) {
  return <ValueRow label={label} value={value} source={model.provenance[path]?.source ?? null} />;
}

function DerivedRow({ label, value }: { label: string; value: string }) {
  return <ValueRow label={label} value={value} derived />;
}

function ValueRow({ label, value, source, derived = false }: { label: string; value: string; source?: CatalogSource | null; derived?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: 8, borderRadius: 4, backgroundColor: colors.surface }}>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 10 }}>{label}</Text>
        <Text selectable numberOfLines={2} style={{ color: value === 'Unknown' ? colors.muted : colors.text, fontFamily: fonts.monoMedium, fontSize: 13, lineHeight: 18 }}>
          {value}
        </Text>
      </View>
      {derived ? <DerivedBadge /> : <SourceBadge source={source ?? null} />}
    </View>
  );
}

function SourceBadge({ source, label }: { source: CatalogSource | null; label?: string }) {
  const details = sourceDetails(source);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, backgroundColor: colors.surfaceHigh }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: details.color }} />
      <Text style={{ color: details.color, fontFamily: fonts.monoMedium, fontSize: 10 }}>{label ?? details.label}</Text>
    </View>
  );
}

function DerivedBadge() {
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, backgroundColor: colors.surfaceHigh }}>
      <Text style={{ color: colors.secondary, fontFamily: fonts.monoMedium, fontSize: 10 }}>CLIENT LIMIT</Text>
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
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Text style={{ flex: 1, color: colors.muted, fontFamily: fonts.monoMedium, fontSize: 10 }}>{label}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={'Reset ' + label}
          onPress={onReset}
          hitSlop={8}
          style={{ minHeight: 32, justifyContent: 'center' }}>
          <Text style={{ color: colors.secondary, fontFamily: fonts.monoMedium, fontSize: 10 }}>RESET</Text>
        </Pressable>
      </View>
      <TextInput
        accessibilityLabel={label}
        value={value}
        placeholder={placeholder}
        placeholderTextColor={colors.outline}
        keyboardType={keyboardType}
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={onChange}
        style={{ minHeight: 40, paddingHorizontal: 10, borderRadius: 4, color: colors.text, backgroundColor: colors.surfaceHigh, fontFamily: fonts.mono, fontSize: 13 }}
      />
      {help !== undefined && <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 10, lineHeight: 14 }}>{help}</Text>}
    </View>
  );
}

function Choice({
  label,
  value,
  values,
  help,
  labels,
  onChange,
}: {
  label: string;
  value: string;
  values: readonly string[];
  help?: string;
  labels?: Partial<Record<string, string>>;
  onChange: (value: string) => void;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.muted, fontFamily: fonts.monoMedium, fontSize: 10 }}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {values.map((entry) => {
          const selected = value === entry;
          const optionLabel = labels?.[entry] ?? entry;
          return (
            <Pressable
              key={entry}
              accessibilityRole="radio"
              accessibilityLabel={label + ': ' + optionLabel}
              accessibilityState={{ checked: selected }}
              onPress={() => onChange(entry)}
              hitSlop={8}
              style={({ pressed }) => ({
                minHeight: 32,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 8,
                borderRadius: 4,
                backgroundColor: selected ? colors.primary : colors.surfaceHigh,
                opacity: pressed ? 0.8 : 1,
              })}>
              <Text style={{ color: selected ? colors.primaryText : colors.text, fontFamily: fonts.monoMedium, fontSize: 10 }}>{optionLabel}</Text>
            </Pressable>
          );
        })}
      </View>
      {help !== undefined && <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 10, lineHeight: 14 }}>{help}</Text>}
    </View>
  );
}

function StatusMessage({ message }: { message: string }) {
  const success = message.startsWith('Overrides saved') || message.startsWith('Model overrides reset');
  return (
    <View accessibilityRole="alert" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 8, backgroundColor: colors.surfaceHigh }}>
      <SymbolView name={{ ios: success ? 'checkmark.circle.fill' : 'exclamationmark.triangle.fill', android: success ? 'check_circle' : 'warning' }} size={18} tintColor={success ? colors.primary : colors.error} />
      <Text style={{ flex: 1, color: success ? colors.text : colors.error, fontFamily: fonts.mono, fontSize: 11, lineHeight: 16 }}>{message}</Text>
    </View>
  );
}

function ResetSheet({
  modelId,
  visible,
  onCancel,
  onConfirm,
}: {
  modelId: string;
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      transparent
      animationType="slide"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      navigationBarTranslucent
      visible={visible}
      onRequestClose={onCancel}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.45)' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss reset confirmation" onPress={onCancel} style={{ flex: 1 }} />
        <View
          accessibilityViewIsModal
          style={{
            gap: 16,
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: 24,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12,
            backgroundColor: colors.surfaceLow,
          }}>
          <View style={{ alignItems: 'center' }}>
            <View style={{ width: 32, height: 4, borderRadius: 2, backgroundColor: colors.outline }} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: colors.surfaceHigh }}>
              <SymbolView name={{ ios: 'exclamationmark.triangle.fill', android: 'warning' }} size={22} tintColor={colors.error} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: colors.text, fontFamily: fonts.heading, fontSize: 18, lineHeight: 24 }}>Discard Client Overrides?</Text>
              <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 10, lineHeight: 14 }}>
                All local metadata and request customizations will return to inherited catalog values.
              </Text>
            </View>
          </View>
          <View style={{ padding: 10, borderRadius: 4, backgroundColor: colors.surfaceLowest }}>
            <Text numberOfLines={2} selectable style={{ color: colors.primary, fontFamily: fonts.mono, fontSize: 10, lineHeight: 14 }}>
              {modelId}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <SheetButton label="Cancel" onPress={onCancel} />
            </View>
            <View style={{ flex: 1 }}>
              <SheetButton label="Reset All" danger onPress={onConfirm} />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function SheetButton({ label, danger = false, onPress }: { label: string; danger?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({
        minHeight: 40,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 4,
        backgroundColor: danger ? colors.error : colors.surfaceHigh,
        opacity: pressed ? 0.8 : 1,
      })}>
      <Text style={{ color: danger ? colors.primaryText : colors.text, fontFamily: fonts.heading, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

export function sourceDetails(source: CatalogSource | null): { label: string; color: string } {
  switch (source) {
    case 'live':
      return { label: 'LIVE ENDPOINT', color: colors.primary };
    case 'bundled':
      return { label: 'BUNDLED SPEC', color: colors.secondary };
    case 'user-override':
      return { label: 'USER OVERRIDE', color: colors.warning };
    case 'history':
      return { label: 'HISTORY RECORD', color: colors.muted };
    default:
      return { label: 'UNKNOWN', color: colors.outline };
  }
}

function tokenText(value: number | null): string {
  return value === null ? 'Unknown' : value.toLocaleString() + ' tokens';
}

function capabilityText(value: CapabilityState): string {
  return value === 'supported' ? 'Supported' : value === 'unsupported' ? 'Unsupported' : 'Unknown';
}

function capabilityLabel(key: keyof Pick<Form, 'streaming' | 'tools' | 'structuredOutput' | 'nativeCompaction'>): string {
  return {
    streaming: 'Streaming',
    tools: 'Tool calling',
    structuredOutput: 'Structured output',
    nativeCompaction: 'Native compaction',
  }[key];
}

function formFrom(override: ModelOverride | undefined): Form {
  return {
    displayName: override?.displayName ?? '',
    enabled: typeof override?.enabled === 'boolean' ? String(override.enabled) as InheritBoolean : 'inherit',
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
    return { ok: false, message: `Output limit cannot exceed ${String(ceiling)}.` };
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
    : { ok: false, message: `${label} must be a positive integer.` };
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
