import React, { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Glass } from './ui';
import { useReducedMotion } from './use-reduced-motion';

type Action = { label: string; title?: string; icon: React.ComponentProps<typeof Ionicons>['name']; selected?: boolean; onPress: () => void };
function Item({ action, dark }: { action: Action; dark: boolean }) {
  const [hover, setHover] = useState(false);
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const ink = dark ? '#F0EBFF' : '#383043';
  const animate = (value: number) => Animated.timing(scale, { toValue: value, duration: reduced ? 0 : 130, useNativeDriver: Platform.OS !== 'web' }).start();
  return <Animated.View style={{ flex: 1, transform: [{ scale }] }}>
    <Pressable accessibilityRole="button" accessibilityLabel={action.label} accessibilityState={{ selected: !!action.selected }} onPress={action.onPress} onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)} onPressIn={() => animate(.94)} onPressOut={() => animate(1)} style={[styles.item, { backgroundColor: action.selected ? (dark ? '#B6A2FF30' : '#6952FF16') : hover ? (dark ? '#FFFFFF12' : '#FFFFFF90') : 'transparent' }]}>
      <Ionicons name={action.icon} size={21} color={action.selected ? (dark ? '#C9BBFF' : '#6546CB') : ink} />
      {!!action.title && <Text numberOfLines={1} style={{ fontSize: 10, fontWeight: '600', color: ink, marginTop: 5 }}>{action.title}</Text>}
    </Pressable>
  </Animated.View>;
}
export function ReaderToolbar({ visible, dark, bottom, notice, primary, actions }: { visible: boolean; dark: boolean; bottom: number; notice: string; primary: Action[]; actions: Action[] }) {
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(visible);
  const transition = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) setMounted(true);
    const animation = Animated.timing(transition, { toValue: visible ? 1 : 0, duration: reduced ? 0 : visible ? 220 : 150, useNativeDriver: Platform.OS !== 'web' });
    animation.start(({ finished }) => { if (finished && !visible) setMounted(false); });
    return () => animation.stop();
  }, [visible, reduced, transition]);
  if (!mounted) return null;
  return <Animated.View pointerEvents={visible ? 'auto' : 'none'} accessibilityElementsHidden={!visible} importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'} style={[styles.position, { bottom, opacity: transition, transform: [{ translateY: transition.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}>
    <Glass dark={dark} style={[styles.glass, { backgroundColor: dark ? '#24212BE8' : '#FFFCF1C9', borderColor: dark ? '#FFFFFF24' : '#FFFFFFDB' }]}>
      {!!notice && <Text accessibilityLiveRegion="polite" style={{ color: dark ? '#EEE8FF' : '#514660', fontSize: 12, padding: 10 }}>{notice}</Text>}
      <View style={styles.row}>{primary.map(action => <Item key={action.label} action={action} dark={dark} />)}</View>
      <View style={[styles.divider, { backgroundColor: dark ? '#FFFFFF18' : '#43365412' }]} />
      <View style={styles.row}>{actions.map(action => <Item key={action.label} action={action} dark={dark} />)}</View>
    </Glass>
  </Animated.View>;
}
const styles = StyleSheet.create({
  position: { position: 'absolute', alignSelf: 'center', width: '92%', maxWidth: 360, borderRadius: 28, boxShadow: '0 12px 36px #19112524' },
  glass: { borderRadius: 28, borderWidth: 1, padding: 7, overflow: 'hidden' },
  row: { flexDirection: 'row', gap: 4 },
  item: { minHeight: 46, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: 19 },
  divider: { height: 1, marginHorizontal: 12, marginVertical: 5 },
});
