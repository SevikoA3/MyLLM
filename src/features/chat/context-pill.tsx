import { useState } from 'react';
import { Modal, Pressable, Switch, Text, View } from 'react-native';

import { DEFAULT_CONTEXT_POLICY, type ContextBudgetResult, type ContextPolicy } from '../../domain/context';
import { formatCount } from '../../domain/usage';
import { useTheme } from '../../ui/theme';

const RING_SIZE = 48;
const RING_CENTER = RING_SIZE / 2;
const RING_RADIUS = 19;
const RING_SEGMENTS = 24;
const SEGMENT_WIDTH = 4;
const SEGMENT_HEIGHT = 9;

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
  const percentLabel = budget.usedPercent === null ? '?' : `${Math.round(budget.usedPercent)}%`;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Context usage"
        accessibilityHint="Show context usage and auto-compact controls"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded(true)}
        style={{
          width: RING_SIZE,
          height: RING_SIZE,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: RING_SIZE / 2,
          backgroundColor: theme.colors.surface,
        }}>
        {Array.from({ length: RING_SEGMENTS }, (_, index) => {
          const angle = (index / RING_SEGMENTS) * Math.PI * 2;
          const degrees = (index / RING_SEGMENTS) * 360;
          const active = progress !== null && progress > index / RING_SEGMENTS;
          return (
            <View
              key={index}
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: RING_CENTER + Math.sin(angle) * RING_RADIUS - SEGMENT_WIDTH / 2,
                top: RING_CENTER - Math.cos(angle) * RING_RADIUS - SEGMENT_HEIGHT / 2,
                width: SEGMENT_WIDTH,
                height: SEGMENT_HEIGHT,
                borderRadius: SEGMENT_WIDTH / 2,
                backgroundColor: active ? fillColor : theme.colors.border,
                transform: [{ rotate: `${degrees}deg` }],
              }}
            />
          );
        })}
        <Text style={{ color: theme.colors.text, fontSize: 11, fontWeight: '800' }}>{percentLabel}</Text>
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
