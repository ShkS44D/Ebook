import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View, useColorScheme, useWindowDimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Brightness from 'expo-brightness';
import * as Orientation from 'expo-screen-orientation';
import * as Clipboard from 'expo-clipboard';
import { LightSensor } from 'expo-sensors';
import { Ionicons } from '@expo/vector-icons';
import { useBook } from './use-book';
import { api, useStore } from './store';
import { Feedback, RequireAccount, useAction } from './functional-ui';
import { PageReels } from './reels';
import { Chapter, Position, normalizeSettings, pageAt, paginate, searchBook, themes } from './reader-model';
import { fonts, ReaderSheet, RoundButton, ThemePanel } from './reader-controls';

export function Reader({ navigation, route }: any) {
  const id = route.params?.bookId || 'reading-guide';
  // A book change remounts the session so offsets, search and drafts cannot leak into another book.
  return <RequireAccount navigation={navigation}><ReaderSession key={id} id={id} navigation={navigation} route={route} /></RequireAccount>;
}
function ReaderSession({ id, navigation, route }: any) {
  const store = useStore(), action = useAction();
  const { book, error } = useBook(id);
  const entry = store.library.find(l => l.book_id === id);
  const cover = store.books.find(b => b.id === id);
  const insets = useSafeAreaInsets(), viewport = useWindowDimensions(), deviceAppearance = useColorScheme();
  const linkedChapter = Number(route.params?.page);
  const linkedOffset = Number(route.params?.offset);
  const [position, setPosition] = useState<Position>(() => ({
    chapter: Number.isInteger(linkedChapter) && linkedChapter >= 0 ? linkedChapter : entry?.page || 0,
    offset: Number.isInteger(linkedChapter) && linkedChapter >= 0 ? Math.max(0, linkedOffset || 0) : entry?.reader_offset || 0,
  }));
  const [settings, setSettings] = useState(() => normalizeSettings(store.user?.reader_settings));
  const [menu, setMenu] = useState(false);
  const [panel, setPanel] = useState<'contents' | 'search' | 'themes' | 'reels' | null>(null);
  const [contentsTab, setContentsTab] = useState<'chapters' | 'bookmarks'>('chapters');
  const [query, setQuery] = useState(''), [highlight, setHighlight] = useState('');
  const [notice, setNotice] = useState('');
  const [locked, setLocked] = useState(false);
  const [ambientAvailable, setAmbientAvailable] = useState(false), [ambientDark, setAmbientDark] = useState(false);
  const readingView = useRef<ScrollView>(null);
  const touchStart = useRef({ x: 0, y: 0 });
  const scrollPositions = useRef<Record<number, number>>({ 0: 0 });
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPosition = useRef<Position | null>(null);
  const progressQueue = useRef<Promise<any>>(Promise.resolve());
  const [jumpVersion, setJumpVersion] = useState(0);
  const scrollTarget = useRef(0);
  const restoreScroll = useRef(true);
  const previousOrientation = useRef<Orientation.OrientationLock | null>(null);
  const originalBrightness = useRef<number | null>(null);
  const current = useRef({ refresh: store.refresh, onError: action.setError });
  current.current = { refresh: store.refresh, onError: action.setError };
  const chapters: Chapter[] = book?.chapters || [];
  const palette = themes[settings.theme];
  const dark = settings.appearance === 'dark' || (settings.appearance === 'device' && deviceAppearance === 'dark') ||
    (settings.appearance === 'surroundings' && (ambientAvailable ? ambientDark : deviceAppearance === 'dark'));
  const bg = dark ? '#22211F' : palette.bg;
  const ink = dark ? '#E6E0D4' : palette.ink;
  const lineSpacing = settings.customize ? settings.lineSpacing : 1.55;
  const sidePadding = 28 + (settings.customize ? settings.margins : 0);
  const contentWidth = Math.max(120, Math.min(viewport.width, 800) - sidePadding * 2);
  const contentHeight = Math.max(120, viewport.height - insets.top - insets.bottom - 170);
  const capacity = Math.max(80, Math.floor(contentWidth / (settings.fontSize * 0.57 + (settings.customize ? settings.characterSpacing + settings.wordSpacing / 5 : 0))) * Math.max(2, Math.floor(contentHeight / (settings.fontSize * lineSpacing)) - 3));
  const pages = useMemo(() => paginate(chapters, capacity), [book, capacity]);
  const index = pageAt(pages, position);
  const page = pages[index];
  const chapterIndex = page?.chapter || 0;
  const chapter = chapters[chapterIndex];
  const remaining = pages.filter((p, i) => p.chapter === chapterIndex && i > index).length;
  const bookmarks: Position[] = entry?.bookmarks || [];
  const pageBookmarked = bookmarks.some(b => pageAt(pages, b) === index);
  const results = useMemo(() => searchBook(chapters, query), [book, query]);
  const percent = entry?.finished ? 100 : Math.round(index / Math.max(pages.length, 1) * 100);

  useEffect(() => {
    if (Number.isInteger(linkedChapter) && linkedChapter >= 0 && chapters.length) {
      const nextChapter = Math.min(linkedChapter, chapters.length - 1);
      setPosition({ chapter: nextChapter, offset: Math.min(Math.max(0, linkedOffset || 0), chapters[nextChapter].text.length) });
    }
  }, [linkedChapter, linkedOffset, chapters.length]);
  useEffect(() => {
    if (!settings.scroll) readingView.current?.scrollTo({ y: 0, animated: false });
  }, [index, settings.scroll]);
  useEffect(() => {
    if (!settings.scroll) return;
    restoreScroll.current = true;
    scrollTarget.current = index;
    const frame = requestAnimationFrame(() => {
      const y = scrollPositions.current[scrollTarget.current];
      if (y !== undefined) { readingView.current?.scrollTo({ y, animated: false }); restoreScroll.current = false; }
    });
    return () => cancelAnimationFrame(frame);
  }, [jumpVersion, settings.scroll, book, capacity]);
  function saveProgress(next: Position, extra: Record<string, unknown> = {}) {
    const work = progressQueue.current.catch(() => {}).then(() => store.mutate('/library/' + id, 'PUT', { page: next.chapter, reader_offset: next.offset, ...extra }));
    progressQueue.current = work;
    return work;
  }
  useFocusEffect(useCallback(() => () => {
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    if (pendingPosition.current) {
      void saveProgress(pendingPosition.current).catch(e => current.current.onError('Position could not be saved: ' + e.message));
      pendingPosition.current = null;
    }
  }, [id]));
  useFocusEffect(useCallback(() => {
    if (!book?.available) return;
    let seconds = 0, active = AppState.currentState === 'active', last = Date.now();
    const flush = () => {
      const count = seconds; seconds = 0;
      if (count) api('/reading/' + id, 'POST', { seconds: Math.min(count, 60) }).then(() => current.current.refresh())
        .catch(e => current.current.onError('Reading time could not be saved: ' + e.message));
    };
    const subscription = AppState.addEventListener('change', state => { active = state === 'active'; last = Date.now(); if (!active) flush(); });
    const tick = setInterval(() => {
      const now = Date.now();
      if (active && (Platform.OS !== 'web' || document.visibilityState === 'visible')) seconds += Math.min(2, Math.floor((now - last) / 1000));
      last = now;
      if (seconds >= 30) flush();
    }, 1000);
    return () => { clearInterval(tick); subscription.remove(); flush(); };
  }, [id, book?.available]));
  useFocusEffect(useCallback(() => {
    let active = true;
    if (Platform.OS !== 'web') {
      Brightness.getBrightnessAsync().then(value => { if (active) { originalBrightness.current = value; return Brightness.setBrightnessAsync(settings.brightness); } }).catch(() => {});
      Orientation.getOrientationLockAsync().then(value => { if (active) previousOrientation.current = value; }).catch(() => {});
    }
    return () => {
      active = false;
      if (originalBrightness.current !== null) {
        const restore = Platform.OS === 'android' ? Brightness.restoreSystemBrightnessAsync() : Brightness.setBrightnessAsync(originalBrightness.current);
        void restore.catch(() => {});
      }
      if (previousOrientation.current !== null) void Orientation.lockAsync(previousOrientation.current).catch(() => {});
    };
  }, []));
  useEffect(() => {
    let active = true;
    void LightSensor.isAvailableAsync().then(value => { if (active) setAmbientAvailable(value); }).catch(() => {});
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!ambientAvailable || settings.appearance !== 'surroundings') return;
    LightSensor.setUpdateInterval(1500);
    const subscription = LightSensor.addListener(({ illuminance }) => setAmbientDark(previous => illuminance < 30 ? true : illuminance > 70 ? false : previous));
    return () => subscription.remove();
  }, [settings.appearance, ambientAvailable]);

  async function jump(next: Position, finished = false) {
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    pendingPosition.current = null;
    await saveProgress(next, { finished });
    setPosition(next);
    scrollTarget.current = pageAt(pages, next);
    setJumpVersion(v => v + 1);
    navigation.setParams({ page: next.chapter, offset: next.offset });
    setPanel(null); setMenu(false);
  }
  const step = (delta: number) => action.run(async () => {
    const next = pages[index + delta];
    if (next) await jump(next);
    else if (delta > 0 && page) { await jump(page, true); setNotice('Book completed. Well read!'); setMenu(true); }
  });
  async function bookmark() {
    if (!page) return;
    const next = pageBookmarked ? bookmarks.filter(b => pageAt(pages, b) !== index) : [...bookmarks, { chapter: page.chapter, offset: page.offset }];
    await saveProgress(page, { bookmarks: next, bookmarked: next.length > 0 });
    setNotice(pageBookmarked ? 'Bookmark removed.' : 'Page bookmarked. Find it in Contents.');
  }
  async function share() {
    if (!book) return;
    const origin = process.env.EXPO_PUBLIC_WEB_URL || (Platform.OS === 'web' ? window.location.origin : 'ibook://');
    const prefix = origin === 'ibook://' ? origin : origin.replace(/\/$/, '') + '/';
    const url = `${prefix}reader/${encodeURIComponent(id)}?page=${chapterIndex}&offset=${page?.offset || 0}`;
    const text = `${book.title} by ${book.author}\n${chapter?.title || ''} · Page ${index + 1}\n${url}`;
    try {
      if (Platform.OS === 'web') {
        if (navigator.share) await navigator.share({ title: book.title, text, url });
        else { await Clipboard.setStringAsync(text); setNotice('Book and reading link copied.'); }
      } else await Share.share({ title: book.title, message: text });
    } catch (e: any) { if (e.name !== 'AbortError') throw e; }
  }
  async function toggleLock() {
    if (locked) { await Orientation.lockAsync(previousOrientation.current ?? Orientation.OrientationLock.DEFAULT); setLocked(false); return; }
    const desired = viewport.width > viewport.height ? Orientation.OrientationLock.LANDSCAPE : Orientation.OrientationLock.PORTRAIT_UP;
    if (!await Orientation.supportsOrientationLockAsync(desired)) throw new Error('Orientation lock is unavailable here. Use your device rotation control.');
    await Orientation.lockAsync(desired); setLocked(true);
  }
  const saveSettings = () => action.run(async () => { await store.mutate('/me', 'PATCH', { reader_settings: settings }); setPanel(null); setNotice('Reader settings saved.'); });
  const changeBrightness = (value: number) => {
    if (Platform.OS !== 'web') void Brightness.setBrightnessAsync(value).catch(() => setNotice('Screen brightness could not be changed on this device.'));
  };
  function renderText(text: string) {
    const display = Platform.OS !== 'web' && settings.customize ? text.replace(/ /g, ' ' + '\u200A'.repeat(Math.round(settings.wordSpacing / 2))) : text;
    if (!highlight.trim()) return display;
    const escaped = highlight.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return display.split(new RegExp(`(${escaped})`, 'gi')).map((part, i) => part.toLocaleLowerCase() === highlight.trim().toLocaleLowerCase()
      ? <Text key={i} style={{ backgroundColor: '#E7BE5E', color: '#302719' }}>{part}</Text> : part);
  }
  const textStyle = { fontFamily: fonts[settings.font], color: ink, fontSize: settings.fontSize, lineHeight: settings.fontSize * lineSpacing,
    fontWeight: settings.bold ? '700' as const : '400' as const, letterSpacing: settings.customize ? settings.characterSpacing : 0,
    textAlign: settings.customize && settings.justify ? 'justify' as const : 'left' as const,
    ...(Platform.OS === 'web' ? { wordSpacing: settings.customize ? settings.wordSpacing : 0 } as any : {}) };
  const menuItem = (label: string, icon: any, onPress: () => void, primary = false) => <Pressable key={label} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[s.menuItem, { backgroundColor: primary ? '#281C0D' : '#F0EBDDFA' }]}><Text style={{ color: primary ? '#FFF6E5' : '#29251E', fontSize: 17 }}>{label}</Text><Ionicons name={icon} size={24} color={primary ? '#FFF6E5' : '#29251E'} /></Pressable>;

  return <View style={[s.root, { backgroundColor: bg, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
    <StatusBar hidden={!menu && !panel} style={dark || settings.theme === 'quiet' ? 'light' : 'dark'} />
    <View style={s.top}><Text numberOfLines={1} style={{ color: ink, opacity: 0.55, fontSize: 15, flex: 1, textAlign: 'center' }}>{menu ? `${remaining} ${remaining === 1 ? 'page' : 'pages'} left in chapter` : book?.title || 'Loading book…'}</Text>{menu && <RoundButton name="close" label="Exit reader" color={ink} onPress={() => navigation.goBack()} />}</View>
    {(error || action.error || !book) && <View style={{ paddingHorizontal: 24 }}><Feedback error={error || action.error} busy={!book && !error} /></View>}
    {book && !book.available && <Text style={[s.empty, { color: ink }]}>The full text of this book is not available.</Text>}
    {page && <ScrollView ref={readingView} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: sidePadding, paddingBottom: 24 }} showsVerticalScrollIndicator={settings.scroll}
      scrollEventThrottle={100}
      onScroll={event => {
        if (!settings.scroll || restoreScroll.current) return;
        const y = event.nativeEvent.contentOffset.y + 12;
        let visible = 0;
        for (let i = 0; i < pages.length; i++) if ((scrollPositions.current[i] ?? Infinity) <= y) visible = i;
        if (visible === index) return;
        const next = pages[visible];
        setPosition({ chapter: next.chapter, offset: next.offset });
        pendingPosition.current = next;
        if (scrollTimer.current) clearTimeout(scrollTimer.current);
        scrollTimer.current = setTimeout(() => {
          pendingPosition.current = null;
          void saveProgress(next).catch(e => action.setError('Position could not be saved: ' + e.message));
        }, 500);
      }}
      onTouchStart={event => { touchStart.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY }; }}
      onTouchEnd={event => { const dx = event.nativeEvent.pageX - touchStart.current.x, dy = event.nativeEvent.pageY - touchStart.current.y; if (!settings.scroll && Math.abs(dx) > 70 && Math.abs(dy) < 50) step(dx < 0 ? 1 : -1); }}>
      {(settings.scroll ? pages : [page]).map((part, i) => <Pressable key={settings.scroll ? i : index} onLayout={event => {
        if (!settings.scroll) return;
        scrollPositions.current[i] = event.nativeEvent.layout.y;
        if (restoreScroll.current && i === scrollTarget.current) {
          readingView.current?.scrollTo({ y: event.nativeEvent.layout.y, animated: false }); restoreScroll.current = false;
        }
      }} accessibilityRole="button" accessibilityLabel="Show reading controls" onPress={() => setMenu(value => !value)} style={settings.scroll ? { marginBottom: 24 } : undefined}>
        {part.offset === 0 && <Text style={[textStyle, { fontSize: settings.fontSize + 5, marginBottom: 22, fontWeight: '600' }]}>{chapters[part.chapter].title}</Text>}
        <Text testID="reader-text" style={textStyle}>{renderText(part.text)}</Text>
      </Pressable>)}
    </ScrollView>}
    {Platform.OS === 'web' && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: (1 - settings.brightness) * 0.5 }]} />}
    <View style={s.footer}>
      <RoundButton name="chevron-back" label="Previous page" color={ink} disabled={!page || index === 0 || action.busy} onPress={() => step(-1)} />
      <Pressable accessibilityRole="button" accessibilityLabel="Open reader menu" onPress={() => setMenu(value => !value)} style={{ padding: 14 }}><Text style={{ color: ink, opacity: 0.6, fontSize: 15 }}>{page ? `${index + 1}${menu ? ` of ${pages.length}` : ''}` : '—'}</Text></Pressable>
      <RoundButton name={index === pages.length - 1 ? 'checkmark' : 'chevron-forward'} label={index === pages.length - 1 ? 'Finish book' : 'Next page'} color={ink} disabled={!page || action.busy} onPress={() => step(1)} />
    </View>
    {menu && page && <View style={[s.menu, { bottom: insets.bottom + 76 }]}>
      {!!notice && <Text accessibilityLiveRegion="polite" style={s.notice}>{notice}</Text>}
      {menuItem(`Contents · ${percent}%`, 'list', () => { setContentsTab('chapters'); setPanel('contents'); }, true)}
      {menuItem('Search Book', 'search', () => setPanel('search'))}
      {menuItem('Themes & Settings', 'text', () => setPanel('themes'))}
      {menuItem('Page reels', 'play-outline', () => setPanel('reels'))}
      <View style={s.actions}>
        <RoundButton name="share-outline" label="Share book" onPress={() => action.run(share)} />
        <RoundButton name={locked ? 'lock-closed' : 'lock-open-outline'} label={locked ? 'Unlock orientation' : 'Lock orientation'} selected={locked} onPress={() => action.run(toggleLock)} />
        <RoundButton name="reorder-three-outline" label={settings.scroll ? 'Switch to pages' : 'Switch to scrolling'} selected={settings.scroll} onPress={() => action.run(async () => {
          const next = { ...settings, scroll: !settings.scroll };
          await store.mutate('/me', 'PATCH', { reader_settings: next });
          scrollTarget.current = index; setSettings(next); setMenu(false);
        })} />
        <RoundButton name={pageBookmarked ? 'bookmark' : 'bookmark-outline'} label={pageBookmarked ? 'Remove page bookmark' : 'Bookmark page'} selected={pageBookmarked} onPress={() => action.run(bookmark)} />
      </View>
    </View>}
    <ReaderSheet visible={panel === 'contents'} title="Contents" onClose={() => setPanel(null)}>
      <View style={s.bookHeader}>{cover && <Image source={cover.image} style={s.cover} />}<View style={{ flex: 1 }}><Text style={s.bookTitle}>{book?.title}</Text><Text style={s.subtle}>Page {index + 1} of {pages.length}</Text></View></View>
      <View style={s.tabs}>{(['chapters', 'bookmarks'] as const).map(tab => <Pressable key={tab} accessibilityRole="tab" accessibilityState={{ selected: contentsTab === tab }} onPress={() => setContentsTab(tab)} style={[s.tab, contentsTab === tab && { backgroundColor: '#E2E0DA' }]}><Text style={s.tabText}>{tab === 'chapters' ? 'Chapters' : `Bookmarks (${bookmarks.length})`}</Text></Pressable>)}</View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16 }}>
        {contentsTab === 'chapters' ? chapters.map((c, chapter) => <Pressable key={chapter} accessibilityRole="button" accessibilityLabel={`Go to ${c.title}`} disabled={action.busy} onPress={() => action.run(() => jump({ chapter, offset: 0 }))} style={[s.chapter, chapter === chapterIndex && { backgroundColor: '#E2E1DD', borderRadius: 18 }]}><Text style={[s.chapterTitle, { flex: 1 }]}>{c.title}</Text><Text style={s.subtle}>{pages.findIndex(p => p.chapter === chapter) + 1}</Text></Pressable>)
          : bookmarks.length ? [...bookmarks].sort((a, b) => a.chapter - b.chapter || a.offset - b.offset).map((mark, i) => <Pressable key={i} accessibilityRole="button" disabled={action.busy} onPress={() => action.run(() => jump(mark))} style={s.chapter}><Ionicons name="bookmark" size={19} color="#65543A" /><View style={{ flex: 1 }}><Text style={s.chapterTitle}>{chapters[mark.chapter]?.title}</Text><Text numberOfLines={2} style={s.subtle}>{chapters[mark.chapter]?.text.slice(mark.offset, mark.offset + 100)}</Text></View><Text style={s.subtle}>{pageAt(pages, mark) + 1}</Text></Pressable>) : <Text style={s.empty}>No bookmarked pages yet. Tap the bookmark in the reading menu to save your place.</Text>}
      </ScrollView>
      {!!action.error && <Text accessibilityRole="alert" style={s.notice}>{action.error}</Text>}
    </ReaderSheet>
    <ReaderSheet visible={panel === 'search'} title="Search Book" onClose={() => setPanel(null)}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 22, flexGrow: 1 }}>
          {!query.trim() ? <View style={s.searchEmpty}><Ionicons name="search-outline" size={42} color="#C2BBAE" /><Text style={s.empty}>Find a word or passage in this book.</Text></View> : <>
            <Text style={s.subtle}>{results.length === 200 ? 'First 200' : results.length} results</Text>
            {!results.length && <Text style={s.empty}>No matches for “{query.trim()}”. Try another word.</Text>}
            {results.map((result, i) => <Pressable key={i} accessibilityRole="button" accessibilityLabel={`Search result ${i + 1}: ${result.title}`} disabled={action.busy} onPress={() => action.run(async () => { await jump(result); setHighlight(query); })} style={s.searchResult}><Text style={s.chapterTitle}>{result.title} · {pageAt(pages, result) + 1}</Text><Text style={{ fontSize: 16, lineHeight: 24, color: '#55514A', marginTop: 8 }}>{result.snippet}</Text></Pressable>)}
          </>}
        </ScrollView>
        <View style={s.searchBar}><Ionicons name="search" size={23} color="#655D50" /><TextInput accessibilityLabel="Search in this book" placeholder="In this book" value={query} onChangeText={setQuery} autoFocus={panel === 'search'} returnKeyType="search" style={{ flex: 1, fontSize: 18, paddingVertical: 12, color: '#29251E' }} />{!!query && <RoundButton name="close" label="Clear book search" onPress={() => { setQuery(''); setHighlight(''); }} />}</View>
        {!!action.error && <Text accessibilityRole="alert" style={s.notice}>{action.error}</Text>}
      </KeyboardAvoidingView>
    </ReaderSheet>
    {panel === 'themes' && <ThemePanel settings={settings} setSettings={next => { scrollTarget.current = index; setSettings(next); }} preview={page?.text || 'Make room for a little reading every day.'} onClose={saveSettings} onBrightness={changeBrightness} notice={action.error || notice} ambientAvailable={ambientAvailable} busy={action.busy} />}
    <ReaderSheet visible={panel === 'reels'} title="Page reels" onClose={() => setPanel(null)}><ScrollView style={{ paddingHorizontal: 20 }}><PageReels bookId={id} page={chapterIndex} navigation={navigation} /></ScrollView></ReaderSheet>
  </View>;
}
const s = StyleSheet.create({
  root: { flex: 1, width: '100%', maxWidth: 800, alignSelf: 'center' },
  top: { minHeight: 70, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 22, gap: 8 },
  footer: { height: 70, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 26 },
  menu: { position: 'absolute', right: 18, width: '80%', maxWidth: 350, gap: 6, borderRadius: 25, boxShadow: '0 18px 55px #30271933' },
  menuItem: { minHeight: 50, borderRadius: 28, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', padding: 4, borderRadius: 28, backgroundColor: '#EEE7D8F2' },
  notice: { backgroundColor: '#FFF9EB', borderRadius: 14, padding: 12, color: '#605039', fontSize: 13, lineHeight: 19 },
  bookHeader: { flexDirection: 'row', gap: 16, alignItems: 'center', paddingHorizontal: 22, paddingBottom: 20 },
  cover: { width: 52, height: 76, borderRadius: 6 },
  bookTitle: { fontSize: 20, fontWeight: '600', color: '#24221E', marginBottom: 6 },
  subtle: { fontSize: 15, color: '#88847C', lineHeight: 23 },
  tabs: { flexDirection: 'row', marginHorizontal: 20, marginBottom: 16, backgroundColor: '#EEEEE9', borderRadius: 20, padding: 4 },
  tab: { flex: 1, padding: 12, borderRadius: 16, alignItems: 'center' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#39362F' },
  chapter: { minHeight: 66, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#D9D7D1' },
  chapterTitle: { fontSize: 16, fontWeight: '600', color: '#28251F' },
  empty: { fontSize: 16, color: '#8B857B', textAlign: 'center', lineHeight: 25, padding: 28 },
  searchEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  searchResult: { paddingVertical: 20, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#D9D7D1' },
  searchBar: { margin: 18, borderRadius: 28, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#EFEFEA' },
});
