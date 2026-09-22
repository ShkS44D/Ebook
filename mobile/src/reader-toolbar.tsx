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
    {!!notice && <Glass dark={dark} style={[styles.pill,{backgroundColor:dark?'#39352FEB':'#EFE4CEEB',padding:12}]}><Text accessibilityLiveRegion="polite" style={{color:dark?'#F1E7D4':'#241B0D',fontSize:13}}>{notice}</Text></Glass>}
    {primary.slice(0,3).map(action=><Glass key={action.label} dark={dark} style={[styles.pill,{backgroundColor:action.selected?(dark?'#EAE0CE':'#231904'):(dark?'#39352FEB':'#EFE4CEC9')}]}>
      <Pressable accessibilityRole="button" accessibilityLabel={action.label} accessibilityState={{selected:!!action.selected}} onPress={action.onPress}
        style={({pressed})=>[styles.menuRow,{opacity:pressed?.65:1}]}>
        <Text style={{fontSize:16,color:action.selected?(dark?'#241B0D':'#FFF6E6'):(dark?'#F1E7D4':'#241B0D')}}>{action.selected?action.title:action.label}</Text>
        <Ionicons name={action.icon} size={23} color={action.selected?(dark?'#241B0D':'#FFF6E6'):(dark?'#F1E7D4':'#241B0D')}/>
      </Pressable>
    </Glass>)}
    <View style={styles.row}>{[...actions,...primary.slice(3)].map(action=><Glass key={action.label} dark={dark} style={[styles.circle,{backgroundColor:dark?'#39352FEB':'#EFE4CEC9'}]}>
      <Pressable accessibilityRole="button" accessibilityLabel={action.label} accessibilityState={{selected:!!action.selected}} onPress={action.onPress} style={({pressed})=>[styles.action,{opacity:pressed?.6:1}]}>
        <Ionicons name={action.icon} size={23} color={dark?'#F1E7D4':'#241B0D'}/>
      </Pressable>
    </Glass>)}</View>
  </Animated.View>;
}
const styles = StyleSheet.create({
  position: { position: 'absolute', right:20, width:270, maxWidth:'90%', gap:5 },
  pill:{borderRadius:28,overflow:'hidden',boxShadow:'0 8px 28px #241B1012'},
  menuRow:{minHeight:46,paddingHorizontal:16,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  circle:{borderRadius:25,overflow:'hidden',flex:1},
  action:{height:46,alignItems:'center',justifyContent:'center'},
  glass: { borderRadius: 28, borderWidth: 1, padding: 7, overflow: 'hidden' },
  row: { flexDirection: 'row', gap: 4 },
  item: { minHeight: 46, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: 19 },
  divider: { height: 1, marginHorizontal: 12, marginVertical: 5 },
});
