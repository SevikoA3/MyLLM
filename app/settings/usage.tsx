import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts } from '../../src/ui/tokens';

import { useActiveEndpoint } from '../../src/features/setup/use-active-endpoint';
import { credentialStore } from '../../src/services/credentials/store';
import { fetchAccountUsage, type AccountUsage } from '../../src/services/transport/usage';

export default function UsageScreen() {
  const { status, profile } = useActiveEndpoint();
  const [usage, setUsage] = useState<AccountUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const currentRequestId = ++requestId.current;
    if (profile === null || profile.compat.usagePath === null || profile.credentialRef === null) {
      setLoading(false);
      setUsage(null);
      setError('This endpoint does not provide an account usage screen.');
      return;
    }
    setLoading(true);
    setUsage(null);
    setError(null);
    const key = await credentialStore.read(profile.credentialRef);
    if (currentRequestId !== requestId.current) return;
    if (key === null) {
      setLoading(false);
      setError('The endpoint credential is unavailable.');
      return;
    }
    const result = await fetchAccountUsage(profile, key);
    if (currentRequestId !== requestId.current) return;
    setLoading(false);
    if (result.ok) setUsage(result.usage);
    else setError(result.error.message);
  }, [profile]);

  useEffect(() => {
    const currentRequestId = ++requestId.current;
    let alive = true;
    void (async () => {
      if (profile === null || profile.compat.usagePath === null || profile.credentialRef === null) {
        if (alive) {
          setLoading(false);
          setUsage(null);
          setError('This endpoint does not provide an account usage screen.');
        }
        return;
      }
      const key = await credentialStore.read(profile.credentialRef);
      if (!alive || currentRequestId !== requestId.current) return;
      if (key === null) {
        setLoading(false);
        setError('The endpoint credential is unavailable.');
        return;
      }
      const result = await fetchAccountUsage(profile, key);
      if (!alive || currentRequestId !== requestId.current) return;
      setLoading(false);
      if (result.ok) setUsage(result.usage);
      else setError(result.error.message);
    })();
    return () => {
      alive = false;
      requestId.current += 1;
    };
  }, [profile]);

  if (status === 'loading') {
    return <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}><ActivityIndicator color={colors.primary} /></SafeAreaView>;
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ gap: 16, padding: 16 }}>
        <View style={{ gap: 4 }}>
          <Text style={{ color: colors.secondary, fontFamily: fonts.monoMedium, fontSize: 10 }}>DOCUMENTED ENDPOINT DATA</Text>
          <Text style={{ color: colors.text, fontFamily: fonts.heading, fontSize: 22 }}>Account Usage</Text>
          <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 11 }}>{profile?.name ?? 'No endpoint'}</Text>
        </View>
        <View style={{ gap: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.surface, padding: 12 }}>
          {loading ? <ActivityIndicator color={colors.primary} /> : error !== null ? (
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
        <Pressable accessibilityRole="button" accessibilityLabel="Refresh account usage" disabled={loading} onPress={() => void load()} style={({ pressed }) => ({ minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 4, backgroundColor: colors.surfaceHigh, opacity: loading ? 0.5 : pressed ? 0.75 : 1 })}>
          <Text style={{ color: colors.primary, fontFamily: fonts.monoMedium, fontSize: 10 }}>REFRESH USAGE</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}><Text style={{ color: colors.muted, fontFamily: fonts.monoMedium, fontSize: 10 }}>{label}</Text><Text selectable style={{ color: colors.text, fontFamily: fonts.mono, fontSize: 11 }}>{value}</Text></View>;
}
