import { useState } from 'react';
import { SymbolView } from 'expo-symbols';
import { Modal, Pressable, Switch, Text, View } from 'react-native';

import { DEFAULT_CONTEXT_POLICY, type ContextBudgetResult, type ContextPolicy } from '../../domain/context';
import { formatCount, formatDuration, formatPercent, formatRate, type TurnMetrics } from '../../domain/usage';

const theme = {
  colors: {
    canvas: '#060e20',
    sheet: '#131b2e',
    surface: '#171f33',
    surfaceHigh: '#222a3d',
    border: '#86948a',
    text: '#dae2fd',
    textMuted: '#bbcabf',
    accent: '#4edea3',
    accentText: '#003824',
    secondary: '#4cd7f6',
    danger: '#ffb4ab',
    warning: '#ffb95f',
  },
  radius: { control: 4, card: 8, sheet: 12 },
  typography: { subtitle: 18, body: 13, meta: 10 },
  fonts: { heading: 'Inter_600SemiBold', mono: 'JetBrainsMono_400Regular', monoMedium: 'JetBrainsMono_500Medium' },
} as const;

export function ContextPill({
  budget,
  metrics = null,
  cacheHitPercent = null,
  policy = DEFAULT_CONTEXT_POLICY,
  autoCompact = true,
  autoApproveTools = false,
  compacting = false,
  canCompact = false,
  onCompact = () => undefined,
  onToggleAutoCompact = () => undefined,
  onToggleAutoApproveTools = () => undefined,
}: {
  budget: ContextBudgetResult;
  metrics?: TurnMetrics | null;
  cacheHitPercent?: number | null;
  policy?: ContextPolicy;
  autoCompact?: boolean;
  autoApproveTools?: boolean;
  compacting?: boolean;
  canCompact?: boolean;
  onCompact?: () => void;
  onToggleAutoCompact?: (enabled: boolean) => void;
  onToggleAutoApproveTools?: (enabled: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const fillColor = contextColor(budget.usedPercent);
  const progress = budget.usedPercent === null ? null : Math.min(100, Math.max(0, budget.usedPercent)) / 100;
  const accessibilityLabel = progress === null ? 'Context usage unavailable' : 'Context usage, ' + String(Math.round(progress * 100)) + ' percent';

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint="Show context, request metrics, auto-compact, and tool approval controls"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded(true)}
        style={({ pressed }) => ({
          minHeight: 44,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          paddingHorizontal: 10,
          borderRadius: theme.radius.control,
          backgroundColor: theme.colors.surface,
          opacity: pressed ? 0.75 : 1,
        })}>
        <SymbolView name={{ ios: 'chart.pie.fill', android: 'pie_chart' }} size={14} tintColor={theme.colors.secondary} />
        <Text style={{ color: theme.colors.textMuted, fontFamily: theme.fonts.mono, fontSize: theme.typography.meta }}>CTX</Text>
        <Text style={{ color: theme.colors.text, fontFamily: theme.fonts.monoMedium, fontSize: theme.typography.meta }}>
          {formatCount(budget.inputTokensEstimate)}/{budget.contextWindow === null ? 'unknown' : formatCount(budget.contextWindow)}
        </Text>
        {budget.usedPercent !== null && (
          <Text style={{ color: fillColor, fontFamily: theme.fonts.monoMedium, fontSize: theme.typography.meta }}>
            {budget.usedPercent.toFixed(1) + '%'}
          </Text>
        )}
        <SymbolView name={{ ios: 'chevron.down', android: 'expand_more' }} size={14} tintColor={theme.colors.textMuted} />
      </Pressable>

      <Modal
        visible={expanded}
        transparent
        animationType="slide"
        presentationStyle="overFullScreen"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setExpanded(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.55)' }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Dismiss context usage" onPress={() => setExpanded(false)} style={{ position: 'absolute', inset: 0 }} />
          <View accessibilityViewIsModal style={{ gap: 12, borderTopWidth: 1, borderTopColor: theme.colors.border, borderTopLeftRadius: theme.radius.sheet, borderTopRightRadius: theme.radius.sheet, backgroundColor: theme.colors.sheet, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 }}>
            <View style={{ alignItems: 'center' }}>
              <View style={{ width: 32, height: 4, borderRadius: 2, backgroundColor: theme.colors.border }} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <SymbolView name={{ ios: 'chart.bar.xaxis', android: 'analytics' }} size={20} tintColor={theme.colors.secondary} />
                <Text style={{ color: theme.colors.text, fontFamily: theme.fonts.heading, fontSize: theme.typography.subtitle }}>Context &amp; telemetry</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Dismiss context usage" onPress={() => setExpanded(false)} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}>
                <Text style={{ color: theme.colors.accent, fontFamily: theme.fonts.monoMedium, fontSize: theme.typography.meta }}>CLOSE</Text>
              </Pressable>
            </View>

            <ContextGauge budget={budget} fillColor={fillColor} />
            <RequestMetrics metrics={metrics} cacheHitPercent={cacheHitPercent} />

            <View style={{ gap: 8, borderRadius: theme.radius.card, backgroundColor: theme.colors.surface, padding: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <SymbolView name={{ ios: 'arrow.triangle.2.circlepath', android: 'compress' }} size={17} tintColor={theme.colors.accent} />
                  <Text style={{ color: theme.colors.text, fontFamily: theme.fonts.heading, fontSize: theme.typography.body }}>Compaction engine</Text>
                </View>
                <Badge label="AUTO POLICY" tone="neutral" />
              </View>
              <Text style={{ color: theme.colors.textMuted, fontFamily: theme.fonts.mono, fontSize: theme.typography.meta, lineHeight: 15 }}>
                Trigger {policy.triggerPercent}% · target {policy.targetPercent}% · hard stop {policy.hardStopPercent}%
              </Text>
              <ControlRow label={'Auto-compact ' + (compacting ? 'running' : autoCompact ? 'on' : 'off')}>
                <Switch
                  accessibilityLabel="Auto-compact"
                  accessibilityHint="Automatically summarize when context reaches the configured trigger"
                  value={autoCompact}
                  disabled={compacting}
                  trackColor={{ false: theme.colors.border, true: theme.colors.secondary }}
                  thumbColor={theme.colors.text}
                  onValueChange={onToggleAutoCompact}
                />
              </ControlRow>
              {canCompact && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Compact now"
                  accessibilityState={{ busy: compacting, disabled: compacting }}
                  disabled={compacting}
                  onPress={onCompact}
                  style={({ pressed }) => ({
                    minHeight: 44,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    borderRadius: theme.radius.control,
                    backgroundColor: theme.colors.accent,
                    opacity: compacting ? 0.5 : pressed ? 0.75 : 1,
                  })}>
                  {compacting ? <SymbolView name={{ ios: 'arrow.triangle.2.circlepath', android: 'sync' }} size={16} tintColor={theme.colors.accentText} /> : <SymbolView name={{ ios: 'bolt.fill', android: 'bolt' }} size={16} tintColor={theme.colors.accentText} />}
                  <Text style={{ color: theme.colors.accentText, fontFamily: theme.fonts.monoMedium, fontSize: theme.typography.meta }}>
                    {compacting ? 'COMPACTING' : 'COMPACT NOW'}
                  </Text>
                </Pressable>
              )}
              <Text style={{ color: theme.colors.textMuted, fontFamily: theme.fonts.mono, fontSize: theme.typography.meta, lineHeight: 15 }}>
                Compaction preserves the original transcript and stores a local summary for future requests.
              </Text>
            </View>

            <View style={{ gap: 4 }}>
              <ControlRow label="Auto-approve read-only tools">
                <Switch
                  accessibilityLabel="Auto-approve read-only tools"
                  accessibilityHint="Skip approval for read-only tools. Write and dangerous tools still require approval."
                  value={autoApproveTools}
                  trackColor={{ false: theme.colors.border, true: theme.colors.secondary }}
                  thumbColor={theme.colors.text}
                  onValueChange={onToggleAutoApproveTools}
                />
              </ControlRow>
              <Text style={{ color: theme.colors.textMuted, fontFamily: theme.fonts.mono, fontSize: theme.typography.meta, lineHeight: 14 }}>
                Write and dangerous tools always require approval.
              </Text>
            </View>

            {budget.usedPercent !== null && budget.usedPercent >= policy.hardStopPercent && (
              <Text accessibilityRole="alert" style={{ color: theme.colors.danger, fontFamily: theme.fonts.mono, fontSize: theme.typography.meta }}>
                Context limit reached. Compact, start a new chat, or reduce output reserve.
              </Text>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

function ContextGauge({ budget, fillColor }: { budget: ContextBudgetResult; fillColor: string }) {
  const percent = budget.usedPercent === null ? 0 : Math.min(100, Math.max(0, budget.usedPercent));
  return (
    <View style={{ gap: 8, borderRadius: theme.radius.card, backgroundColor: theme.colors.surface, padding: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
        <View>
          <Text style={{ color: theme.colors.textMuted, fontFamily: theme.fonts.monoMedium, fontSize: theme.typography.meta }}>ACTIVE CONTEXT GAUGE</Text>
          <Text style={{ color: theme.colors.text, fontFamily: theme.fonts.heading, fontSize: 22 }}>
            {formatCount(budget.inputTokensEstimate)}
            <Text style={{ color: theme.colors.textMuted, fontFamily: theme.fonts.mono, fontSize: theme.typography.meta }}>
              {' / ' + (budget.contextWindow === null ? 'unknown' : formatCount(budget.contextWindow)) + ' tok'}
            </Text>
          </Text>
        </View>
        <Badge label={budget.quality.toUpperCase()} tone={budget.quality === 'estimated' ? 'accent' : 'warning'} />
      </View>
      <View style={{ height: 10, flexDirection: 'row', gap: 2, borderRadius: 5, backgroundColor: theme.colors.canvas, padding: 2 }}>
        <View style={{ flex: percent, height: 6, borderRadius: 3, backgroundColor: fillColor }} />
        <View style={{ flex: 100 - percent }} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
        <Metric label="Headroom" value={budget.remainingTokens === null ? 'unavailable' : formatCount(budget.remainingTokens) + ' tok'} tone="neutral" />
        <Metric label="Output reserve" value={formatCount(budget.requestedOutputReserve) + ' tok'} tone="secondary" />
        <Metric label="Safety margin" value={budget.safetyMargin === null ? 'unavailable' : formatCount(budget.safetyMargin) + ' tok'} tone="warning" />
      </View>
      {budget.contextWindow !== null && (
        <Text style={{ color: theme.colors.textMuted, fontFamily: theme.fonts.mono, fontSize: theme.typography.meta }}>
          Context {formatCount(budget.contextWindow)} · Input ~{formatCount(budget.inputTokensEstimate)} tokens · Left {budget.remainingPercent === null ? 'unavailable' : budget.remainingPercent.toFixed(1) + '%'}
        </Text>
      )}
      {budget.calibrationInputTokens !== null && budget.calibrationDeltaTokens !== null && (
        <Text style={{ color: theme.colors.textMuted, fontFamily: theme.fonts.mono, fontSize: theme.typography.meta }}>
          Provider input {formatCount(budget.calibrationInputTokens)} · estimator delta {budget.calibrationDeltaTokens >= 0 ? '+' : '-'}{formatCount(Math.abs(budget.calibrationDeltaTokens))}
        </Text>
      )}
    </View>
  );
}

function RequestMetrics({ metrics, cacheHitPercent }: { metrics: TurnMetrics | null; cacheHitPercent: number | null }) {
  if (metrics === null) {
    return (
      <View style={{ gap: 4 }}>
        <Text style={{ color: theme.colors.textMuted, fontFamily: theme.fonts.monoMedium, fontSize: theme.typography.meta }}>REQUEST STATISTICS</Text>
        <Text style={{ color: theme.colors.textMuted, fontFamily: theme.fonts.mono, fontSize: theme.typography.meta }}>Cache hit {formatPercent(cacheHitPercent)}</Text>
        <Text style={{ color: theme.colors.textMuted, fontFamily: theme.fonts.mono, fontSize: theme.typography.meta }}>No completed request metrics yet.</Text>
      </View>
    );
  }
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Text style={{ color: theme.colors.textMuted, fontFamily: theme.fonts.monoMedium, fontSize: theme.typography.meta }}>REQUEST STATISTICS</Text>
        <Badge label={metrics.usage.quality.toUpperCase()} tone={metrics.usage.quality === 'exact' ? 'accent' : 'warning'} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
        <Metric label="TTFT" value={formatDuration(metrics.ttftMs)} tone="accent" />
        <Metric label="Output rate" value={formatRate(metrics.tokensPerSecond)} tone="secondary" />
        <Metric label="Output" value={formatCount(metrics.usage.outputTokens) + ' tok'} tone="neutral" />
        <Metric label="Cache hit" value={formatPercent(cacheHitPercent)} tone="accent" />
      </View>
    </View>
  );
}

function ControlRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <Text style={{ flex: 1, color: theme.colors.textMuted, fontFamily: theme.fonts.mono, fontSize: theme.typography.meta }}>{label}</Text>
      {children}
    </View>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: 'accent' | 'secondary' | 'warning' | 'neutral' }) {
  const color = tone === 'neutral' ? theme.colors.text : theme.colors[tone];
  return (
    <View style={{ flexGrow: 1, gap: 2, borderRadius: 4, backgroundColor: theme.colors.surfaceHigh, padding: 8 }}>
      <Text style={{ color: theme.colors.textMuted, fontFamily: theme.fonts.monoMedium, fontSize: 9 }}>{label.toUpperCase()}</Text>
      <Text style={{ color, fontFamily: theme.fonts.monoMedium, fontSize: theme.typography.meta }}>{value}</Text>
    </View>
  );
}

function Badge({ label, tone }: { label: string; tone: 'accent' | 'warning' | 'neutral' }) {
  const color = tone === 'accent' ? theme.colors.accent : tone === 'warning' ? theme.colors.warning : theme.colors.textMuted;
  return (
    <Text style={{ color, backgroundColor: theme.colors.surfaceHigh, fontFamily: theme.fonts.monoMedium, fontSize: 9, paddingHorizontal: 6, paddingVertical: 4, borderRadius: 4 }}>
      {label}
    </Text>
  );
}

function contextColor(percent: number | null): string {
  if (percent !== null && percent >= 95) return theme.colors.danger;
  if (percent !== null && percent >= 80) return theme.colors.warning;
  return theme.colors.accent;
}
