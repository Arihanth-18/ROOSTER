import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, LinearGradient, RadialGradient, Stop } from 'react-native-svg';
import { useApp } from '../app/AppContext';
import type { AssistantState } from '../assistant/AssistantProvider';

type Props = {
  state: AssistantState;
  size?: number;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** Show the small microphone badge so it reads as the "tap to speak" control. */
  micBadge?: boolean;
};

const loop = (anim: Animated.CompositeAnimation) => Animated.loop(anim);

/**
 * ROOSTER's face: an iridescent bubble that breathes and blinks when idle, glows while listening,
 * glances around while thinking and talks while speaking. Holds still when "Reduce movement" is on.
 */
export function RoosterAvatar({ state, size = 220, onPress, accessibilityLabel, accessibilityHint, micBadge }: Props) {
  const { prefs, theme } = useApp();
  const still = prefs.reducedMotion;

  const breathe = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const look = useRef(new Animated.Value(0)).current;
  const mouth = useRef(new Animated.Value(1)).current;
  const bounce = useRef(new Animated.Value(0)).current;

  // Breathing — always on (gentle) unless reduced motion.
  useEffect(() => {
    if (still) return;
    const a = loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    a.start();
    return () => a.stop();
  }, [still, breathe]);

  // Blinking at slightly irregular intervals.
  useEffect(() => {
    if (still) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const doBlink = () => {
      if (!alive) return;
      Animated.sequence([
        Animated.timing(blink, { toValue: 0.08, duration: 70, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 110, useNativeDriver: true }),
      ]).start();
      timer = setTimeout(doBlink, 2600 + Math.random() * 2600);
    };
    timer = setTimeout(doBlink, 1500);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [still, blink]);

  // State-driven animations.
  useEffect(() => {
    const running: Animated.CompositeAnimation[] = [];
    glow.setValue(0);
    look.setValue(0);
    mouth.setValue(1);
    if (!still) {
      if (state === 'listening') {
        running.push(
          loop(
            Animated.sequence([
              Animated.timing(glow, { toValue: 1, duration: 650, easing: Easing.out(Easing.quad), useNativeDriver: true }),
              Animated.timing(glow, { toValue: 0.25, duration: 650, easing: Easing.in(Easing.quad), useNativeDriver: true }),
            ]),
          ),
        );
      } else if (state === 'thinking') {
        running.push(
          loop(
            Animated.sequence([
              Animated.timing(look, { toValue: -1, duration: 450, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
              Animated.timing(look, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
              Animated.timing(look, { toValue: 0, duration: 450, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
            ]),
          ),
        );
      } else if (state === 'speaking') {
        running.push(
          loop(
            Animated.sequence([
              Animated.timing(mouth, { toValue: 1.55, duration: 140, useNativeDriver: true }),
              Animated.timing(mouth, { toValue: 0.7, duration: 120, useNativeDriver: true }),
              Animated.timing(mouth, { toValue: 1.3, duration: 160, useNativeDriver: true }),
              Animated.timing(mouth, { toValue: 0.85, duration: 130, useNativeDriver: true }),
            ]),
          ),
        );
      } else if (state === 'done') {
        bounce.setValue(0);
        running.push(
          Animated.sequence([
            Animated.timing(bounce, { toValue: 1, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            Animated.spring(bounce, { toValue: 0, friction: 4, useNativeDriver: true }),
          ]),
        );
      }
    } else if (state === 'listening') {
      glow.setValue(0.8);
    }
    running.forEach(a => a.start());
    return () => running.forEach(a => a.stop());
  }, [state, still, glow, look, mouth, bounce]);

  const s = size;
  const scale = Animated.add(
    breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.035] }),
    bounce.interpolate({ inputRange: [0, 1], outputRange: [0, 0.08] }),
  );
  const eyeShift = look.interpolate({ inputRange: [-1, 1], outputRange: [-s * 0.05, s * 0.05] });
  const glowScale = glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const listening = state === 'listening';
  const sad = state === 'error';
  const eyeH = s * (listening ? 0.2 : 0.17);
  const eyeW = s * 0.125;

  const eye = (left: number) => (
    <Animated.View
      style={{
        position: 'absolute',
        left,
        top: s * 0.36,
        width: eyeW,
        height: eyeH,
        borderRadius: eyeW,
        backgroundColor: '#14121F',
        transform: [{ translateX: eyeShift }, { scaleY: blink }],
        overflow: 'hidden',
      }}
    >
      {/* Glints */}
      <View style={{ position: 'absolute', top: eyeH * 0.14, left: eyeW * 0.18, width: eyeW * 0.42, height: eyeW * 0.42, borderRadius: eyeW, backgroundColor: '#FFFFFF' }} />
      <View style={{ position: 'absolute', bottom: eyeH * 0.18, right: eyeW * 0.2, width: eyeW * 0.18, height: eyeW * 0.18, borderRadius: eyeW, backgroundColor: 'rgba(255,255,255,0.8)' }} />
    </Animated.View>
  );

  const mouthW = s * 0.2;
  const mouthH = s * 0.1;

  const face = (
    <Animated.View style={{ width: s, height: s, transform: [{ scale }] }}>
      <Svg width={s} height={s} viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id="iris" x1="0.1" y1="0.9" x2="0.95" y2="0.15">
            <Stop offset="0" stopColor="#7DD3FC" />
            <Stop offset="0.35" stopColor="#9BE3F7" />
            <Stop offset="0.6" stopColor="#8FE6C6" />
            <Stop offset="1" stopColor="#5FD3A0" />
          </LinearGradient>
          <RadialGradient id="shine" cx="0.32" cy="0.26" r="0.42">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.95" />
            <Stop offset="0.45" stopColor="#FFFFFF" stopOpacity="0.25" />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="rim" cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0.82" stopColor="#FFFFFF" stopOpacity="0" />
            <Stop offset="1" stopColor="#0B3A5C" stopOpacity="0.3" />
          </RadialGradient>
          <RadialGradient id="blush" cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0" stopColor="#FF6FAE" stopOpacity="0.55" />
            <Stop offset="1" stopColor="#FF6FAE" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Circle cx="50" cy="50" r="48" fill="url(#iris)" />
        <Circle cx="50" cy="50" r="48" fill="url(#rim)" />
        <Ellipse cx="36" cy="28" rx="24" ry="18" fill="url(#shine)" />
        <Ellipse cx="22" cy="60" rx="9" ry="6" fill="url(#blush)" />
        <Ellipse cx="78" cy="60" rx="9" ry="6" fill="url(#blush)" />
      </Svg>
      {eye(s * 0.29)}
      {eye(s * 0.585)}
      {/* Mouth: open smile with a tongue; flips to a frown on error */}
      <Animated.View
        style={{
          position: 'absolute',
          left: (s - mouthW) / 2,
          top: s * 0.6,
          width: mouthW,
          height: mouthH,
          backgroundColor: '#2A1530',
          borderBottomLeftRadius: mouthW,
          borderBottomRightRadius: mouthW,
          borderTopLeftRadius: mouthW * 0.12,
          borderTopRightRadius: mouthW * 0.12,
          overflow: 'hidden',
          transform: [{ scaleY: mouth }, { rotate: sad ? '180deg' : '0deg' }],
        }}
      >
        <View style={{ position: 'absolute', bottom: -mouthH * 0.2, left: mouthW * 0.25, width: mouthW * 0.5, height: mouthH * 0.6, borderRadius: mouthW, backgroundColor: '#FF6F91' }} />
      </Animated.View>
    </Animated.View>
  );

  const content = (
    <View style={{ width: s * 1.25, height: s * 1.25, alignItems: 'center', justifyContent: 'center' }}>
      {/* Listening glow */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: s * 1.12,
          height: s * 1.12,
          borderRadius: s,
          backgroundColor: '#7EE0B5',
          opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.45] }),
          transform: [{ scale: glowScale }],
        }}
      />
      {face}
      {micBadge ? (
        <View
          style={{
            position: 'absolute',
            right: s * 0.12,
            bottom: s * 0.12,
            width: s * 0.26,
            height: s * 0.26,
            borderRadius: s,
            backgroundColor: listening ? theme.colors.danger : theme.colors.primary,
            borderWidth: 3,
            borderColor: '#FFFFFF',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: s * 0.12 }}>{listening ? '■' : '🎤'}</Text>
        </View>
      ) : null}
    </View>
  );

  if (!onPress) {
    return (
      <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel ?? 'ROOSTER'}>
        {content}
      </View>
    );
  }
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityHint={accessibilityHint} hitSlop={12}>
      {content}
    </Pressable>
  );
}
