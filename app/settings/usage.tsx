import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts, interaction, radius, spacing, typography } from '../../src/ui/tokens';

import { useActiveEndpoint } from '../../src/features/setup/use-active-endpoint';
import { credentialStore } from '../../src/services/credentials/store';
import { fetchAccountUsage, type AccountUsage } from '../../src/services/transport/usage';

export default function UsageScreen() {
  const { status, profile } = useActiveEndpoint();
  const [usage, setUsage] = useState<AccountUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const busy = status === 'loading' || loading;

  const load = useCallback(async () => {
    const currentRequestId = ++requestId.current;
    setLoading(true);
    setUsage(null);
    setError(null);
    if (status === 'loading') return;
    try {
      if (profile === null || profile.compat.usagePath === null || profile.credentialRef === null) {
        setError('This endpoint does not provide an account usage screen. Return to settings.');
        return;
      }
      const key = await credentialStore.read(profile.credentialRef);
      if (currentRequestId !== requestId.current) return;
      if (key === null) {
        setError('The endpoint credential is unavailable. Return to settings to reconnect.');
        return;
      }
      const result = await fetchAccountUsage(profile, key);
      if (currentRequestId !== requestId.current) return;
      if (result.ok) setUsage(result.usage);
      else setError(result.error.message);
    } catch {
      if (currentRequestId === requestId.current) {
        setError('Account usage could not be loaded. Refresh usage to try again.');
      }
    } finally {
      if (currentRequestId === requestId.current) setLoading(false);
    }
  }, [profile, status]);

  useEffect(() => {
    let alive = true;
    void Promise.resolve().then(() => { if (alive) void load(); });
    return () => {
      alive = false;
      requestId.current += 1;
    };
  }, [load]);

  return (
    <SafeAreaView edges={[]} style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ gap: spacing.screen, padding: spacing.screen }}>
        <View style={{ gap: 4 }}>
          <Text style={{ color: colors.secondary, fontFamily: fonts.monoMedium, fontSize: 10 }}>DOCUMENTED ENDPOINT DATA</Text>
          <Text style={{ color: colors.text, fontFamily: fonts.heading, fontSize: 22 }}>Account Usage</Text>
          <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 11 }}>{profile?.name ?? 'No endpoint'}</Text>
        </View>
        <View style={{ gap: spacing.medium, borderRadius: radius.card, backgroundColor: colors.surface, padding: spacing.medium }}>
          {busy ? (
            <>
              <ActivityIndicator accessible accessibilityRole="progressbar" accessibilityLabel={status === 'loading' ? 'Loading endpoint' : 'Loading account usage'} accessibilityState={{ busy: true }} color={colors.primary} />
              <Text accessibilityLiveRegion="polite" style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: typography.label }}>{status === 'loading' ? 'Loading endpoint…' : 'Loading account usage…'}</Text>
            </>
          ) : error !== null ? (
            <Text accessibilityRole="alert" style={{ color: colors.error, fontFamily: fonts.mono, fontSize: 11 }}>{error}</Text>
          ) : usage !== null ? (
            <>
              <Metric label="BALANCE" value={usage.balance === null ? 'unavailable' : String(usage.balance)} />
              <Metric label="CURRENCY" value={usage.currency ?? 'unavailable'} />
              <Metric label="PERIOD START" value={usage.periodStart ?? 'unavailable'} />
              <Metric label="PERIOD END" value={usage.periodEnd ?? 'unavailable'} />
            </>
          ) : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Refresh account usage" accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={() => void load()} style={({ pressed }) => ({ minHeight: interaction.touchTarget, alignItems: 'center', justifyContent: 'center', borderRadius: radius.control, backgroundColor: colors.surfaceHigh, opacity: busy ? interaction.disabledOpacity : pressed ? interaction.pressedOpacity : 1 })}>
          <Text style={{ color: colors.primary, fontFamily: fonts.heading, fontSize: typography.body }}>Refresh usage</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}><Text style={{ color: colors.muted, fontFamily: fonts.monoMedium, fontSize: 10 }}>{label}</Text><Text selectable style={{ color: colors.text, fontFamily: fonts.mono, fontSize: 11 }}>{value}</Text></View>;
}
