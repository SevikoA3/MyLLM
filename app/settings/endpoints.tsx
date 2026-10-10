import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { createEndpointProfile, type EndpointProfile } from '../../src/domain/endpoint';
import { deleteStagedAttachments } from '../../src/services/attachments/files';
import { credentialStore } from '../../src/services/credentials/store';
import { deleteCatalogForEndpoint } from '../../src/services/persistence/catalog-files';
import { pickEndpointProfiles, shareEndpointProfiles } from '../../src/services/persistence/catalog-transfer';
import { conversationRepository } from '../../src/services/persistence/conversation-store';
import { endpointStore } from '../../src/services/persistence/endpoint-store';
import { colors, fonts, interaction, radius, spacing, typography } from '../../src/ui/tokens';
import { BottomSheet } from '../../src/ui/bottom-sheet';
type DeleteTarget = { profile: EndpointProfile; conversationCount: number };

export default function EndpointProfilesScreen() {
  const router = useRouter();
  const [profiles, setProfiles] = useState<EndpointProfile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [transfer, setTransfer] = useState<'import' | 'export' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const mounted = useRef(true);
  const busy = loading || busyId !== null || transfer !== null;

  const load = useCallback(() => {
    return Promise.all([endpointStore.loadAll(), endpointStore.load()]).then(([all, active]) => {
      if (!mounted.current) return;
      setProfiles(all);
      setActiveId(active?.id ?? null);
      setLoadError(null);
    }).catch(() => {
      if (mounted.current) setLoadError('Could not load endpoint profiles. Try again.');
    }).finally(() => {
      if (mounted.current) setLoading(false);
    });
  }, []);
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; };
  }, [load]);

  async function select(profile: EndpointProfile) {
    if (busy) return;
    setBusyId(profile.id);
    try {
      await endpointStore.select(profile.id);
      setActiveId(profile.id);
      router.replace('/chat');
    } catch {
      Alert.alert('Could not switch endpoint', 'Try again later.');
    } finally {
      setBusyId(null);
    }
  }

  async function edit(profile: EndpointProfile) {
    if (busy) return;
    setBusyId(profile.id);
    try {
      await endpointStore.select(profile.id);
      setActiveId(profile.id);
      router.push('/setup');
    } catch {
      Alert.alert('Could not edit endpoint', 'The profile could not be selected. Try again.');
    } finally {
      setBusyId(null);
    }
  }

  async function prepareDelete(profile: EndpointProfile) {
    if (busy) return;
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
    if (busy) return;
    setBusyId(profile.id);
    try {
      // Registry dihapus terakhir supaya kegagalan cleanup tetap dapat di-retry
      // dari profile list, walau sebagian cleanup sebelumnya sudah berhasil.
      await deleteCatalogForEndpoint(profile.id);
      if (deleteConversations) {
        await conversationRepository.removeByEndpoint(profile.id, deleteStagedAttachments);
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
    if (busy) return;
    setTransfer('export');
    try { await shareEndpointProfiles(profiles); }
    catch { Alert.alert('Could not export endpoints', 'The system share sheet is unavailable.'); }
    finally { setTransfer(null); }
  }

  async function importProfiles() {
    if (busy) return;
    setTransfer('import');
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
    } finally {
      setTransfer(null);
    }
  }

  return (
    <SafeAreaView edges={[]} style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ gap: 12, padding: 16, paddingBottom: 32 }}>
        <View style={{ gap: 4 }}><Text style={{ color: colors.secondary, fontFamily: fonts.monoMedium, fontSize: 10 }}>PORTABLE CONFIGURATION</Text><Text style={{ color: colors.text, fontFamily: fonts.heading, fontSize: 22 }}>Endpoint Profiles</Text><Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 11 }}>Switch profiles or transfer configuration without credentials.</Text></View>
        {loading ? (
          <View style={{ gap: spacing.small, alignItems: 'center' }}>
            <ActivityIndicator color={colors.primary} />
            <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: typography.body }}>Loading endpoint profiles.</Text>
          </View>
        ) : loadError !== null ? (
          <View style={{ gap: spacing.small }}>
            <Text accessibilityRole="alert" style={{ color: colors.error, fontFamily: fonts.mono, fontSize: typography.body }}>{loadError}</Text>
            <Action label="Retry" disabled={busy} onPress={() => { setLoading(true); void load(); }} />
          </View>
        ) : profiles.length === 0 ? (
          <View style={{ gap: spacing.xsmall }}>
            <Text style={{ color: colors.text, fontFamily: fonts.heading, fontSize: typography.componentTitle }}>No endpoint profiles yet.</Text>
            <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: typography.body }}>Add an endpoint or import configuration to get started.</Text>
          </View>
        ) : profiles.map((profile) => (
          <View key={profile.id} style={{ gap: 10, borderRadius: 8, backgroundColor: profile.id === activeId ? colors.surfaceHigh : colors.surface, padding: 12 }}>
            <View style={{ gap: 3 }}><Text style={{ color: colors.text, fontFamily: fonts.heading, fontSize: 15 }}>{profile.name}</Text><Text selectable style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 10 }}>{profile.baseUrl}</Text><Text style={{ color: profile.id === activeId ? colors.primary : colors.secondary, fontFamily: fonts.monoMedium, fontSize: typography.meta }}>{profile.id === activeId ? 'ACTIVE' : 'AVAILABLE'} {'//'} {profile.protocol.toUpperCase()}</Text></View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.small }}>
              <View style={{ flexGrow: 1, flexBasis: interaction.touchTarget * 2 }}><Action label={profile.id === activeId ? 'ACTIVE' : 'SWITCH'} accessibilityLabel={profile.id === activeId ? `Active endpoint ${profile.name}` : `Switch to ${profile.name}`} disabled={profile.id === activeId || busy} onPress={() => void select(profile)} /></View>
              <View style={{ flexGrow: 1, flexBasis: interaction.touchTarget * 2 }}><Action label="EDIT" accessibilityLabel={`Edit ${profile.name}`} disabled={busy} onPress={() => void edit(profile)} /></View>
              <View style={{ flexGrow: 1, flexBasis: interaction.touchTarget * 2 }}><Action label="DELETE" accessibilityLabel={`Delete ${profile.name}`} danger disabled={busy} onPress={() => void prepareDelete(profile)} /></View>
            </View>
          </View>
        ))}
        <Action label="ADD ENDPOINT" disabled={busy} onPress={() => router.push('/setup?mode=new')} />
        <View style={{ flexDirection: 'row', gap: spacing.small }}><View style={{ flex: 1 }}><Action label="IMPORT" disabled={busy} onPress={() => void importProfiles()} /></View><View style={{ flex: 1 }}><Action label="EXPORT" disabled={profiles.length === 0 || loadError !== null || busy} onPress={() => void exportProfiles()} /></View></View>
        {transfer !== null && <Text accessibilityLiveRegion="polite" style={{ color: colors.secondary, fontFamily: fonts.mono, fontSize: typography.label }}>{transfer === 'import' ? 'Importing endpoint profiles.' : 'Exporting endpoint profiles.'}</Text>}
      </ScrollView>
      <DeletePolicySheet target={deleteTarget} busy={busyId !== null} onCancel={() => setDeleteTarget(null)} onKeep={() => deleteTarget === null ? undefined : void remove(deleteTarget.profile, false)} onDelete={() => deleteTarget === null ? undefined : void remove(deleteTarget.profile, true)} />
    </SafeAreaView>
  );
}

function Action({ label, accessibilityLabel = label, disabled, danger = false, onPress }: { label: string; accessibilityLabel?: string; disabled: boolean; danger?: boolean; onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={({ pressed }) => ({ minHeight: interaction.touchTarget, paddingHorizontal: spacing.medium, paddingVertical: spacing.small, alignItems: 'center', justifyContent: 'center', borderRadius: radius.control, borderWidth: 1, borderColor: focused ? colors.primary : 'transparent', backgroundColor: danger ? colors.errorBackground : colors.surfaceHigh, opacity: disabled ? interaction.disabledOpacity : pressed ? interaction.pressedOpacity : 1 })}><Text style={{ color: danger ? colors.error : colors.primary, fontFamily: fonts.heading, fontSize: typography.label, textAlign: 'center' }}>{label}</Text></Pressable>;
}

function DeletePolicySheet({ target, busy, onCancel, onKeep, onDelete }: { target: DeleteTarget | null; busy: boolean; onCancel: () => void; onKeep: () => void; onDelete: () => void }) {
  return (
    <BottomSheet visible={target !== null} dismissLabel="Dismiss endpoint delete confirmation" dismissDisabled={busy} onRequestClose={onCancel}>
      <SafeAreaView edges={['bottom']} style={{ gap: spacing.medium, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, backgroundColor: colors.sheet, padding: spacing.screen }}>
        <View accessible={false} style={{ width: spacing.xlarge, height: spacing.xsmall, borderRadius: radius.micro, backgroundColor: colors.outline, alignSelf: 'center' }} />
        <Text style={{ color: colors.text, fontFamily: fonts.heading, fontSize: 18 }}>Delete endpoint?</Text>
        <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 11 }}>
          {String(target?.conversationCount ?? 0)} conversations use this endpoint. Kept conversations remain readable but cannot send until a matching endpoint is connected.
        </Text>
        <Action label="KEEP CONVERSATIONS" disabled={busy} onPress={onKeep} />
        <Action label="DELETE ENDPOINT AND CONVERSATIONS" danger disabled={busy} onPress={onDelete} />
        <Action label="CANCEL" disabled={busy} onPress={onCancel} />
      </SafeAreaView>
    </BottomSheet>
  );
}
