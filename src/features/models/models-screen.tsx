import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { MergedModel } from '../../domain/catalog-merge';
import { endpointStore } from '../../services/persistence/endpoint-store';
import { useActiveEndpoint } from '../setup/use-active-endpoint';
import { describeRefresh, modelBadges } from './model-badges';
import { useModelCatalog } from './use-model-catalog';

/** Picker model dipakai dari tab Model dan dari Settings > Models. */
export default function ModelsScreen() {
  const { status, profile } = useActiveEndpoint();
  const catalog = useModelCatalog(profile);
  const [activeModelId, setActiveModelId] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);

  const models = catalog.runtime?.models ?? [];
  const selected = models.find((model) => model.enabled) ?? null;
  const pickerIds = new Set(models.filter((model) => model.enabled).map((model) => model.id));

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
      setBlocked(model.id + ' sedang dimatikan oleh override.');
      return;
    }
    setBlocked(null);
    await endpointStore.saveActiveModelId(model.id);
    setActiveModelId(model.id);
  }, []);

  if (status === 'loading' || catalog.loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white dark:bg-black">
        <ActivityIndicator accessibilityLabel="Memuat katalog model" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-black">
      <View className="gap-1 px-4 pt-4">
        <Text className="text-xl font-bold text-black dark:text-white">Model</Text>
        <Text className="text-sm text-neutral-600 dark:text-neutral-400">
          {(profile?.name ?? 'Tanpa endpoint') + ' / '}
          {describeRefresh(catalog.failure, catalog.runtime?.lastFetchedAt ?? null)}
        </Text>
        {blocked !== null && (
          <Text className="text-sm text-amber-700 dark:text-amber-400">{blocked}</Text>
        )}
      </View>

      <FlatList
        data={models}
        keyExtractor={(model) => model.id}
        contentContainerClassName="gap-2 p-4"
        refreshControl={
          <RefreshControl refreshing={catalog.refreshing} onRefresh={() => void catalog.refresh()} />
        }
        ListEmptyComponent={EmptyCatalog}
        renderItem={({ item }) => (
          <ModelRow
            model={item}
            active={item.id === activeModelId}
            selectable={pickerIds.has(item.id)}
            onPress={() => void pick(item)}
            onToggle={() =>
              void catalog.setOverride(item.id, {
                disabledAt: item.enabled ? new Date().toISOString() : null,
              })
            }
          />
        )}
      />

      <View className="border-t border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <Text className="text-sm text-neutral-600 dark:text-neutral-400">
          {String(pickerIds.size) + ' dari ' + String(models.length) + ' model dapat dipilih.'}
          {selected === null ? ' Belum ada model aktif.' : ''}
        </Text>
      </View>
    </SafeAreaView>
  );
}

function ModelRow({
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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={'Pilih model ' + model.id}
      accessibilityHint={
        selectable ? 'Menjadikan model ini model aktif' : 'Model dimatikan oleh override'
      }
      onPress={onPress}
      className={
        'min-h-[48px] gap-1 rounded-lg border p-3 ' +
        (active
          ? 'border-black bg-neutral-100 dark:border-white dark:bg-neutral-900'
          : 'border-neutral-300 dark:border-neutral-700')
      }>
      <Text className="text-base font-semibold text-black dark:text-white">{model.displayName}</Text>
      {model.displayName !== model.id && (
        <Text className="text-xs text-neutral-500 dark:text-neutral-400">{model.id}</Text>
      )}
      <View className="flex-row flex-wrap gap-1">
        {modelBadges(model).map((badge) => (
          <Text
            key={badge}
            className="rounded bg-neutral-200 px-2 py-0.5 text-xs text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
            {badge}
          </Text>
        ))}
        {active && (
          <Text className="rounded bg-black px-2 py-0.5 text-xs text-white dark:bg-white dark:text-black">
            aktif
          </Text>
        )}
        {!model.enabled && (
          <Text className="rounded bg-amber-200 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-900 dark:text-amber-100">
            dimatikan
          </Text>
        )}
      </View>
      <Text
        accessibilityRole="button"
        accessibilityLabel={
          (model.enabled ? 'Matikan model ' : 'Aktifkan model ') + model.id
        }
        onPress={onToggle}
        className="min-h-[48px] pt-3 text-sm font-medium text-blue-600 dark:text-blue-400">
        {model.enabled ? 'Matikan dari picker' : 'Aktifkan di picker'}
      </Text>
    </Pressable>
  );
}

function EmptyCatalog() {
  return (
    <View className="gap-1 rounded-lg border border-neutral-300 p-4 dark:border-neutral-700">
      <Text className="text-base font-semibold text-black dark:text-white">Katalog kosong</Text>
      <Text className="text-sm text-neutral-600 dark:text-neutral-400">
        Belum ada model tersimpan. Tarik ke bawah untuk refresh setelah perangkat online.
      </Text>
    </View>
  );
}
