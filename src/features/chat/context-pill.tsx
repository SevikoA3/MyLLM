import { useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';

import { DEFAULT_CONTEXT_POLICY, type ContextBudgetResult, type ContextPolicy } from '../../domain/context';
import { formatCount } from '../../domain/usage';
import { useTheme } from '../../ui/theme';

export function ContextPill({
  budget,
  policy = DEFAULT_CONTEXT_POLICY,
  autoCompact = true,
  compacting = false,
  canCompact = false,
  onCompact = () => undefined,
  onToggleAutoCompact = () => undefined,
}: {
  budget: ContextBudgetResult;
  policy?: ContextPolicy;
  autoCompact?: boolean;
  compacting?: boolean;
  canCompact?: boolean;
  onCompact?: () => void;
  onToggleAutoCompact?: (enabled: boolean) => void;
}) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const fillColor =
    budget.usedPercent !== null && budget.usedPercent >= 95
      ? theme.colors.danger
      : budget.usedPercent !== null && budget.usedPercent >= 80
        ? theme.colors.warningText
        : theme.colors.accent;
  const summary =
    budget.contextWindow === null
      ? `Context unknown · Input ~${formatCount(budget.inputTokensEstimate)} tok`
      : `Context ${formatCount(budget.contextWindow)} · ${
          budget.remainingPercent === null
            ? 'Left unavailable'
            : `${budget.remainingPercent.toFixed(1)}% left`
        }`;
  const quality =
    budget.usedPercent === null
      ? budget.quality
      : `${budget.usedPercent.toFixed(1)}% used · ${budget.quality}`;

  return (
    <View style={{ borderRadius: theme.radius.control, backgroundColor: theme.colors.surface }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Context meter"
        accessibilityHint="Buka detail context dan auto-compact"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((value) => !value)}
        style={{
          minHeight: 48,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: 10,
        }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: theme.colors.text, fontSize: theme.typography.meta, fontWeight: '700' }}>
            {summary}
          </Text>
          <Text style={{ color: theme.colors.textMuted, fontSize: theme.typography.meta }}>
            {quality} · Auto-compact {compacting ? 'berjalan...' : autoCompact ? 'aktif' : 'mati'}
          </Text>
        </View>
        <Text style={{ color: theme.colors.textMuted, fontSize: theme.typography.subtitle }}>
          {expanded ? '⌃' : '⌄'}
        </Text>
      </Pressable>

      {expanded && (
        <View style={{ gap: 8, paddingHorizontal: 10, paddingBottom: 10 }}>
          <Text style={{ color: theme.colors.textMuted, fontSize: theme.typography.meta }}>
            Input ~{formatCount(budget.inputTokensEstimate)} tok · Reserve{' '}
            {formatCount(budget.requestedOutputReserve)} · Margin {formatCount(budget.safetyMargin)}
          </Text>
          {budget.calibrationInputTokens !== null && budget.calibrationDeltaTokens !== null && (
            <Text style={{ color: theme.colors.textMuted, fontSize: theme.typography.meta }}>
              Calibration {formatCount(budget.calibrationInputTokens)} tok · delta{' '}
              {budget.calibrationDeltaTokens >= 0 ? '+' : '-'}
              {formatCount(Math.abs(budget.calibrationDeltaTokens))} tok
            </Text>
          )}
          {budget.usedPercent !== null && (
            <View
              accessible={false}
              style={{
                height: 4,
                overflow: 'hidden',
                borderRadius: 2,
                backgroundColor: theme.colors.border,
              }}>
              <View
                style={{
                  width: `${budget.usedPercent}%`,
                  height: 4,
                  backgroundColor: fillColor,
                }}
              />
            </View>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: theme.colors.textMuted, fontSize: theme.typography.meta }}>
              Auto-compact
            </Text>
            <Switch
              accessibilityLabel="Auto-compact"
              accessibilityHint="Aktifkan ringkasan otomatis saat context hampir penuh"
              value={autoCompact}
              disabled={compacting}
              onValueChange={onToggleAutoCompact}
            />
          </View>
          {canCompact && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Compact now"
              disabled={compacting}
              onPress={onCompact}
              style={({ pressed }) => ({
                minHeight: 48,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: theme.radius.control,
                backgroundColor: theme.colors.accent,
                opacity: compacting ? 0.5 : pressed ? 0.75 : 1,
              })}>
              <Text style={{ color: theme.colors.accentText, fontSize: theme.typography.meta, fontWeight: '700' }}>
                {compacting ? 'Compacting...' : 'Compact now'}
              </Text>
            </Pressable>
          )}
          {budget.usedPercent !== null && budget.usedPercent >= policy.hardStopPercent && (
            <Text style={{ color: theme.colors.danger, fontSize: theme.typography.meta }}>
              Context hard stop. Compact now, mulai chat baru, atau kurangi output reserve.
            </Text>
          )}
        </View>
      )}
    </View>
  );
}
