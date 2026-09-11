import React, { useEffect, useRef } from 'react';
import { Animated, AppState, Easing, Platform, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { purple } from './data';
import { useTheme } from './ui';
import { useReducedMotion } from './use-reduced-motion';

export function ReadingGoalIcon({ progress }: { progress: number }) {
  const t = useTheme();
  const reduced = useReducedMotion();
  const focused = useIsFocused();
  const float = useRef(new Animated.Value(0)).current;
  const value = Math.min(1, Math.max(0, progress || 0));
  useEffect(() => {
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(float, { toValue: -3, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== 'web', isInteraction: false }),
      Animated.timing(float, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== 'web', isInteraction: false }),
    ]));
    const update = () => {
      animation.stop(); animation.reset(); float.setValue(0);
      if (!reduced && focused && AppState.currentState === 'active') animation.start();
    };
    update();
    const subscription = AppState.addEventListener('change', update);
    return () => { subscription.remove(); animation.stop(); };
  }, [float, reduced, focused]);
  return <View accessible accessibilityLabel={`Daily reading goal ${Math.round(value * 100)} percent complete`} style={{ width: 88, height: 88, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
    <View style={{ position: 'absolute', width: 68, height: 68, borderRadius: 34, backgroundColor: t.dark ? '#6952FF24' : '#6952FF0D' }} />
    <Svg width={88} height={88} style={{ position: 'absolute' }}>
      <Circle cx={44} cy={44} r={39} stroke={t.dark ? '#454052' : '#EDE9FA'} strokeWidth={3} fill="none" />
      <Circle cx={44} cy={44} r={39} stroke={purple} strokeWidth={3} fill="none" strokeLinecap="round" strokeDasharray={`${2 * Math.PI * 39}`} strokeDashoffset={2 * Math.PI * 39 * (1 - value)} transform="rotate(-90 44 44)" />
    </Svg>
    <Animated.View style={{ transform: [{ translateY: float }] }}><Ionicons name="book-outline" size={32} color={t.dark ? '#B8AAFF' : purple} /></Animated.View>
    {value === 1 && <View style={{ position: 'absolute', right: 1, bottom: 3, backgroundColor: purple, borderRadius: 12, padding: 3, borderWidth: 2, borderColor: t.card }}><Ionicons name="checkmark" size={14} color="white" /></View>}
  </View>;
}
