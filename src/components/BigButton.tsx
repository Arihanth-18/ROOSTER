import React from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useApp } from '../app/AppContext';

type Props = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  icon?: string;
  hint?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
  accessibilityLabel?: string;
};

/** Large, rounded, high-contrast button. Minimum height follows the touch-target preference. */
export function BigButton({ label, onPress, variant = 'primary', icon, hint, disabled, style, compact, accessibilityLabel }: Props) {
  const { theme, haptic } = useApp();
  const c = theme.colors;
  const bg = { primary: c.primary, secondary: c.surface, danger: c.danger, ghost: 'transparent' }[variant];
  const fg = { primary: c.onPrimary, secondary: c.primary, danger: c.onDanger, ghost: c.primary }[variant];
  const border = variant === 'secondary' || variant === 'ghost' ? c.primary : bg;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={() => {
        haptic();
        onPress();
      }}
      style={({ pressed }) => [
        {
          minHeight: compact ? Math.max(48, theme.touch - 8) : theme.touch,
          borderRadius: theme.radius,
          backgroundColor: pressed && variant === 'primary' ? c.primaryPressed : bg,
          borderWidth: Math.max(2, c.borderWidth),
          borderColor: border,
          paddingHorizontal: theme.space(2.5),
          paddingVertical: theme.space(1.25),
          justifyContent: 'center',
          opacity: disabled ? 0.45 : pressed && variant !== 'primary' ? 0.75 : 1,
        },
        style,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.space(1) }}>
        {icon ? (
          <Text style={{ fontSize: theme.font.button + 2, color: fg }} importantForAccessibility="no" accessibilityElementsHidden>
            {icon}
          </Text>
        ) : null}
        <Text style={{ color: fg, fontSize: compact ? theme.font.body : theme.font.button, fontWeight: theme.bold, textAlign: 'center', flexShrink: 1 }}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
