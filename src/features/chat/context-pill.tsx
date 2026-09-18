import { useState } from 'react';
import { Modal, Pressable, Switch, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { DEFAULT_CONTEXT_POLICY, type ContextBudgetResult, type ContextPolicy } from '../../domain/context';
import { formatCount } from '../../domain/usage';
import { useTheme } from '../../ui/theme';

const TOUCH_SIZE = 48;
const RING_SIZE = 28;
const RING_CENTER = RING_SIZE / 2;
const RING_STROKE = 3;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

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
  const progress = budget.usedPercent === null ? null : Math.min(100, Math.max(0, budget.usedPercent)) / 100;
  const accessibilityLabel =
    progress === null ? 'Context usage unavailable' : `Context usage, ${Math.round(progress * 100)} percent`;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint="Show context usage and auto-compact controls"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded(true)}
        style={{
          width: TOUCH_SIZE,
          height: TOUCH_SIZE,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: TOUCH_SIZE / 2,
        }}>
        <Svg width={RING_SIZE} height={RING_SIZE} pointerEvents="none">
          <Circle
            cx={RING_CENTER}
            cy={RING_CENTER}
            r={RING_RADIUS}
            fill="none"
            stroke={theme.colors.border}
            strokeWidth={RING_STROKE}
          />
          {progress !== null && (
            <Circle
              cx={RING_CENTER}
              cy={RING_CENTER}
              r={RING_RADIUS}
              fill="none"
              stroke={fillColor}
              strokeWidth={RING_STROKE}
              strokeLinecap="round"
              strokeDasharray={[RING_CIRCUMFERENCE, RING_CIRCUMFERENCE]}
              strokeDashoffset={RING_CIRCUMFERENCE * (1 - progress)}
              transform={`rotate(-90 ${RING_CENTER} ${RING_CENTER})`}
            />
          )}
        </Svg>
      </Pressable>

      <Modal
        visible={expanded}
        transparent
        animationType="fade"
        onRequestClose={() => setExpanded(false)}>
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            backgroundColor: 'rgba(0, 0, 0, 0.45)',
          }}>
          <View
            style={{
              width: '100%',
              maxWidth: 360,
              gap: 10,
              padding: 14,
              borderRadius: theme.radius.card,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
            }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: theme.colors.text, fontSize: theme.typography.subtitle, fontWeight: '700' }}>
                Context usage
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close context usage"
                onPress={() => setExpanded(false)}
                style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}>
                <Text style={{ color: theme.colors.accent, fontWeight: '700' }}>Close</Text>
              </Pressable>
            </View>
            <Text style={{ color: theme.colors.textMuted, fontSize: theme.typography.meta }}>
              Context {budget.contextWindow === null ? 'unknown' : formatCount(budget.contextWindow)} · Input ~
              {formatCount(budget.inputTokensEstimate)} tokens · Left{' '}
              {budget.remainingPercent === null ? 'unavailable' : `${budget.remainingPercent.toFixed(1)}%`}
            </Text>
            <Text style={{ color: theme.colors.textMuted, fontSize: theme.typography.meta }}>
              Reserve {formatCount(budget.requestedOutputReserve)} · Margin {formatCount(budget.safetyMargin)} ·{' '}
              {budget.quality}
            </Text>
            {budget.calibrationInputTokens !== null && budget.calibrationDeltaTokens !== null && (
              <Text style={{ color: theme.colors.textMuted, fontSize: theme.typography.meta }}>
                Calibration {formatCount(budget.calibrationInputTokens)} tokens · delta{' '}
                {budget.calibrationDeltaTokens >= 0 ? '+' : '-'}
                {formatCount(Math.abs(budget.calibrationDeltaTokens))} tokens
              </Text>
            )}
            <View style={{ height: 4, overflow: 'hidden', borderRadius: 2, backgroundColor: theme.colors.border }}>
              <View
                style={{
                  width: `${budget.usedPercent === null ? 0 : Math.min(100, Math.max(0, budget.usedPercent))}%`,
                  height: 4,
                  backgroundColor: fillColor,
                }}
              />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: theme.colors.textMuted, fontSize: theme.typography.meta }}>
                Auto-compact {compacting ? 'running' : autoCompact ? 'on' : 'off'}
              </Text>
              <Switch
                accessibilityLabel="Auto-compact"
                accessibilityHint="Automatically summarize when context is nearly full"
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
                  minHeight: 44,
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
                Context limit reached. Compact, start a new chat, or reduce output reserve.
              </Text>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}
