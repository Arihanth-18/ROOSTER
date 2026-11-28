import React from 'react';
import { Pressable, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useApp } from '../app/AppContext';

/** Soft shadow for white cards on the light-blue page. */
export const cardShadow = {
  elevation: 3,
  shadowColor: '#0B3A5C',
  shadowOpacity: 0.12,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
} as const;

export function Card({ children, accent }: { children: React.ReactNode; accent?: 'danger' | 'warning' }) {
  const { theme } = useApp();
  const c = theme.colors;
  return (
    <View
      style={[
        {
          backgroundColor: accent === 'warning' ? c.warningBg : c.surface,
          borderRadius: theme.radius,
          borderWidth: accent ? 2 : c.shadow ? 0 : c.borderWidth,
          borderColor: accent === 'danger' ? c.danger : accent === 'warning' ? c.warning : c.border,
          padding: theme.space(2.25),
          gap: theme.space(1.5),
        },
        c.shadow ? cardShadow : null,
      ]}
    >
      {children}
    </View>
  );
}

export function Body({ children, muted, center, bold }: { children: React.ReactNode; muted?: boolean; center?: boolean; bold?: boolean }) {
  const { theme } = useApp();
  return (
    <Text
      style={{
        fontSize: theme.font.body,
        lineHeight: Math.round(theme.font.body * 1.4),
        color: muted ? theme.colors.textMuted : theme.colors.text,
        textAlign: center ? 'center' : 'left',
        fontWeight: bold ? theme.bold : '400',
      }}
    >
      {children}
    </Text>
  );
}

export function Heading({ children }: { children: React.ReactNode }) {
  const { theme } = useApp();
  return (
    <Text accessibilityRole="header" style={{ fontSize: theme.font.heading, fontWeight: theme.bold, color: theme.colors.text }}>
      {children}
    </Text>
  );
}

/** Large on/off switch row. The whole row is the touch target. */
export function ToggleRow({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  const { theme, haptic } = useApp();
  const c = theme.colors;
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      accessibilityHint={hint}
      onPress={() => {
        haptic();
        onChange(!value);
      }}
      style={{
        minHeight: theme.touch,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space(2),
        paddingVertical: theme.space(1),
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: theme.font.body, color: c.text, fontWeight: '600' }}>{label}</Text>
        {hint ? <Text style={{ fontSize: theme.font.small, color: c.textMuted, marginTop: 2 }}>{hint}</Text> : null}
      </View>
      <View
        style={{
          width: 64,
          height: 36,
          borderRadius: 18,
          backgroundColor: value ? c.primary : c.background,
          borderWidth: 2,
          borderColor: value ? c.primary : c.textMuted,
          padding: 3,
          alignItems: value ? 'flex-end' : 'flex-start',
        }}
      >
        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: value ? c.onPrimary : c.textMuted }} />
      </View>
      <Text style={{ fontSize: theme.font.small, color: c.text, fontWeight: theme.bold, minWidth: 36 }} importantForAccessibility="no">
        {value ? 'ON' : 'OFF'}
      </Text>
    </Pressable>
  );
}

/** Set of large radio-style options, one per row. */
export function OptionGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  const { theme, haptic } = useApp();
  const c = theme.colors;
  // Long labels (or large text) get one full-width row each, so words never break mid-word.
  const longest = Math.max(...options.map(o => o.label.length));
  // Rough fit check: would the longest word fit in an equal share of the row at this text size?
  const fits = longest * theme.font.body * 0.62 + 40 < 340 / options.length;
  const stacked = !fits || longest > 14 || theme.font.body > 24;
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ gap: theme.space(1) }}>
      {label ? <Text style={{ fontSize: theme.font.body, fontWeight: theme.bold, color: c.text }}>{label}</Text> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(1) }}>
        {options.map(o => {
          const selected = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={o.label}
              onPress={() => {
                haptic();
                onChange(o.value);
              }}
              style={{
                minHeight: theme.touch,
                flexGrow: 1,
                flexBasis: stacked ? '100%' : '30%',
                borderRadius: theme.radius,
                borderWidth: selected ? 3 : Math.max(1, c.borderWidth),
                borderColor: selected ? c.primary : c.border,
                backgroundColor: selected ? c.primary : c.background,
                justifyContent: 'center',
                paddingHorizontal: theme.space(1.5),
                paddingVertical: theme.space(1),
              }}
            >
              <Text style={{ textAlign: 'center', fontSize: theme.font.body, fontWeight: theme.bold, color: selected ? c.onPrimary : c.text }}>
                {selected ? '✓ ' : ''}
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** − value + stepper with large buttons, for speech speed / volume. */
export function Stepper({
  label,
  value,
  min,
  max,
  step,
  format,
  lowerLabel,
  higherLabel,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  lowerLabel: string;
  higherLabel: string;
  onChange: (v: number) => void;
}) {
  const { theme, haptic } = useApp();
  const c = theme.colors;
  const set = (v: number) => {
    haptic();
    onChange(Math.round(Math.min(max, Math.max(min, v)) * 100) / 100);
  };
  const btn = (text: string, a11y: string, onPress: () => void, disabled: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${a11y}, ${label}`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        width: theme.touch,
        height: theme.touch,
        borderRadius: theme.radius,
        backgroundColor: c.primary,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Text style={{ color: c.onPrimary, fontSize: theme.font.title, fontWeight: theme.bold }}>{text}</Text>
    </Pressable>
  );
  return (
    <View
      accessible={false}
      style={{ gap: theme.space(1) }}
    >
      <Text style={{ fontSize: theme.font.body, fontWeight: theme.bold, color: c.text }}>{label}</Text>
      <View
        style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space(1.5) }}
        accessibilityRole="adjustable"
        accessibilityValue={{ text: format(value) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={e => set(value + (e.nativeEvent.actionName === 'increment' ? step : -step))}
      >
        {btn('−', lowerLabel, () => set(value - step), value <= min)}
        <Text style={{ flex: 1, textAlign: 'center', fontSize: theme.font.heading, fontWeight: theme.bold, color: c.text }}>{format(value)}</Text>
        {btn('+', higherLabel, () => set(value + step), value >= max)}
      </View>
    </View>
  );
}

export function Field(props: TextInputProps & { label: string }) {
  const { theme } = useApp();
  const c = theme.colors;
  const { label, style, ...rest } = props;
  return (
    <View style={{ gap: theme.space(0.75) }}>
      <Text style={{ fontSize: theme.font.body, fontWeight: theme.bold, color: c.text }}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={c.textMuted}
        style={[
          {
            minHeight: theme.touch,
            borderWidth: Math.max(2, c.borderWidth),
            borderColor: c.border,
            borderRadius: theme.radius,
            paddingHorizontal: theme.space(2),
            fontSize: theme.font.body,
            color: c.text,
            backgroundColor: c.background,
          },
          style,
        ]}
        {...rest}
      />
    </View>
  );
}

/** Visible warning with a fix action (e.g. exact alarms off). */
export function Banner({ text, actionLabel, onAction }: { text: string; actionLabel?: string; onAction?: () => void }) {
  const { theme } = useApp();
  const c = theme.colors;
  return (
    <View
      accessibilityRole="alert"
      style={{ backgroundColor: c.warningBg, borderColor: c.warning, borderWidth: 2, borderRadius: theme.radius, padding: theme.space(1.5), gap: theme.space(1) }}
    >
      <Text style={{ color: c.text, fontSize: theme.font.small + 1, lineHeight: (theme.font.small + 1) * 1.4 }}>⚠ {text}</Text>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          style={{ alignSelf: 'flex-start', minHeight: 48, justifyContent: 'center', paddingHorizontal: theme.space(2), borderRadius: theme.radius, backgroundColor: c.primary }}
        >
          <Text style={{ color: c.onPrimary, fontWeight: theme.bold, fontSize: theme.font.small + 1 }}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
