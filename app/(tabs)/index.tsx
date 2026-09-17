import { Link } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { InfoBlock, Screen } from '../../src/ui/components';
import { useTheme } from '../../src/ui/theme';

export default function HomeScreen() {
  const theme = useTheme();
  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          gap: 24,
          padding: theme.spacing.screen,
          paddingTop: 24,
        }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View
            style={{
              width: 48,
              height: 48,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: theme.radius.card,
              backgroundColor: theme.colors.accent,
            }}>
            <SymbolView
              name={{ ios: 'bubble.left.and.bubble.right.fill', android: 'chat_bubble' }}
              size={25}
              tintColor={theme.colors.accentText}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: theme.colors.text,
                fontSize: theme.typography.title,
                fontWeight: '800',
              }}>
              MyLLM
            </Text>
            <Text style={{ color: theme.colors.textMuted, fontSize: theme.typography.meta }}>
              Klien LLM untuk endpoint milikmu
            </Text>
          </View>
        </View>

        <View
          style={{
            gap: 16,
            padding: 20,
            borderRadius: theme.radius.card,
            backgroundColor: theme.colors.accent,
          }}>
          <View style={{ gap: 8 }}>
            <Text
              style={{
                color: theme.colors.accentText,
                fontSize: theme.typography.meta,
                fontWeight: '800',
                letterSpacing: 0.8,
              }}>
              KATALOG MODEL
            </Text>
            <Text
              style={{
                color: theme.colors.accentText,
                fontSize: 28,
                fontWeight: '800',
                lineHeight: 34,
              }}>
              Pilih model untuk percakapanmu
            </Text>
            <Text
              style={{
                color: theme.colors.accentText,
                fontSize: theme.typography.body,
                lineHeight: 22,
                opacity: 0.82,
              }}>
              Perbarui katalog, cek context window, lalu tentukan model aktif.
            </Text>
          </View>

          <Link href="/models" asChild>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Buka katalog model"
              style={({ pressed }) => ({
                minHeight: 48,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                borderRadius: theme.radius.control,
                backgroundColor: theme.colors.accentText,
                opacity: pressed ? 0.8 : 1,
              })}>
              <SymbolView
                name={{ ios: 'square.grid.2x2.fill', android: 'grid_view' }}
                size={20}
                tintColor={theme.colors.accent}
              />
              <Text
                style={{
                  color: theme.colors.accent,
                  fontSize: theme.typography.body,
                  fontWeight: '800',
                }}>
                Buka katalog model
              </Text>
            </Pressable>
          </Link>
        </View>

        <InfoBlock
          title="Sinkronkan katalog"
          body="Gunakan Refresh di tab Model agar metadata terbaru dari provider tersimpan."
        />
      </ScrollView>
    </Screen>
  );
}
