import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  FlatList,
  type ListRenderItemInfo,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { MergedModel } from '../../domain/catalog-merge';
import { endpointStore } from '../../services/persistence/endpoint-store';
import { useActiveEndpoint } from '../setup/use-active-endpoint';
import { describeRefresh, formatTokens, modelBadges } from './model-badges';
import { useModelCatalog } from './use-model-catalog';

type BadgeTone = 'neutral' | 'accent' | 'warning';

const colors = {
  background: '#0b1326',
  surfaceLowest: '#060e20',
  surfaceLow: '#131b2e',
  surface: '#171f33',
  surfaceHigh: '#222a3d',
  control: '#1e293b',
  controlActive: '#0f172a',
  border: '#334155',
  outline: '#86948a',
  text: '#dae2fd',
  muted: '#bbcabf',
  primary: '#10b981',
  primaryText: '#020617',
  secondary: '#06b6d4',
  warning: '#f59e0b',
  warningBackground: '#5b3a08',
  warningText: '#ffddb8',
  error: '#ef4444',
  errorBackground: '#450a0a',
  errorText: '#fecaca',
} as const;

const fonts = {
  heading: 'Inter_600SemiBold',
  mono: 'JetBrainsMono_400Regular',
  monoMedium: 'JetBrainsMono_500Medium',
} as const;

const cardStyle = {
  gap: 12,
  padding: 12,
  borderRadius: 8,
  borderWidth: 1,
  borderColor: colors.border,
  backgroundColor: colors.surfaceLow,
} as const;

const EMPTY_MODELS: MergedModel[] = [];

/** Picker model dipakai dari tab Model dan dari Settings > Models. */
export default function ModelsScreen() {
  const { status, profile } = useActiveEndpoint();
  const catalog = useModelCatalog(profile);
  const reloadCatalog = catalog.reload;
  const setOverride = catalog.setOverride;
  const [activeModelId, setActiveModelId] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [customId, setCustomId] = useState('');
  const [filter, setFilter] = useState('');
  const [showDisabled, setShowDisabled] = useState(false);

  const models = catalog.runtime?.models ?? EMPTY_MODELS;
  const enabledIds = models.filter((model) => model.enabled).map((model) => model.id);
  const excludedCount = models.length - enabledIds.length;
  const hasActive = activeModelId !== null && enabledIds.includes(activeModelId);
  const visibleModels = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return models.filter((model) => {
      if (!showDisabled && !model.enabled) {
        return false;
      }
      return query.length === 0 || model.id.toLowerCase().includes(query);
    });
  }, [filter, models, showDisabled]);

  useEffect(() => {
    let alive = true;
    if (profile === null) return;
    endpointStore.loadActiveModelId(profile.id).then((modelId) => {
      if (alive) {
        setActiveModelId(modelId);
      }
    });
    return () => {
      alive = false;
    };
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      void reloadCatalog();
    }, [reloadCatalog]),
  );

  const pick = useCallback(async (model: MergedModel) => {
    if (!model.enabled) {
      setBlocked(model.displayName + ' is disabled. Enable it before using it.');
      return;
    }
    setBlocked(null);
    if (profile === null) return;
    await endpointStore.saveActiveModelId(profile.id, model.id);
    setActiveModelId(model.id);
    router.replace('/(tabs)');
  }, [profile]);

  const editModel = useCallback((model: MergedModel) => {
    router.push({ pathname: '/settings/model', params: { modelId: model.id } });
  }, []);

  const toggleModel = useCallback((model: MergedModel) => {
    void setOverride(model.id, { enabled: !model.enabled });
  }, [setOverride]);

  const renderModel = useCallback(
    ({ item }: ListRenderItemInfo<MergedModel>) => (
      <ModelRow
        model={item}
        active={item.id === activeModelId && item.enabled}
        selectable={item.enabled}
        onPress={pick}
        onEdit={editModel}
        onToggle={toggleModel}
      />
    ),
    [activeModelId, editModel, pick, toggleModel],
  );

  const addCustomModel = useCallback(async () => {
    const id = customId.trim();
    try {
      await catalog.addCustomModel(id);
      setAdding(false);
      setCustomId('');
      setBlocked(null);
      router.push({ pathname: '/settings/model', params: { modelId: id } });
    } catch (error) {
      setBlocked(error instanceof Error ? error.message : 'Custom model could not be added.');
    }
  }, [catalog, customId]);

  if (status === 'loading' || catalog.loading) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
        <StatusBar style="light" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 16 }}>
          <ActivityIndicator color={colors.primary} />
          <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 13 }}>
            Loading model catalog.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const catalogStatus =
    profile === null
      ? 'SETUP REQUIRED'
      : catalog.failure?.kind === 'network' && models.length > 0
        ? 'CACHED'
        : catalog.failure !== null
          ? 'FAILED'
          : 'CONNECTED';
  const catalogStatusColor =
    profile === null
      ? colors.warning
      : catalog.failure !== null
        ? colors.warning
        : colors.primary;
  const allModelsExcluded = models.length > 0 && enabledIds.length === 0 && !showDisabled;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="light" />
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
          <Text style={{ color: colors.primary, fontFamily: fonts.heading, fontSize: 18, letterSpacing: -0.4 }}>
            MyLLM
          </Text>
        </View>
      </View>

      <View style={{ gap: 12, padding: 16, paddingBottom: 12 }}>
        <View style={{ gap: 8, padding: 12, borderRadius: 8, backgroundColor: colors.surfaceHigh }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                <Text
                  numberOfLines={1}
                  style={{ color: colors.text, fontFamily: fonts.heading, fontSize: 18, flexShrink: 1 }}>
                  {profile?.name ?? 'No endpoint connected'}
                </Text>
                <Badge label={profile === null ? 'NOT CONFIGURED' : 'CONNECTED'} tone={profile === null ? 'warning' : 'accent'} />
              </View>
              <Text numberOfLines={1} style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 11 }}>
                {profile === null
                  ? 'Connect an endpoint to discover its model catalog.'
                  : 'Endpoint: ' + profile.baseUrl}
              </Text>
            </View>
            {profile === null ? (
              <SmallButton label="Connect" tone="primary" onPress={() => router.push('/setup')} />
            ) : (
              <RefreshButton refreshing={catalog.refreshing} onPress={() => void catalog.refresh()} compact />
            )}
          </View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 2,
              backgroundColor: colors.surfaceLowest,
            }}>
            <Text numberOfLines={1} style={{ flex: 1, color: colors.muted, fontFamily: fonts.mono, fontSize: 10 }}>
              {profile === null
                ? 'No endpoint configured.'
                : describeRefresh(catalog.failure, catalog.runtime?.lastFetchedAt ?? null)}
            </Text>
            <Text style={{ color: catalogStatusColor, fontFamily: fonts.monoMedium, fontSize: 10 }}>
              {catalogStatus}
            </Text>
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View
              style={{
                flex: 1,
                minWidth: 0,
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 10,
                borderRadius: 4,
                backgroundColor: colors.surfaceLow,
              }}>
              <SymbolView name={{ ios: 'magnifyingglass', android: 'search' }} size={18} tintColor={colors.muted} />
              <TextInput
                accessibilityLabel="Filter exact model identifier"
                value={filter}
                onChangeText={setFilter}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Filter exact model identifier..."
                placeholderTextColor={colors.muted}
                style={{ flex: 1, minHeight: 46, paddingHorizontal: 8, color: colors.text, fontFamily: fonts.mono, fontSize: 11 }}
              />
              <SymbolView name={{ ios: 'touchid', android: 'fingerprint' }} size={16} tintColor={colors.outline} />
            </View>
            <SmallButton label="Add" tone="primary" onPress={() => setAdding((value) => !value)} />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <SmallButton
                label={(showDisabled ? 'Hide' : 'Show') + ' Excluded (' + String(excludedCount) + ')'}
                onPress={() => setShowDisabled((value) => !value)}
              />
              <SmallButton label="Manifest JSON" onPress={() => router.push('/settings/models-json')} />
            </View>
            <Text style={{ color: colors.outline, fontFamily: fonts.monoMedium, fontSize: 10 }}>
              OPENAI SPEC
            </Text>
          </View>
        </View>

        {adding && (
          <View style={cardStyle}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <Text style={{ color: colors.text, fontFamily: fonts.heading, fontSize: 15 }}>
                Register model specification
              </Text>
              <Text style={{ color: colors.secondary, fontFamily: fonts.monoMedium, fontSize: 10 }}>
                EXACT ID
              </Text>
            </View>
            <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 10, lineHeight: 14 }}>
              Add a model identifier the endpoint does not advertise.
            </Text>
            <TextInput
              accessibilityLabel="Model ID custom"
              value={customId}
              onChangeText={setCustomId}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="provider/model-exact"
              placeholderTextColor={colors.muted}
              style={{ minHeight: 48, color: colors.text, backgroundColor: colors.controlActive, borderColor: colors.border, borderWidth: 1, borderRadius: 4, paddingHorizontal: 12, fontFamily: fonts.mono, fontSize: 13 }}
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <SmallButton
                  label="Cancel"
                  onPress={() => {
                    setAdding(false);
                    setCustomId('');
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <SmallButton label="Register" tone="primary" disabled={customId.trim().length === 0} onPress={() => void addCustomModel()} />
              </View>
            </View>
          </View>
        )}

        {catalog.failure?.kind === 'network' && models.length > 0 && (
          <View style={{ ...cardStyle, borderColor: colors.warning, backgroundColor: colors.surfaceLow }}>
            <Text style={{ color: colors.warning, fontFamily: fonts.monoMedium, fontSize: 10 }}>
              OFFLINE CACHED MODE
            </Text>
            <Text style={{ color: colors.warningText, fontFamily: fonts.mono, fontSize: 10, lineHeight: 14 }}>
              {catalog.failure.message}
            </Text>
          </View>
        )}

        {!hasActive && models.length > 0 && (
          <View style={{ ...cardStyle, borderColor: colors.error, backgroundColor: colors.errorBackground }}>
            <Text style={{ color: colors.errorText, fontFamily: fonts.heading, fontSize: 15 }}>
              No active model
            </Text>
            <Text style={{ color: colors.errorText, fontFamily: fonts.mono, fontSize: 10, lineHeight: 14 }}>
              Select an enabled model below before starting a chat.
            </Text>
          </View>
        )}

        {blocked !== null && (
          <View style={{ ...cardStyle, borderColor: colors.warning, backgroundColor: colors.surfaceLow }} accessibilityRole="alert">
            <Text style={{ color: colors.warningText, fontFamily: fonts.mono, fontSize: 10, lineHeight: 14 }}>
              {blocked}
            </Text>
          </View>
        )}
      </View>

      <FlatList
        style={{ flex: 1 }}
        data={visibleModels}
        keyExtractor={(model) => model.id}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={5}
        contentContainerStyle={{ gap: 12, paddingHorizontal: 16 }}
        refreshControl={
          <RefreshControl
            refreshing={catalog.refreshing}
            onRefresh={() => void catalog.refresh()}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListEmptyComponent={
          <EmptyCatalog
            filtered={filter.trim().length > 0}
            allExcluded={allModelsExcluded}
            noEndpoint={profile === null}
            refreshing={catalog.refreshing}
            onPress={
              filter.trim().length > 0
                ? () => setFilter('')
                : allModelsExcluded
                  ? () => setShowDisabled(true)
                  : profile === null
                    ? () => router.push('/setup')
                    : () => void catalog.refresh()
            }
          />
        }
        renderItem={renderModel}
      />

    </SafeAreaView>
  );
}

function RefreshButton({
  refreshing,
  onPress,
  compact = false,
}: {
  refreshing: boolean;
  onPress: () => void;
  compact?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Refresh model catalog"
      accessibilityHint="Fetch the model list from the endpoint again"
      accessibilityState={{ busy: refreshing, disabled: refreshing }}
      disabled={refreshing}
      onPress={onPress}
      hitSlop={compact ? 4 : undefined}
      style={({ pressed }) => ({
        height: compact ? 36 : 44,
        minWidth: compact ? 36 : 110,
        flexDirection: 'row',
        gap: compact ? 0 : 8,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: compact ? 10 : 16,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: refreshing ? colors.control : colors.surface,
        opacity: refreshing ? 0.7 : pressed ? 0.8 : 1,
      })}>
      {refreshing ? (
        <ActivityIndicator size="small" color={colors.muted} />
      ) : (
        <SymbolView
          name={{ ios: 'arrow.clockwise', android: 'refresh' }}
          size={18}
          tintColor={colors.secondary}
        />
      )}
      {!compact && (
        <Text style={{ color: colors.text, fontFamily: fonts.heading, fontSize: 13 }}>
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </Text>
      )}
    </Pressable>
  );
}

export const ModelRow = memo(function ModelRow({
  model,
  active,
  selectable,
  onPress,
  onToggle,
  onEdit,
}: {
  model: MergedModel;
  active: boolean;
  selectable: boolean;
  onPress: (model: MergedModel) => void;
  onToggle: (model: MergedModel) => void;
  onEdit: (model: MergedModel) => void;
}) {
  const contextValue = model.contextWindow === null ? 'ctx unknown' : formatTokens(model.contextWindow) + ' ctx';
  const outputValue = model.maxOutputTokens === null ? 'Unknown' : formatTokens(model.maxOutputTokens) + ' out';
  const reasoningValue = model.reasoningEfforts.length === 0 ? 'Unknown' : 'reasoning ' + String(model.reasoningEfforts.length) + ' level';
  const toolsValue = capabilityValue(model.capabilities.tools);
  const extraBadges = modelBadges(model).filter(
    (badge) =>
      badge !== 'ctx unknown' &&
      !badge.endsWith(' ctx') &&
      !badge.endsWith(' out') &&
      !badge.startsWith('reasoning '),
  );
  const cardColor = active ? colors.surfaceHigh : colors.surfaceLow;

  return (
    <View
      style={{
        ...cardStyle,
        gap: 0,
        padding: 0,
        overflow: 'hidden',
        borderColor: active ? colors.primary : colors.border,
        backgroundColor: cardColor,
      }}>
      {active && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            backgroundColor: colors.surface,
          }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary }} />
            <Text style={{ color: colors.primary, fontFamily: fonts.monoMedium, fontSize: 10 }}>
              ACTIVE INFERENCE ENGINE
            </Text>
          </View>
          <Text style={{ color: colors.muted, fontFamily: fonts.monoMedium, fontSize: 10 }}>
            SELECTED
          </Text>
        </View>
      )}
      <View style={{ gap: 12, padding: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={'Select model ' + model.id}
            accessibilityHint={selectable ? 'Make this the active model' : 'This model is disabled'}
            accessibilityState={{ selected: active, disabled: !selectable }}
            onPress={() => onPress(model)}
            style={({ pressed }) => ({ flex: 1, minWidth: 0, gap: 4, opacity: pressed ? 0.7 : 1 })}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
              <Text
                numberOfLines={1}
                style={{ flexShrink: 1, color: colors.text, fontFamily: fonts.heading, fontSize: 18 }}>
                {model.displayName}
              </Text>
              <Badge label={model.displayName === model.id ? 'EXACT ID' : 'DISPLAY NAME'} tone="neutral" />
              {active && <Badge label="active" tone="accent" />}
              {!model.enabled && <Badge label="disabled" tone="warning" />}
            </View>
            {model.displayName !== model.id && (
              <Text numberOfLines={1} style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 11 }}>
                {model.id}
              </Text>
            )}
          </Pressable>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityLabel={'Show ' + model.id + ' in picker'}
            accessibilityHint="Enable this model in the picker"
            accessibilityState={{ checked: model.enabled }}
            onPress={() => onToggle(model)}
            style={({ pressed }) => ({
              minHeight: 44,
              maxWidth: 110,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              opacity: pressed ? 0.7 : 1,
            })}>
            <SymbolView
              name={{
                ios: model.enabled ? 'checkmark.square.fill' : 'square',
                android: model.enabled ? 'check_box' : 'check_box_outline_blank',
              }}
              size={20}
              tintColor={model.enabled ? colors.primary : colors.muted}
            />
            <Text numberOfLines={2} style={{ color: colors.text, fontFamily: fonts.monoMedium, fontSize: 10 }}>
              Show in picker
            </Text>
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', gap: 4 }}>
          <MetricCell label="Context window" value={contextValue} source={provenanceTag(model.provenance.contextWindow?.source)} />
          <MetricCell label="Max output" value={outputValue} source={provenanceTag(model.provenance.maxOutputTokens?.source)} />
        </View>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <MetricCell label="Reasoning" value={reasoningValue} source={provenanceTag(model.provenance.reasoningEfforts?.source)} />
          <MetricCell label="Tool calling" value={toolsValue} source={provenanceTag(model.provenance['capabilities.tools']?.source)} />
        </View>
        {extraBadges.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {extraBadges.map((badge) => (
              <Badge key={badge} label={badge} tone="neutral" />
            ))}
          </View>
        )}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {active ? (
            <View style={{ flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 4, backgroundColor: colors.primary }}>
              <Text style={{ color: colors.primaryText, fontFamily: fonts.heading, fontSize: 13 }}>
                Selected model
              </Text>
            </View>
          ) : (
            <View style={{ flex: 1 }}>
              <SmallButton label="Set as active model" tone="primary" onPress={() => onPress(model)} />
            </View>
          )}
          <SmallButton label="Details" onPress={() => onEdit(model)} />
        </View>
      </View>
    </View>
  );
});

function MetricCell({
  label,
  value,
  source,
}: {
  label: string;
  value: string;
  source: { label: string; tone: BadgeTone } | null;
}) {
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 3, padding: 8, borderRadius: 4, backgroundColor: colors.surface }}>
      <Text numberOfLines={1} style={{ color: colors.outline, fontFamily: fonts.monoMedium, fontSize: 10 }}>
        {label.toUpperCase()}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
        <Text numberOfLines={1} style={{ flex: 1, color: value === 'Unknown' ? colors.muted : colors.text, fontFamily: fonts.monoMedium, fontSize: 11 }}>
          {value}
        </Text>
        {source !== null && <Badge label={source.label} tone={source.tone} />}
      </View>
    </View>
  );
}

function SmallButton({
  label,
  onPress,
  tone = 'neutral',
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  tone?: 'neutral' | 'primary';
  disabled?: boolean;
}) {
  const primary = tone === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 12,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: primary ? colors.primary : colors.border,
        backgroundColor: primary ? colors.primary : colors.surface,
        opacity: disabled ? 0.45 : pressed ? 0.7 : 1,
      })}>
      <Text style={{ color: primary ? colors.primaryText : colors.text, fontFamily: fonts.heading, fontSize: 12 }}>
        {label}
      </Text>
    </Pressable>
  );
}

function Badge({ label, tone }: { label: string; tone: BadgeTone }) {
  const palette = {
    neutral: { backgroundColor: colors.surfaceHigh, color: colors.muted },
    accent: { backgroundColor: colors.primary, color: colors.primaryText },
    warning: { backgroundColor: colors.warningBackground, color: colors.warningText },
  }[tone];
  return (
    <Text
      style={{
        color: palette.color,
        backgroundColor: palette.backgroundColor,
        fontFamily: fonts.monoMedium,
        fontSize: 10,
        paddingHorizontal: 6,
        paddingVertical: 3,
        borderRadius: 4,
        overflow: 'hidden',
      }}>
      {label}
    </Text>
  );
}

function EmptyCatalog({
  filtered,
  allExcluded,
  noEndpoint,
  refreshing,
  onPress,
}: {
  filtered: boolean;
  allExcluded: boolean;
  noEndpoint: boolean;
  refreshing: boolean;
  onPress: () => void;
}) {
  const title = filtered
    ? 'No matching models'
    : noEndpoint
      ? 'No endpoint connected'
      : allExcluded
        ? 'All models excluded'
        : 'Zero models discovered';
  const body = filtered
    ? 'No model identifier matches this filter.'
    : noEndpoint
      ? 'Connect an endpoint first, then discover its model catalog.'
      : allExcluded
        ? 'Every discovered model is hidden from the picker.'
        : 'No models are stored on this device. Refresh when the endpoint is online.';
  const actionLabel = filtered
    ? 'Clear filter'
    : noEndpoint
      ? 'Connect endpoint'
      : allExcluded
        ? 'Show excluded'
        : 'Refresh catalog';

  return (
    <View style={{ ...cardStyle, marginTop: 4 }}>
      <Text style={{ color: colors.text, fontFamily: fonts.heading, fontSize: 18 }}>{title}</Text>
      <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 11, lineHeight: 16 }}>{body}</Text>
      {noEndpoint || allExcluded || filtered ? (
        <SmallButton label={actionLabel} tone={noEndpoint ? 'primary' : 'neutral'} onPress={onPress} />
      ) : (
        <RefreshButton refreshing={refreshing} onPress={onPress} />
      )}
    </View>
  );
}

function capabilityValue(value: MergedModel['capabilities']['tools']): string {
  if (value === 'supported') {
    return 'Supported';
  }
  if (value === 'unsupported') {
    return 'Unavailable';
  }
  return 'Unknown';
}

function provenanceTag(source: string | undefined): { label: string; tone: BadgeTone } | null {
  if (source === 'live') {
    return { label: 'LIVE', tone: 'accent' };
  }
  if (source === 'bundled') {
    return { label: 'BUNDLED', tone: 'neutral' };
  }
  if (source === 'user-override') {
    return { label: 'OVERRIDE', tone: 'warning' };
  }
  if (source === 'history') {
    return { label: 'HISTORY', tone: 'neutral' };
  }
  return null;
}
