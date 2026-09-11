import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Glass, useTheme } from './ui';
import { useReducedMotion } from './use-reduced-motion';

export function LiquidTabBar({ state, navigation }: BottomTabBarProps) {
  const { dark } = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const [dragging, setDragging] = useState(false);
  const slide = useRef(new Animated.Value(0)).current;
  const cell = Math.max(1, (width - 12) / 3);
  const active = Math.min(state.index, 2);
  const ink = dark ? '#FFFFFF' : '#342F40';
  const snap = (index: number) => {
    slide.stopAnimation();
    Animated.spring(slide, { toValue: index * cell, stiffness: 270, damping: 27, mass: .8, useNativeDriver: Platform.OS !== 'web', ...(reduced ? { overshootClamping: true } : {}) }).start();
    if (reduced) { slide.stopAnimation(); slide.setValue(index * cell); }
  };
  useEffect(() => { snap(active); }, [active, cell, reduced]);
  const navigate = (index: number) => {
    const route = state.routes[index];
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!event.defaultPrevented) navigation.navigate(route.name, route.params);
    else snap(active);
  };
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, gesture) => Math.abs(gesture.dx) > 6 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.3,
    onPanResponderGrant: () => { slide.stopAnimation(); setDragging(true); },
    onPanResponderMove: (_, gesture) => slide.setValue(Math.min(2 * cell, Math.max(0, active * cell + gesture.dx))),
    onPanResponderRelease: (_, gesture) => {
      const next = Math.min(2, Math.max(0, Math.round(active + gesture.dx / cell)));
      setDragging(false); snap(next); navigate(next);
    },
    onPanResponderTerminate: () => { setDragging(false); snap(active); },
    onPanResponderTerminationRequest: () => true,
  }), [active, cell, state, reduced]);
  const surface = { backgroundColor: dark ? '#303033A8' : '#FFFFFFB8', borderColor: dark ? '#FFFFFF30' : '#FFFFFFE6' };
  return <View pointerEvents="box-none" style={[styles.position, { bottom: Math.max(insets.bottom, 14) }]}>
    <View style={styles.dock}>
      <View testID="swipe-tab-bar" onLayout={event => setWidth(event.nativeEvent.layout.width)} {...pan.panHandlers} style={[styles.capsule, Platform.OS === 'web' && { touchAction: 'pan-y', userSelect: 'none' } as any]}>
        <Glass style={[StyleSheet.absoluteFill, styles.glass, surface]} />
        {width > 0 && state.index !== 3 && <Animated.View pointerEvents="none" style={[styles.lens, { width: cell, transform: [{ translateX: slide }, { scale: dragging && !reduced ? 1.055 : 1 }] }]}>
          <LinearGradient colors={dark ? ['#DDF9FFAA', '#FFFFFF18', '#C2ACFF75', '#DFFFFFC0'] : ['#FFFFFF', '#B4CEEA77', '#CFC1EB77', '#FFFFFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.rim}>
            <Glass style={[styles.lensInner, { backgroundColor: dark ? '#77777B45' : '#FFFFFF65', borderWidth: 0 }]}>
              <LinearGradient pointerEvents="none" colors={['#FFFFFF30', '#FFFFFF00', '#FFFFFF12']} style={StyleSheet.absoluteFill} />
            </Glass>
          </LinearGradient>
        </Animated.View>}
        {state.routes.slice(0, 3).map((route, index) => <Pressable key={route.key} accessibilityRole="tab" accessibilityLabel={`${route.name} tab`} accessibilityHint="Swipe left or right across the bar to switch tabs" accessibilityState={{ selected: state.index === index }} onPress={() => navigate(index)} onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })} style={({ pressed }) => [styles.tab, { opacity: pressed && !dragging ? .65 : 1 }]}>
          <Ionicons name={(['home', 'library', 'bag'] as const)[index]} size={25} color={ink} />
          <Text numberOfLines={1} style={[styles.label, { color: ink }]}>{index === 2 ? 'Book Store' : route.name}</Text>
        </Pressable>)}
      </View>
      <Pressable accessibilityRole="tab" accessibilityLabel="Search tab" accessibilityState={{ selected: state.index === 3 }} onPress={() => navigate(3)} onLongPress={() => navigation.emit({ type: 'tabLongPress', target: state.routes[3].key })} style={({ pressed }) => [styles.search, { opacity: pressed ? .7 : 1 }]}>
        <Glass style={[StyleSheet.absoluteFill, styles.glass, surface, state.index === 3 && { borderColor: dark ? '#DFD5FFB0' : '#9A85DD', backgroundColor: dark ? '#655581A8' : '#E9E0FAB8' }]} />
        <Ionicons name="search-outline" size={29} color={ink} />
      </Pressable>
    </View>
  </View>;
}
const styles = StyleSheet.create({
  position: { position: 'absolute', left: 12, right: 12, alignItems: 'center' },
  dock: { width: '100%', maxWidth: 560, flexDirection: 'row', alignItems: 'center', gap: 8 },
  capsule: { flex: 1, height: 72, borderRadius: 40, padding: 6, flexDirection: 'row', boxShadow: '0 8px 30px #15112026' },
  glass: { borderRadius: 40, borderWidth: 1, overflow: 'hidden' },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', minWidth: 0, borderRadius: 32 },
  label: { fontSize: 11, fontWeight: '600', marginTop: 3 },
  lens: { position: 'absolute', top: 3, bottom: 3, left: 6, borderRadius: 36, boxShadow: '0 3px 12px #00000020' },
  rim: { flex: 1, padding: 1.3, borderRadius: 36 },
  lensInner: { flex: 1, borderRadius: 35, overflow: 'hidden' },
  search: { width: 64, height: 64, borderRadius: 40, alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 30px #15112026' },
});
