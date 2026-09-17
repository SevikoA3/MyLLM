import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { ThemeColors } from './theme';
import { useTheme } from './theme';

export function Screen({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <SafeAreaView
      className="flex-1"
      style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {children}
    </SafeAreaView>
  );
}

export function PrimaryButton({
  label,
  hint,
  busy = false,
  disabled = false,
  onPress,
}: {
  label: string;
  hint?: string;
  busy?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const inactive = busy || disabled;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ busy, disabled: inactive }}
      disabled={inactive}
      onPress={onPress}
      style={{
        minHeight: 48,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: theme.spacing.screen,
        borderRadius: theme.radius.control,
        backgroundColor: inactive ? theme.colors.surface : theme.colors.accent,
      }}>
      <Text
        style={{
          color: inactive ? theme.colors.textMuted : theme.colors.accentText,
          fontSize: theme.typography.body,
          fontWeight: '700',
        }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function LinkCard({
  href,
  label,
  description,
}: {
  href: '/' | '/models' | '/setup' | '/history';
  label: string;
  description?: string;
}) {
  const theme = useTheme();
  return (
    <Link href={href} asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        style={{
          minHeight: 48,
          justifyContent: 'center',
          gap: 2,
          padding: theme.spacing.screen,
          borderRadius: theme.radius.control,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
        }}>
        <Text style={{ color: theme.colors.text, fontSize: theme.typography.body, fontWeight: '700' }}>
          {label}
        </Text>
        {description !== undefined && (
          <Text style={{ color: theme.colors.textMuted, fontSize: theme.typography.meta }}>
            {description}
          </Text>
        )}
      </Pressable>
    </Link>
  );
}

/** Blok informasi dengan warna teks eksplisit supaya tetap kontras di kedua mode. */
export function InfoBlock({
  title,
  body,
  tone = 'neutral',
}: {
  title: string;
  body: string;
  tone?: 'neutral' | 'warning' | 'danger';
}) {
  const theme = useTheme();
  const palette = tonePalette(theme.colors, tone);
  return (
    <View
      style={{
        gap: 4,
        padding: theme.spacing.screen,
        borderRadius: theme.radius.card,
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: palette.background,
      }}>
      <Text style={{ color: palette.title, fontSize: theme.typography.body, fontWeight: '700' }}>
        {title}
      </Text>
      <Text style={{ color: palette.body, fontSize: theme.typography.body }}>{body}</Text>
    </View>
  );
}

export function PlaceholderScreen({ title, body }: { title: string; body: string }) {
  const theme = useTheme();
  return (
    <Screen>
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          gap: theme.spacing.gap,
          padding: theme.spacing.screen,
        }}>
        <Text style={{ color: theme.colors.text, fontSize: theme.typography.title, fontWeight: '700' }}>
          {title}
        </Text>
        <Text style={{ color: theme.colors.textMuted, fontSize: theme.typography.body }}>{body}</Text>
      </View>
    </Screen>
  );
}

function tonePalette(colors: ThemeColors, tone: 'neutral' | 'warning' | 'danger') {
  if (tone === 'warning') {
    return {
      background: colors.warningBg,
      border: colors.warningBg,
      title: colors.warningText,
      body: colors.warningText,
    };
  }
  if (tone === 'danger') {
    return {
      background: colors.surface,
      border: colors.danger,
      title: colors.danger,
      body: colors.text,
    };
  }
  return {
    background: colors.surface,
    border: colors.border,
    title: colors.text,
    body: colors.textMuted,
  };
}
