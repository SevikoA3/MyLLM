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
  const fillColor =
    budget.usedPercent !== null && budget.usedPercent >= 95
      ? theme.colors.danger
      : budget.usedPercent !== null && budget.usedPercent >= 80
        ? theme.colors.warningText
        : theme.colors.accent;
  const percentage =
    budget.usedPercent === null
      ? null
      : `${budget.usedPercent.toFixed(1)}% used · ${budget.remainingPercent?.toFixed(1)}% left`;

  return (
    <View
      accessibilityLabel="Context meter"
      style={{
        gap: 4,
        padding: 10,
        borderRadius: theme.radius.control,
        backgroundColor: theme.colors.surface,
      }}>
      <Text style={{ color: theme.colors.text, fontSize: theme.typography.meta, fontWeight: '700' }}>
        {budget.contextWindow === null
          ? `Input ~${formatCount(budget.inputTokensEstimate)} tok · Context unknown`
          : `Input ~${formatCount(budget.inputTokensEstimate)} tok · Context ${formatCount(budget.contextWindow)} tok · Left ${formatCount(budget.remainingTokens)} tok`}
      </Text>
      <Text style={{ color: theme.colors.textMuted, fontSize: theme.typography.meta }}>
        {budget.prospectiveUsed === null
          ? 'Reserve ' + formatCount(budget.requestedOutputReserve) + ' · Margin unavailable · ' + budget.quality
          : `Prospective ${formatCount(budget.prospectiveUsed)} tok = input + reserve + margin · ${percentage}`}
      </Text>
      {budget.prospectiveUsed !== null && (
        <Text style={{ color: theme.colors.textMuted, fontSize: theme.typography.meta }}>
          Reserve {formatCount(budget.requestedOutputReserve)} · Margin {formatCount(budget.safetyMargin)} · {budget.quality}
        </Text>
      )}
      {budget.calibrationInputTokens !== null && budget.calibrationDeltaTokens !== null && (
        <Text style={{ color: theme.colors.textMuted, fontSize: theme.typography.meta }}>
          Calibration: provider input {formatCount(budget.calibrationInputTokens)} tok · delta{' '}
          {budget.calibrationDeltaTokens >= 0 ? '+' : '-'}
          {formatCount(Math.abs(budget.calibrationDeltaTokens))} tok · not occupancy
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
          Auto-compact {compacting ? 'berjalan...' : autoCompact ? 'aktif' : 'mati'}
        </Text>
        <Switch
          accessibilityLabel="Auto-compact"
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
            minHeight: 40,
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
  );
}
