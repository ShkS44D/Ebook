import React, { useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { defaults, ReaderSettings, ReaderTheme, themes } from './reader-model';

export const fonts = {
  serif: Platform.OS === 'ios' ? 'Georgia' : Platform.OS === 'android' ? 'serif' : 'Georgia',
  sans: Platform.OS === 'ios' ? 'Helvetica' : Platform.OS === 'android' ? 'sans-serif' : 'Arial',
  mono: Platform.OS === 'ios' ? 'Menlo' : Platform.OS === 'android' ? 'monospace' : 'monospace',
};
export function RoundButton({ name, label, onPress, selected = false, disabled = false, color = '#24211D' }: any) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected, disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.round, { backgroundColor: selected ? '#302719' : '#FFFFFF70', opacity: disabled ? 0.3 : pressed ? 0.6 : 1 }]}>
    <Ionicons name={name} size={25} color={selected ? '#FFF7E7' : color} />
  </Pressable>;
}
export function ReaderSheet({ visible, title, onClose, children, compact = false, background = '#FAFAF8', trailing }: any) {
  const insets = useSafeAreaInsets();
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.backdrop}>
      <Pressable accessibilityLabel="Dismiss panel" onPress={onClose} style={StyleSheet.absoluteFill} />
      <View accessibilityViewIsModal style={[styles.sheet, { backgroundColor: background, paddingBottom: Math.max(insets.bottom, 18), marginTop: Math.max(insets.top, 16), height: compact ? undefined : '92%', maxHeight: '94%' }]}>
        <View style={styles.sheetHeader}><Text accessibilityRole="header" style={styles.heading}>{title}</Text>{trailing}<RoundButton name="close" label={`Close ${title}`} onPress={onClose} /></View>
        {children}
      </View>
    </View>
  </Modal>;
}
export function Range({ label, value, min, max, step = 1, onChange, suffix = '', disabled = false }: any) {
  return <View style={[styles.range, disabled && { opacity: 0.35 }]}>
    <View style={styles.between}><Text style={styles.rangeLabel}>{label}</Text><Text style={styles.value}>{Number(value.toFixed(2))}{suffix}</Text></View>
    {Platform.OS === 'web' ? React.createElement('input', { type: 'range', 'aria-label': label, min, max, step, value, disabled,
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChange(Number(event.target.value)),
      style: { width: '100%', height: 36, margin: 0, accentColor: '#302719', cursor: disabled ? 'default' : 'pointer' },
    }) : <Slider accessibilityLabel={label} style={{ height: 40, width: '100%' }} value={value} minimumValue={min} maximumValue={max} step={step}
      disabled={disabled} minimumTrackTintColor="#302719" maximumTrackTintColor="#D8D6D1" thumbTintColor="#FFFFFF" onValueChange={onChange} />}
  </View>;
}
function Toggle({ label, value, onChange }: any) {
  return <View style={styles.toggle}><Text style={styles.label}>{label}</Text><Switch accessibilityLabel={label} value={value} onValueChange={onChange} trackColor={{ false: '#CECDCE', true: '#31BF64' }} /></View>;
}
export function ThemePanel({ settings, setSettings, preview, onClose, onBrightness, notice, ambientAvailable, busy }: {
  settings: ReaderSettings; setSettings: (s: ReaderSettings) => void; preview: string; onClose: () => void;
  onBrightness: (v: number) => void; notice: string; ambientAvailable: boolean; busy: boolean;
}) {
  const [mode, setMode] = useState<'themes' | 'custom' | 'appearance' | 'font'>('themes');
  const [draft, setDraft] = useState(settings);
  const update = (patch: Partial<ReaderSettings>) => setSettings({ ...settings, ...patch });
  const edit = (patch: Partial<ReaderSettings>) => setDraft({ ...draft, ...patch });
  const custom = mode === 'custom' || mode === 'font';
  const palette = themes[draft.theme];
  return <ReaderSheet visible title={custom ? 'Customise Theme' : 'Themes & Settings'} compact={!custom} onClose={custom ? () => setMode('themes') : onClose}
    background={custom ? '#F2F1F6' : '#F7F5EF'} trailing={custom ? <RoundButton name="checkmark" label="Apply theme customization" selected onPress={() => { setSettings(draft); setMode('themes'); }} /> : undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 10 }}>
      {custom ? <>
        <View style={[styles.preview, { backgroundColor: palette.bg }]}>
          <Text style={{ color: palette.ink, fontFamily: fonts[draft.font], fontSize: 42, fontWeight: draft.bold ? '700' : '400' }}>Aa</Text>
          <Text numberOfLines={4} style={{ color: palette.ink, fontFamily: fonts[draft.font], fontSize: draft.fontSize, fontWeight: draft.bold ? '700' : '400', lineHeight: draft.fontSize * (draft.customize ? draft.lineSpacing : 1.55), letterSpacing: draft.customize ? draft.characterSpacing : 0, paddingHorizontal: draft.customize ? draft.margins : 0, textAlign: draft.customize && draft.justify ? 'justify' : 'left', ...(Platform.OS === 'web' ? { wordSpacing: draft.customize ? draft.wordSpacing : 0 } as any : {}) }}>{Platform.OS !== 'web' && draft.customize ? preview.replace(/ /g, ' ' + '\u200A'.repeat(Math.round(draft.wordSpacing / 2))) : preview}</Text>
        </View>
        <Text style={styles.sectionTitle}>Text</Text>
        <View style={styles.group}>
          <Pressable accessibilityRole="button" accessibilityLabel="Choose font" onPress={() => setMode(mode === 'font' ? 'custom' : 'font')} style={styles.toggle}><Text style={styles.label}>Aa   Font</Text><Text style={styles.value}>{draft.font === 'serif' ? 'Serif' : draft.font === 'sans' ? 'Sans Serif' : 'Monospace'}  ›</Text></Pressable>
          {mode === 'font' && (['serif', 'sans', 'mono'] as const).map(font => <Pressable key={font} accessibilityRole="radio" accessibilityState={{ checked: draft.font === font }} onPress={() => { edit({ font }); setMode('custom'); }} style={styles.toggle}><Text style={[styles.label, { fontFamily: fonts[font] }]}>{font === 'serif' ? 'Serif' : font === 'sans' ? 'Sans Serif' : 'Monospace'}</Text>{font === draft.font && <Ionicons name="checkmark" size={22} />}</Pressable>)}
          <Toggle label="Bold Text" value={draft.bold} onChange={(bold: boolean) => edit({ bold })} />
        </View>
        <Text style={styles.sectionTitle}>Accessibility & Layout Options</Text>
        <View style={styles.group}>
          <Toggle label="Customise layout" value={draft.customize} onChange={(customize: boolean) => edit({ customize })} />
          <Range label="Line spacing" value={draft.lineSpacing} min={1} max={2.5} step={0.05} disabled={!draft.customize} onChange={(lineSpacing: number) => edit({ lineSpacing })} />
          <Range label="Character spacing" value={draft.characterSpacing} min={0} max={3} step={0.1} suffix=" px" disabled={!draft.customize} onChange={(characterSpacing: number) => edit({ characterSpacing })} />
          <Range label="Word spacing" value={draft.wordSpacing} min={0} max={12} suffix=" px" disabled={!draft.customize} onChange={(wordSpacing: number) => edit({ wordSpacing })} />
          <Range label="Margins" value={draft.margins} min={0} max={48} step={2} suffix=" px" disabled={!draft.customize} onChange={(margins: number) => edit({ margins })} />
        </View>
        <View style={[styles.group, { marginTop: 16 }]}><Toggle label="Justify Text" value={draft.justify} onChange={(justify: boolean) => edit({ justify, customize: true })} /></View>
        <Pressable accessibilityRole="button" onPress={() => setDraft({ ...defaults(draft.theme), fontSize: draft.fontSize, appearance: draft.appearance, brightness: draft.brightness, scroll: draft.scroll })} style={styles.pill}><Text style={styles.label}>Reset Theme</Text></Pressable>
      </> : <>
        <View style={[styles.between, { gap: 10 }]}>
          <View style={[styles.segment, { flex: 1 }]}>
            <Pressable accessibilityRole="button" accessibilityLabel="Decrease text size" disabled={settings.fontSize <= 14} onPress={() => update({ fontSize: Math.max(14, settings.fontSize - 2) })} style={styles.segmentButton}><Text style={{ fontSize: 19 }}>A</Text></Pressable>
            <Text style={{ color: '#888' }}>{settings.fontSize}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Increase text size" disabled={settings.fontSize >= 40} onPress={() => update({ fontSize: Math.min(40, settings.fontSize + 2) })} style={styles.segmentButton}><Text style={{ fontSize: 29 }}>A</Text></Pressable>
          </View>
          <RoundButton name={settings.scroll ? 'swap-vertical-outline' : 'book-outline'} label={settings.scroll ? 'Switch to pages' : 'Switch to scrolling'} onPress={() => update({ scroll: !settings.scroll })} />
          <RoundButton name="sunny-outline" label="Appearance options" onPress={() => setMode(mode === 'appearance' ? 'themes' : 'appearance')} />
        </View>
        {mode === 'appearance' && <View style={[styles.group, { marginTop: 10 }]}>{([
          ['light', 'Light', 'sunny-outline'], ['dark', 'Dark', 'moon-outline'], ['device', 'Match Device', 'contrast-outline'], ['surroundings', 'Match Surroundings', 'partly-sunny-outline'],
        ] as const).map(([value, label, icon]) => <Pressable key={value} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked: settings.appearance === value, disabled: value === 'surroundings' && !ambientAvailable }} disabled={value === 'surroundings' && !ambientAvailable} onPress={() => { update({ appearance: value }); setMode('themes'); }} style={[styles.toggle, value === 'surroundings' && !ambientAvailable && { opacity: 0.4 }]}><Ionicons name={icon} size={22} /><Text style={[styles.label, { flex: 1, marginLeft: 14 }]}>{label}</Text>{settings.appearance === value && <Ionicons name="checkmark" size={22} />}</Pressable>)}{!ambientAvailable && <Text style={styles.hint}>Surroundings requires a supported ambient light sensor. Match Device follows your system appearance.</Text>}</View>}
        <Range label={Platform.OS === 'web' ? 'Page brightness' : 'Brightness'} min={0.1} max={1} step={0.05} value={settings.brightness} onChange={(brightness: number) => { update({ brightness }); onBrightness(brightness); }} />
        <View style={styles.themeGrid}>{(Object.keys(themes) as ReaderTheme[]).map(key => <Pressable key={key} accessibilityRole="radio" accessibilityLabel={`${themes[key].name} theme`} accessibilityState={{ checked: settings.theme === key }} onPress={() => setSettings({ ...defaults(key), fontSize: settings.fontSize, brightness: settings.brightness, appearance: settings.appearance, scroll: settings.scroll })}
          style={[styles.theme, { backgroundColor: themes[key].bg, borderColor: settings.theme === key ? '#302719' : '#E6E3DC', borderWidth: settings.theme === key ? 3 : 1 }]}><Text style={{ fontFamily: fonts[themes[key].font], fontSize: 36, color: themes[key].ink, fontWeight: themes[key].bold ? '700' : '400' }}>Aa</Text><Text style={{ color: themes[key].ink, fontSize: 16 }}>{themes[key].name}</Text></Pressable>)}</View>
        <Pressable accessibilityRole="button" accessibilityLabel="Customise" onPress={() => { setDraft(settings); setMode('custom'); }} style={styles.pill}><Ionicons name="options-outline" size={23} /><Text style={styles.label}>Customise</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={busy} onPress={onClose} style={[styles.pill, { backgroundColor: '#302719', marginTop: 0 }]}><Text style={{ fontSize: 17, color: '#FFF6E6', fontWeight: '600' }}>{busy ? 'Saving…' : 'Done'}</Text></Pressable>
      </>}
      {!!notice && <Text accessibilityRole="alert" style={styles.hint}>{notice}</Text>}
    </ScrollView>
  </ReaderSheet>;
}
const styles = StyleSheet.create({
  round: { width: 46, height: 46, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1, backgroundColor: '#211C1760', justifyContent: 'flex-end', alignItems: 'center' },
  sheet: { width: '100%', maxWidth: 620, borderTopLeftRadius: 32, borderTopRightRadius: 32, overflow: 'hidden', borderWidth: 1, borderColor: '#FFFFFF80' },
  sheetHeader: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingVertical: 18, alignItems: 'center' },
  heading: { fontSize: 23, fontWeight: '700', flex: 1, color: '#25221D' },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  range: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 5 },
  rangeLabel: { fontSize: 13, textTransform: 'uppercase', color: '#77746E' },
  value: { fontSize: 15, color: '#77746E' },
  label: { fontSize: 17, color: '#25221D' },
  toggle: { minHeight: 58, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#DEDDD8' },
  group: { borderRadius: 22, backgroundColor: '#FFFFFF', overflow: 'hidden' },
  sectionTitle: { fontSize: 19, fontWeight: '600', marginTop: 24, marginBottom: 12, color: '#25221D' },
  preview: { borderRadius: 18, padding: 22, gap: 12 },
  pill: { minHeight: 48, borderRadius: 28, backgroundColor: '#E7E5DF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 12, marginTop: 16 },
  segment: { borderRadius: 30, flexDirection: 'row', alignItems: 'center', backgroundColor: '#E5E1D8' },
  segmentButton: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  themeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  theme: { width: '31%', flexGrow: 1, minHeight: 105, borderRadius: 24, alignItems: 'center', justifyContent: 'center', gap: 2 },
  hint: { fontSize: 13, color: '#77746E', lineHeight: 19, margin: 12 },
});
