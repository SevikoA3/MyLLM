import { Redirect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useActiveEndpoint } from '../src/features/setup/use-active-endpoint';
import { colors, fonts } from '../src/ui/tokens';

export default function EntryScreen() {
  const { status, profile } = useActiveEndpoint();

  if (status === 'loading') {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.background }}>
        <StatusBar style="light" />
        <View style={{ flex: 1, justifyContent: 'center', gap: 16, padding: 16 }}>
          <View style={{ alignItems: 'center', gap: 8 }}>
            <View style={{ width: 56, height: 56, alignItems: 'center', justifyContent: 'center', borderRadius: 28, backgroundColor: colors.surfaceHigh }}>
              <SymbolView name={{ ios: 'terminal.fill', android: 'terminal' }} size={28} tintColor={colors.primary} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 4, backgroundColor: colors.surfaceLow, paddingHorizontal: 8, paddingVertical: 4 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary }} />
              <Text style={{ color: colors.primary, fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 0.8 }}>
                BOOTSTRAP_INIT
              </Text>
            </View>
            <Text style={{ color: colors.text, fontFamily: fonts.heading, fontSize: 22, lineHeight: 28 }}>
              Preparing MyLLM
            </Text>
            <Text style={{ maxWidth: 300, color: colors.muted, fontFamily: fonts.mono, fontSize: 11, lineHeight: 16, textAlign: 'center' }}>
              Reading local endpoint configuration before routing this session.
            </Text>
          </View>

          <View style={{ gap: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceLow, padding: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <SymbolView name={{ ios: 'arrow.triangle.2.circlepath', android: 'sync' }} size={16} tintColor={colors.secondary} />
                <Text style={{ color: colors.text, fontFamily: fonts.heading, fontSize: 13 }}>Startup route evaluator</Text>
              </View>
              <ActivityIndicator accessibilityLabel="Checking endpoint" size="small" color={colors.primary} />
            </View>
            <StartupRow label="Active endpoint profile" detail="Reading local configuration" status="CHECK" />
            <StartupRow label="Route dispatch" detail="Awaiting endpoint result" status="PEND" />
          </View>

          <View style={{ gap: 5, borderRadius: 4, backgroundColor: colors.surfaceLowest, padding: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <Text style={{ color: colors.muted, fontFamily: fonts.monoMedium, fontSize: 10 }}>STATE_VECTOR: VALIDATING</Text>
              <Text style={{ color: colors.secondary, fontFamily: fonts.monoMedium, fontSize: 10 }}>LOCAL ONLY</Text>
            </View>
            <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.surfaceHigh }}>
              <View style={{ width: '62%', height: 4, borderRadius: 2, backgroundColor: colors.primary }} />
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return profile === null ? <Redirect href="/setup" /> : <Redirect href="/(tabs)" />;
}

function StartupRow({ label, detail, status }: { label: string; detail: string; status: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderRadius: 4, backgroundColor: colors.surfaceHigh, padding: 10 }}>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={{ color: colors.text, fontFamily: fonts.monoMedium, fontSize: 11 }}>{label}</Text>
        <Text numberOfLines={1} style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 10 }}>{detail}</Text>
      </View>
      <Text style={{ color: colors.secondary, fontFamily: fonts.monoMedium, fontSize: 10 }}>{status}</Text>
    </View>
  );
}
