import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { createEndpointProfile, type EndpointProfile } from '../../src/domain/endpoint';
import { deleteStagedImages } from '../../src/services/attachments/images';
import { credentialStore } from '../../src/services/credentials/store';
import { deleteCatalogForEndpoint } from '../../src/services/persistence/catalog-files';
import { pickEndpointProfiles, shareEndpointProfiles } from '../../src/services/persistence/catalog-transfer';
import { conversationRepository } from '../../src/services/persistence/conversation-store';
import { endpointStore } from '../../src/services/persistence/endpoint-store';
import { colors, fonts, typography } from '../../src/ui/tokens';
import { BottomSheet } from '../../src/ui/bottom-sheet';
type DeleteTarget = { profile: EndpointProfile; conversationCount: number };

export default function EndpointProfilesScreen() {
  const router = useRouter();
  const [profiles, setProfiles] = useState<EndpointProfile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  async function load() {
    const [all, active] = await Promise.all([endpointStore.loadAll(), endpointStore.load()]);
    setProfiles(all);
    setActiveId(active?.id ?? null);
    setLoading(false);
  }
  useEffect(() => {
    let alive = true;
    void Promise.all([endpointStore.loadAll(), endpointStore.load()]).then(([all, active]) => {
      if (!alive) return;
      setProfiles(all);
      setActiveId(active?.id ?? null);
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  async function select(profile: EndpointProfile) {
    setBusyId(profile.id);
    try {
      await endpointStore.select(profile.id);
      setActiveId(profile.id);
      router.replace('/(tabs)');
    } catch {
      Alert.alert('Could not switch endpoint', 'Try again later.');
    } finally {
      setBusyId(null);
    }
  }

  async function prepareDelete(profile: EndpointProfile) {
    setBusyId(profile.id);
    try {
      setDeleteTarget({ profile, conversationCount: await conversationRepository.countByEndpoint(profile.id) });
    } catch {
      Alert.alert('Could not inspect endpoint', 'Conversation usage could not be loaded. Try again later.');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(profile: EndpointProfile, deleteConversations: boolean) {
    setBusyId(profile.id);
    try {
      // Registry dihapus terakhir supaya kegagalan cleanup tetap dapat di-retry
      // dari profile list, walau sebagian cleanup sebelumnya sudah berhasil.
      await deleteCatalogForEndpoint(profile.id);
      if (deleteConversations) {
        await conversationRepository.removeByEndpoint(profile.id, deleteStagedImages);
      }
      if (profile.credentialRef !== null) await credentialStore.remove(profile.credentialRef);
      await endpointStore.remove(profile.id);
      setDeleteTarget(null);
      await load();
    } catch {
      Alert.alert(
        'Endpoint deletion incomplete',
        'Cleanup stopped after a local storage error. Some selected data may already be deleted; retry from this profile.',
      );
    } finally {
      setBusyId(null);
    }
  }

  async function exportProfiles() {
    try { await shareEndpointProfiles(profiles); }
    catch { Alert.alert('Could not export endpoints', 'The system share sheet is unavailable.'); }
  }

  async function importProfiles() {
    try {
      const imported = await pickEndpointProfiles();
      if (imported === null) return;
      const existing = new Map((await endpointStore.loadAll()).map((profile) => [profile.id, profile]));
      if (imported.endpoints.some((profile) => {
        const current = existing.get(profile.id);
        return current !== undefined && current.baseUrl !== profile.baseUrl;
      })) throw new Error('Endpoint ID conflict.');
      const profilesToAdd = imported.endpoints.flatMap((portable) => {
        const current = existing.get(portable.id);
        if (current !== undefined) return [];
        const profile = createEndpointProfile({
          id: portable.id,
          name: portable.name,
          baseUrl: portable.baseUrl,
          protocol: portable.protocol,
          authMode: portable.authMode,
          credentialRef: null,
        });
        return [{ ...profile, headers: {}, compat: portable.compat }];
      });
      await endpointStore.addMany(profilesToAdd);
      await load();
      Alert.alert('Endpoints imported', 'Credentials were not imported. Add an API key before using each new endpoint.');
    } catch {
      Alert.alert('Could not import endpoints', 'The selected file is invalid or uses an unsupported schema.');
    }
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ gap: 12, padding: 16, paddingBottom: 32 }}>
        <View style={{ gap: 4 }}><Text style={{ color: colors.secondary, fontFamily: fonts.monoMedium, fontSize: 10 }}>PORTABLE CONFIGURATION</Text><Text style={{ color: colors.text, fontFamily: fonts.heading, fontSize: 22 }}>Endpoint Profiles</Text><Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 11 }}>Switch profiles or transfer configuration without credentials.</Text></View>
        {loading ? <ActivityIndicator color={colors.primary} /> : profiles.map((profile) => (
          <View key={profile.id} style={{ gap: 10, borderRadius: 8, backgroundColor: profile.id === activeId ? colors.surfaceHigh : colors.surface, padding: 12 }}>
            <View style={{ gap: 3 }}><Text style={{ color: colors.text, fontFamily: fonts.heading, fontSize: 15 }}>{profile.name}</Text><Text selectable style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 10 }}>{profile.baseUrl}</Text><Text style={{ color: profile.id === activeId ? colors.primary : colors.secondary, fontFamily: fonts.monoMedium, fontSize: typography.meta }}>{profile.id === activeId ? 'ACTIVE' : 'AVAILABLE'} {'//'} {profile.protocol.toUpperCase()}</Text></View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Action label={profile.id === activeId ? 'ACTIVE' : 'SWITCH'} disabled={profile.id === activeId || busyId !== null} onPress={() => void select(profile)} />
              <Action label="DELETE" danger disabled={busyId !== null} onPress={() => void prepareDelete(profile)} />
            </View>
          </View>
        ))}
        <Action label="ADD ENDPOINT" disabled={busyId !== null} onPress={() => router.push('/setup?mode=new')} />
        <View style={{ flexDirection: 'row', gap: 8 }}><Action label="IMPORT" disabled={busyId !== null} onPress={() => void importProfiles()} /><Action label="EXPORT" disabled={profiles.length === 0 || busyId !== null} onPress={() => void exportProfiles()} /></View>
      </ScrollView>
      <DeletePolicySheet target={deleteTarget} busy={busyId !== null} onCancel={() => setDeleteTarget(null)} onKeep={() => deleteTarget === null ? undefined : void remove(deleteTarget.profile, false)} onDelete={() => deleteTarget === null ? undefined : void remove(deleteTarget.profile, true)} />
    </SafeAreaView>
  );
}

function Action({ label, disabled, danger = false, onPress }: { label: string; disabled: boolean; danger?: boolean; onPress: () => void }) {
return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => ({ flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 4, backgroundColor: danger ? colors.errorBackground : colors.surfaceHigh, opacity: disabled ? 0.45 : pressed ? 0.75 : 1 })}><Text style={{ color: danger ? colors.error : colors.primary, fontFamily: fonts.monoMedium, fontSize: 10 }}>{label}</Text></Pressable>;
}

function DeletePolicySheet({ target, busy, onCancel, onKeep, onDelete }: { target: DeleteTarget | null; busy: boolean; onCancel: () => void; onKeep: () => void; onDelete: () => void }) {
  return (
    <BottomSheet visible={target !== null} dismissLabel="Dismiss endpoint delete confirmation" dismissDisabled={busy} onRequestClose={onCancel}>
      <View style={{ gap: 12, borderTopLeftRadius: 12, borderTopRightRadius: 12, backgroundColor: colors.surface, padding: 16 }}>
        <Text style={{ color: colors.text, fontFamily: fonts.heading, fontSize: 18 }}>Delete endpoint?</Text>
        <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 11 }}>
          {String(target?.conversationCount ?? 0)} conversations use this endpoint. Kept conversations remain readable but cannot send until a matching endpoint is connected.
        </Text>
        <Action label="KEEP CONVERSATIONS" disabled={busy} onPress={onKeep} />
        <Action label="DELETE ENDPOINT AND CONVERSATIONS" danger disabled={busy} onPress={onDelete} />
        <Action label="CANCEL" disabled={busy} onPress={onCancel} />
      </View>
    </BottomSheet>
  );
}
