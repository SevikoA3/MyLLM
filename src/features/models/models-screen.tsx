import { useCallback, useEffect, useState } from 'react';
import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';

import type { MergedModel } from '../../domain/catalog-merge';
import { endpointStore } from '../../services/persistence/endpoint-store';
import { useTheme } from '../../ui/theme';
import { Screen } from '../../ui/components';
import { useActiveEndpoint } from '../setup/use-active-endpoint';
import { describeRefresh, modelBadges } from './model-badges';
import { useModelCatalog } from './use-model-catalog';

/** Picker model dipakai dari tab Model dan dari Settings > Models. */
export default function ModelsScreen() {
  const { status, profile } = useActiveEndpoint();
  const catalog = useModelCatalog(profile);
  const [activeModelId, setActiveModelId] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const theme = useTheme();

  const models = catalog.runtime?.models ?? [];
  const enabledIds = models.filter((model) => model.enabled).map((model) => model.id);
  const hasActive = activeModelId !== null && enabledIds.includes(activeModelId);

  useEffect(() => {
    let alive = true;
    endpointStore.loadActiveModelId().then((modelId) => {
      if (alive) {
        setActiveModelId(modelId);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const pick = useCallback(async (model: MergedModel) => {
    if (!model.enabled) {
      setBlocked(model.displayName + ' sedang dimatikan. Aktifkan dulu untuk memakainya.');
      return;
    }
    setBlocked(null);
    await endpointStore.saveActiveModelId(model.id);
    setActiveModelId(model.id);
  }, []);

  if (status === 'loading' || catalog.loading) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={theme.colors.accent} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ gap: 10, paddingHorizontal: theme.spacing.screen, paddingTop: theme.spacing.screen, paddingBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <Text style={{ color: theme.colors.text, fontSize: theme.typography.title, fontWeight: '700' }}>
            Model
          </Text>
          <RefreshButton refreshing={catalog.refreshing} onPress={() => void catalog.refresh()} />
        </View>

        <Text style={{ color: theme.colors.textMuted, fontSize: theme.typography.meta }}>
          {profile?.name ?? 'Tanpa endpoint'}
        </Text>
        <Text style={{ color: theme.colors.textMuted, fontSize: theme.typography.meta }}>
          {describeRefresh(catalog.failure, catalog.runtime?.lastFetchedAt ?? null)}
        </Text>
        {!hasActive && models.length > 0 && (
          <Text style={{ color: theme.colors.danger, fontSize: theme.typography.meta }}>
            Belum ada model aktif. Ketuk salah satu model untuk dipakai.
          </Text>
        )}
        {blocked !== null && (
          <Text style={{ color: theme.colors.warningText, fontSize: theme.typography.meta }}>
            {blocked}
          </Text>
        )}
      </View>

      <FlatList
        data={models}
        keyExtractor={(model) => model.id}
        contentContainerStyle={{ gap: theme.spacing.gap, padding: theme.spacing.screen, paddingTop: 0 }}
        refreshControl={
          <RefreshControl
            refreshing={catalog.refreshing}
            onRefresh={() => void catalog.refresh()}
            tintColor={theme.colors.accent}
            colors={[theme.colors.accent]}
          />
        }
        ListEmptyComponent={
          <EmptyCatalog refreshing={catalog.refreshing} onPress={() => void catalog.refresh()} />
        }
        renderItem={({ item }) => (
          <ModelRow
            model={item}
            active={item.id === activeModelId}
            selectable={item.enabled}
            onPress={() => void pick(item)}
            onToggle={() =>
              void catalog.setOverride(item.id, {
                disabledAt: item.enabled ? new Date().toISOString() : null,
              })
            }
          />
        )}
      />

      <View
        style={{ paddingHorizontal: theme.spacing.screen, paddingVertical: 12, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
        <Text style={{ color: theme.colors.textMuted, fontSize: theme.typography.meta }}>
          {String(enabledIds.length) + ' dari ' + String(models.length) + ' model dapat dipilih.'}
        </Text>
      </View>
    </Screen>
  );
}

function RefreshButton({ refreshing, onPress }: { refreshing: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Refresh katalog"
      accessibilityHint="Mengambil ulang daftar model dari endpoint"
      accessibilityState={{ busy: refreshing, disabled: refreshing }}
      disabled={refreshing}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        minWidth: 110,
        flexDirection: 'row',
        gap: 8,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.screen,
        backgroundColor: refreshing ? theme.colors.surface : theme.colors.accent,
        borderRadius: theme.radius.control,
        opacity: pressed ? 0.8 : 1,
      })}>
      {refreshing ? (
        <ActivityIndicator size="small" color={theme.colors.textMuted} />
      ) : (
        <SymbolView
          name={{ ios: 'arrow.clockwise', android: 'refresh' }}
          size={18}
          tintColor={theme.colors.accentText}
        />
      )}
      <Text
        style={{
          color: refreshing ? theme.colors.textMuted : theme.colors.accentText,
          fontSize: theme.typography.body,
          fontWeight: '600',
        }}>
        {refreshing ? 'Memuat...' : 'Refresh'}
      </Text>
    </Pressable>
  );
}

export function ModelRow({
  model,
  active,
  selectable,
  onPress,
  onToggle,
}: {
  model: MergedModel;
  active: boolean;
  selectable: boolean;
  onPress: () => void;
  onToggle: () => void;
}) {
  const theme = useTheme();
  const rowStyle = {
    minHeight: 48,
    gap: 6,
    padding: theme.spacing.screen,
    borderRadius: theme.radius.card,
    borderWidth: active ? 2 : 1,
    borderColor: active ? theme.colors.borderStrong : theme.colors.border,
    backgroundColor: active ? theme.colors.surface : theme.colors.background,
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={'Pilih model ' + model.id}
      accessibilityHint={
        selectable ? 'Menjadikan model ini model aktif' : 'Model sedang dimatikan'
      }
      accessibilityState={{ selected: active, disabled: !selectable }}
      onPress={onPress}
      style={rowStyle}>
      <Text
        style={{ color: theme.colors.text, fontSize: theme.typography.subtitle, fontWeight: '700' }}>
        {model.displayName}
      </Text>
      {model.displayName !== model.id && (
        <Text style={{ color: theme.colors.textMuted, fontSize: theme.typography.meta }}>
          {model.id}
        </Text>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {modelBadges(model).map((badge) => (
          <Badge key={badge} label={badge} tone="neutral" />
        ))}
        {active && <Badge label="aktif" tone="accent" />}
        {!model.enabled && <Badge label="dimatikan" tone="warning" />}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={(model.enabled ? 'Matikan model ' : 'Aktifkan model ') + model.id}
        onPress={onToggle}
        style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text
          style={{
            color: theme.colors.accent,
            fontSize: theme.typography.body,
            fontWeight: '600',
          }}>
          {model.enabled ? 'Matikan dari picker' : 'Aktifkan di picker'}
        </Text>
      </Pressable>
    </Pressable>
  );
}

function Badge({ label, tone }: { label: string; tone: 'neutral' | 'accent' | 'warning' }) {
  const theme = useTheme();
  const palette = {
    neutral: { backgroundColor: theme.colors.surface, color: theme.colors.textMuted },
    accent: { backgroundColor: theme.colors.accent, color: theme.colors.accentText },
    warning: { backgroundColor: theme.colors.warningBg, color: theme.colors.warningText },
  }[tone];
  return (
    <Text
      style={{
        ...palette,
        fontSize: theme.typography.meta,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: theme.radius.pill,
        overflow: 'hidden',
      }}>
      {label}
    </Text>
  );
}

function EmptyCatalog({ refreshing, onPress }: { refreshing: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <View
      style={{
        gap: 10,
        padding: theme.spacing.screen,
        borderRadius: theme.radius.card,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
      }}>
      <Text style={{ color: theme.colors.text, fontSize: theme.typography.subtitle, fontWeight: '700' }}>
        Katalog kosong
      </Text>
      <Text style={{ color: theme.colors.textMuted, fontSize: theme.typography.body }}>
        Belum ada model tersimpan di perangkat ini. Tekan Refresh setelah perangkat online.
      </Text>
      <RefreshButton refreshing={refreshing} onPress={onPress} />
    </View>
  );
}
