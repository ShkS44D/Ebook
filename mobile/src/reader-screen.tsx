import { borderlessInputStyle } from './ui';
import { ReaderToolbar } from './reader-toolbar';
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
import { useReaderBook } from './use-reader-book';
import { RichPassage } from './rich-passage';
import { layoutPages, illustrationHeight, showChapterTitle, paragraphStyle } from './reader-layout';
import { ReaderPager, ReaderPagerHandle, TurnTarget } from './reader-pager';
import { api, useStore } from './store';
import { Feedback, RequireAccount, useAction } from './functional-ui';
import { PageReels } from './reels';
import { Chapter, Position, ReaderPage, normalizeSettings, pageAt, paginate, searchBook, themes } from './reader-model';
import { fonts, ReaderSheet, RoundButton, ThemePanel } from './reader-controls';

export function Reader({ navigation, route }: any) {
  const id = route.params?.bookId || 'reading-guide';
  // A book change remounts the session so offsets, search and drafts cannot leak into another book.
  return <RequireAccount navigation={navigation}><ReaderSession key={id} id={id} navigation={navigation} route={route} /></RequireAccount>;
}
function ReaderSession({ id, navigation, route }: any) {
  const store = useStore(), action = useAction();
  const entry = store.library.find(l => l.book_id === id);
  const cover = store.books.find(b => b.id === id);
  const insets = useSafeAreaInsets(), viewport = useWindowDimensions(), deviceAppearance = useColorScheme();
  const linkedChapter = Number(route.params?.page);
  const linkedOffset = Number(route.params?.offset);
  const [position, setPosition] = useState<Position>(() => ({
    chapter: Number.isInteger(linkedChapter) && linkedChapter >= 0 ? linkedChapter : entry?.page || 0,
    offset: Number.isInteger(linkedChapter) && linkedChapter >= 0 ? Math.max(0, linkedOffset || 0) : entry?.reader_offset || 0,
  }));
  const { book, error, loadChapter } = useReaderBook(id,position.chapter);
  const [settings, setSettings] = useState(() => normalizeSettings(store.user?.reader_settings));
  const [menu, setMenu] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(false);
  const lastPageTurn = useRef(0);
  function toggleControls() {
    if(pager.current?.ignoreTap() || Date.now()-lastPageTurn.current<650)return;
    setControlsVisible(value=>!value);setMenu(false);
  }
  function hideControls() { setControlsVisible(false);setMenu(false); }
  const [panel, setPanel] = useState<'contents' | 'search' | 'themes' | 'reels' | null>(null);
  const [contentsTab, setContentsTab] = useState<'chapters' | 'bookmarks'>('chapters');
  const [query, setQuery] = useState(''), [highlight, setHighlight] = useState('');
  const [notice, setNotice] = useState('');
  const [reelAvailable, setReelAvailable] = useState(false);
  const [locked, setLocked] = useState(false);
  const [ambientAvailable, setAmbientAvailable] = useState(false), [ambientDark, setAmbientDark] = useState(false);
  const readingView = useRef<ScrollView>(null);
  const pager = useRef<ReaderPagerHandle>(null);
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
  const lineSpacing = settings.customize ? settings.lineSpacing : 1.45;
  const sidePadding = 36 + (settings.customize ? settings.margins : 0);
  const safeTop = insets.top || (Platform.OS === 'web' ? 24 : 0);
  const headerHeight = Platform.OS === 'web' ? 88 : 58;
  const footerHeight = 68;
  const [readerSize, setReaderSize] = useState({width: 0, height: 0});
  const contentWidth = Math.max(120, (readerSize.width || Math.min(viewport.width, 800)) - sidePadding * 2);
  const contentHeight = Math.max(80, (readerSize.height || viewport.height) - safeTop - insets.bottom - headerHeight - footerHeight - 16);
  const charactersPerLine = Math.max(1, Math.floor(contentWidth / (settings.fontSize * 0.57 + (settings.customize ? settings.characterSpacing + settings.wordSpacing / 5 : 0))));
  const capacity = Math.max(80, charactersPerLine * Math.max(2, Math.floor(contentHeight / (settings.fontSize * lineSpacing))));
  const layout = useMemo(() => ({ width:contentWidth, height:contentHeight, fontSize:settings.fontSize,
    lineHeight:settings.fontSize * lineSpacing, fontFamily:fonts[settings.font], bold:settings.bold,
    letterSpacing:settings.customize ? settings.characterSpacing : 0,
    wordSpacing:settings.customize ? settings.wordSpacing : 0, justify:settings.customize && settings.justify,
  }), [contentWidth, contentHeight, settings.fontSize, settings.font, settings.bold, settings.customize, settings.characterSpacing, settings.wordSpacing, settings.justify, lineSpacing]);
  const pages = useMemo(() => chapters.flatMap((chapter, chapterIndex) => chapter.text === undefined
    ? paginate([chapter], capacity, charactersPerLine).map(page => ({...page, chapter:chapterIndex}))
    : layoutPages(chapter, chapterIndex, layout)), [book, capacity, charactersPerLine, layout]);
  const index = pageAt(pages, position);
  const page = pages[index];
  const chapterIndex = page?.chapter || 0;
  const chapter = chapters[chapterIndex];
  const contentsEntries=useMemo(()=>{
    const entries=book?.toc?.length?book.toc.map((item:any)=>({title:item.title,chapter:chapters.findIndex(c=>c.id===item.chapterId),offset:item.offset || 0})).filter((item:any)=>item.chapter>=0):chapters.map((c,chapter)=>({title:c.title,chapter,offset:0}));
    return entries.filter((item:any,i:number,all:any[])=>all.findIndex(other=>other.chapter===item.chapter&&other.offset===item.offset&&other.title===item.title)===i);
  },[book]);
  useEffect(()=>{scrollPositions.current={};restoreScroll.current=true;scrollTarget.current=index;},[chapterIndex,layout]);
  const remaining = pages.filter((p, i) => p.chapter === chapterIndex && i > index).length;
  const bookmarks: Position[] = entry?.bookmarks || [];
  const pageBookmarked = bookmarks.some(b => pageAt(pages, b) === index);
  const [results,setResults]=useState<any[]>([]);
  const [searchBusy,setSearchBusy]=useState(false),[searchError,setSearchError]=useState('');
  useEffect(()=>{let active=true;setSearchError('');setResults([]);setSearchBusy(false);
    if(query.trim().length<2)return;
    setSearchBusy(true);const timer=setTimeout(()=>{void api('/books/'+encodeURIComponent(id)+'/search?q='+encodeURIComponent(query.trim())).then(rows=>{if(active)setResults(rows);}).catch(e=>{if(active)setSearchError(e.message);}).finally(()=>{if(active)setSearchBusy(false);});},300);
    return()=>{active=false;clearTimeout(timer);};},[id,query]);
  const percent = entry?.finished ? 100 : Math.round(index / Math.max(pages.length, 1) * 100);

  // Availability is checked only after the page settles, never during the
  // swipe animation. Books without published reels keep the original UI.
  useEffect(() => {
    if (!page || !chapter) { setReelAvailable(false); return; }
    let active = true;
    const timer = setTimeout(() => {
      api(`/reel-availability/${encodeURIComponent(id)}/${chapterIndex}?startOffset=${page.offset}&endOffset=${page.end}`)
        .then(data => { if (active) setReelAvailable(!!data.available); })
        .catch(() => { if (active) setReelAvailable(false); });
    }, 220);
    return () => { active = false; clearTimeout(timer); };
  }, [id, chapterIndex, page?.offset, page?.end, chapter?.id]);

  useEffect(() => {
    if (Number.isInteger(linkedChapter) && linkedChapter >= 0 && chapters.length) {
      const nextChapter = Math.min(linkedChapter, chapters.length - 1);
      setPosition({ chapter: nextChapter, offset: Math.min(Math.max(0, linkedOffset || 0), chapters[nextChapter].length ?? chapters[nextChapter].text?.length ?? 0) });
    }
  }, [linkedChapter, linkedOffset, chapters.length]);
  useEffect(() => {
    if (!settings.scroll) return;
    restoreScroll.current = true;
    scrollTarget.current = index;
    const frame = requestAnimationFrame(() => {
      const y = scrollPositions.current[scrollTarget.current];
      if (y !== undefined) { readingView.current?.scrollTo({ y, animated: false }); restoreScroll.current = false; }
    });
    return () => cancelAnimationFrame(frame);
  }, [jumpVersion, settings.scroll, book, layout]);
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
    await loadChapter(next.chapter);
    commitPosition(next, finished);
  }
  function commitPosition(next: Position, finished = false) {
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    pendingPosition.current = null;
    setPosition(next);
    scrollTarget.current = pageAt(pages, next);
    setJumpVersion(v => v + 1);
    navigation.setParams({ page: next.chapter, offset: next.offset });
    setPanel(null); hideControls();
    void saveProgress(next, { finished }).catch(e => action.setError('Position could not be saved: ' + e.message));
  }
  async function prepareTurn(delta:number):Promise<TurnTarget|null> {
    const next = pages[index + delta];
    if (next) {
      let target=next, loaded=chapters[next.chapter];
      if (next.chapter !== chapterIndex) {
        loaded = await loadChapter(next.chapter);
        if (!loaded) return null;
        const reflow = layoutPages(loaded, next.chapter, layout);
        target=delta<0 ? reflow[reflow.length-1] : reflow[0];
      }
      return {page:target,content:renderSheet(target,loaded,index+delta,false)};
    }
    if (delta > 0 && page) { commitPosition(page,true); setNotice('Book completed. Well read!'); setControlsVisible(true); setMenu(true); }
    return null;
  }
  const step = (delta:number) => {
    if(!settings.scroll){pager.current?.turn(delta);return;}
    void action.run(async()=>{const target=await prepareTurn(delta);if(target)commitPosition(target.page);});
  };
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

  function passage(part:ReaderPage,source:Chapter) {
    return <>
      {part.offset===0 && showChapterTitle(source) && <Text style={[textStyle,paragraphStyle({type:'paragraph',start:0,end:0,heading:true,continuation:false},layout,false)]}>{source.title}</Text>}
      {source.text===undefined ? <Feedback busy/> : <RichPassage imageHeight={illustrationHeight(layout)} chapter={source} page={part} textStyle={textStyle} highlight={highlight} onLink={target=>action.run(async()=>{
        const [chapterId,anchorId]=target.slice(1).split(':');const targetIndex=chapters.findIndex(c=>c.id===chapterId);
        if(targetIndex<0){setNotice('This reference is not available in this edition.');return;}
        const loaded=await loadChapter(targetIndex);const anchor=loaded?.blocks?.find((b:any)=>b.type==='anchor'&&b.id===anchorId);
        await jump({chapter:targetIndex,offset:anchor?.start || 0});
      })}/>}
    </>;
  }
  function heading(showMenu:boolean) {
    return <View style={[s.top,{height:headerHeight}]}>
      <Text numberOfLines={1} style={{color:ink,opacity:.55,fontSize:14,textAlign:'center',flex:1}}>{showMenu ? `${remaining} ${remaining===1?'page':'pages'} left in chapter` : book?.title || 'Loading book…'}</Text>
      {showMenu && <View style={{position:'absolute',right:22}}><RoundButton name="close" label="Exit reader" color={ink} onPress={()=>navigation.canGoBack()?navigation.goBack():navigation.navigate('Main')}/></View>}
    </View>;
  }
  function footer(pageNumber:number,showControls:boolean) {
    return <View style={[s.footer,{height:footerHeight}]}>
      <View style={{width:44}}>{showControls && <RoundButton name="chevron-back" label="Previous page" color={ink} disabled={!page || index===0 || action.busy} onPress={()=>step(-1)}/>}</View>
      <Pressable accessibilityRole="button" accessibilityLabel={showControls?'Hide reading controls':'Show reading controls'} onPress={toggleControls} style={{padding:14}}><Text testID="reader-page-number" style={{color:ink,opacity:.6,fontSize:14}}>{pageNumber+1}{showControls ? ` of ${pages.length}` : ''}</Text></Pressable>
      <View style={{position:'absolute',right:sidePadding,flexDirection:'row',gap:8}}>
        {showControls && Platform.OS==='web' && viewport.width>=700 && <RoundButton name={index===pages.length-1?'checkmark':'chevron-forward'} label={index===pages.length-1?'Finish book':'Next page'} color={ink} disabled={!page || action.busy} onPress={()=>step(1)}/>}
        {showControls && <RoundButton name={menu?'close':'list-outline'} label={menu?'Close reader menu':'Open reader menu'} color={ink} onPress={()=>setMenu(value=>!value)}/>}
      </View>
    </View>;
  }
  function renderSheet(part:ReaderPage,source:Chapter,pageNumber:number,showMenu:boolean) {
    return <View testID="reader-sheet" style={{flex:1,minHeight:0,backgroundColor:bg,paddingTop:safeTop,paddingBottom:insets.bottom}}>
      {heading(showMenu)}
      <Pressable testID="reader-touch-surface" accessibilityLabel="Reading page. Swipe left or right to turn pages. Tap to show or hide controls." style={{flex:1,minHeight:0,paddingHorizontal:sidePadding,paddingBottom:16,overflow:'hidden'}}
        onPress={toggleControls}>
        <View testID="reader-page-content">{passage(part,source)}</View>
      </Pressable>
      {footer(pageNumber,showMenu)}
    </View>;
  }

  return <View onLayout={event=>{const {width,height}=event.nativeEvent.layout;setReaderSize(previous=>previous.width===width && previous.height===height ? previous : {width,height});}} style={[s.root, { backgroundColor: bg, overflow:'hidden' }]}>
    <StatusBar hidden={!controlsVisible && !panel} style={dark || settings.theme === 'quiet' ? 'light' : 'dark'} />
    {(error || action.error || !book) && <View style={{position:'absolute',top:safeTop+8,left:24,right:24,zIndex:5,backgroundColor:bg}}><Feedback error={error || action.error} busy={!book && !error} /></View>}
    {book && !book.available && <Text style={[s.empty, { color: ink }]}>The full text of this book is not available.</Text>}
    {page && !settings.scroll && <ReaderPager ref={pager} background={bg} width={readerSize.width || Math.min(viewport.width,800)} layoutKey={JSON.stringify([layout,bg])} disabled={!!panel || action.busy || chapter?.text===undefined}
      prepare={prepareTurn} onTurnStart={()=>{lastPageTurn.current=Date.now();hideControls();}} onTap={toggleControls} commit={commitPosition} onError={action.setError}>
      {renderSheet(page,chapter,index,controlsVisible)}
    </ReaderPager>}
    {page && settings.scroll && <View style={{flex:1,minHeight:0,paddingTop:safeTop,paddingBottom:insets.bottom}}>{heading(controlsVisible)}<ScrollView ref={readingView} testID="reader-scroll" style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: sidePadding, paddingBottom: 16 }} showsVerticalScrollIndicator
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
      }}>
      {pages.filter(p=>p.chapter===chapterIndex).map((part, i) => <Pressable key={part.offset} onLayout={event => {
        if (!settings.scroll) return;
        const globalIndex=pages.indexOf(part);
        scrollPositions.current[globalIndex] = event.nativeEvent.layout.y;
        if (restoreScroll.current && globalIndex === scrollTarget.current) {
          readingView.current?.scrollTo({ y: event.nativeEvent.layout.y, animated: false }); restoreScroll.current = false;
        }
      }} accessibilityRole="button" accessibilityLabel="Show reading controls" onPress={toggleControls} style={settings.scroll ? { marginBottom: 24 } : undefined}>
        {passage(part,chapters[part.chapter])}
      </Pressable>)}
    </ScrollView>{footer(index,controlsVisible)}</View>}
    {Platform.OS === 'web' && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: (1 - settings.brightness) * 0.5 }]} />}
    {page && <ReaderToolbar visible={menu && !panel} dark={dark || settings.theme === 'quiet'} bottom={insets.bottom + 76} notice={notice}
      primary={[
        { label: `Contents · ${percent}%`, title: `Contents · ${percent}%`, icon: 'list-outline', selected: true, onPress: () => { setContentsTab('chapters'); setPanel('contents'); } },
        { label: 'Search Book', title: 'Search', icon: 'search-outline', onPress: () => setPanel('search') },
        { label: 'Themes & Settings', title: 'Appearance', icon: 'text-outline', onPress: () => setPanel('themes') },
        ...(reelAvailable ? [{ label: 'Passage reels', title: 'Reels', icon: 'play-circle-outline', onPress: () => setPanel('reels') }] : []),
        ...(store.user?.reel_admin ? [{ label: 'Add passage reel', title: 'Add reel', icon: 'add-circle-outline', onPress: () => navigation.navigate('AddReel', { bookId:id, page:chapterIndex, chapterId:chapter?.id || String(chapterIndex), startOffset:page.offset, endOffset:page.end, passagePreview:chapter?.text?.slice(page.offset, Math.min(page.end, page.offset + 240)) || '' }) }] : []),
      ] as any}
      actions={[
        { label: 'Share book', icon: 'share-outline', onPress: () => action.run(share) },
        { label: locked ? 'Unlock orientation' : 'Lock orientation', icon: locked ? 'lock-closed' : 'lock-open-outline', selected: locked, onPress: () => action.run(toggleLock) },
        { label: settings.scroll ? 'Switch to pages' : 'Switch to scrolling', icon: 'reorder-three-outline', selected: settings.scroll, onPress: () => action.run(async () => {
          const next = { ...settings, scroll: !settings.scroll };
          await store.mutate('/me', 'PATCH', { reader_settings: next });
          scrollTarget.current = index; setSettings(next); setMenu(false);
        }) },
        { label: pageBookmarked ? 'Remove page bookmark' : 'Bookmark page', icon: pageBookmarked ? 'bookmark' : 'bookmark-outline', selected: pageBookmarked, onPress: () => action.run(bookmark) },
      ]} />}
    <ReaderSheet visible={panel === 'contents'} title="Contents" onClose={() => setPanel(null)}>
      <View style={s.bookHeader}>{cover && <Image source={cover.image} style={s.cover} />}<View style={{ flex: 1 }}><Text style={s.bookTitle}>{book?.title}</Text><Text style={s.subtle}>Page {index + 1} of {pages.length}</Text></View></View>
      <View style={s.tabs}>{(['chapters', 'bookmarks'] as const).map(tab => <Pressable key={tab} accessibilityRole="tab" accessibilityState={{ selected: contentsTab === tab }} onPress={() => setContentsTab(tab)} style={[s.tab, contentsTab === tab && { backgroundColor: '#E2E0DA' }]}><Text style={s.tabText}>{tab === 'chapters' ? 'Chapters' : `Bookmarks (${bookmarks.length})`}</Text></Pressable>)}</View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16 }}>
        {contentsTab === 'chapters' ? contentsEntries.map((c:any,i:number) => <Pressable key={i} accessibilityRole="button" accessibilityLabel={`Go to ${c.title}`} disabled={action.busy} onPress={() => action.run(() => jump({ chapter:c.chapter, offset:c.offset }))} style={[s.chapter, c.chapter === chapterIndex && c.offset<=position.offset && (!contentsEntries[i+1] || contentsEntries[i+1].chapter>chapterIndex || contentsEntries[i+1].offset>position.offset) && { backgroundColor: '#E2E1DD', borderRadius: 18 }]}><Text style={[s.chapterTitle, { flex: 1 }]}>{c.title}</Text><Text style={s.subtle}>{pageAt(pages,c) + 1}</Text></Pressable>)
          : bookmarks.length ? [...bookmarks].sort((a, b) => a.chapter - b.chapter || a.offset - b.offset).map((mark, i) => <Pressable key={i} accessibilityRole="button" disabled={action.busy} onPress={() => action.run(() => jump(mark))} style={s.chapter}><Ionicons name="bookmark" size={19} color="#65543A" /><View style={{ flex: 1 }}><Text style={s.chapterTitle}>{chapters[mark.chapter]?.title}</Text><Text numberOfLines={2} style={s.subtle}>{chapters[mark.chapter]?.text?.slice(mark.offset, mark.offset + 100) || 'Saved reading position'}</Text></View><Text style={s.subtle}>{pageAt(pages, mark) + 1}</Text></Pressable>) : <Text style={s.empty}>No bookmarked pages yet. Tap the bookmark in the reading menu to save your place.</Text>}
      </ScrollView>
      {!!action.error && <Text accessibilityRole="alert" style={s.notice}>{action.error}</Text>}
    </ReaderSheet>
    <ReaderSheet visible={panel === 'search'} title="Search Book" onClose={() => setPanel(null)}>
      <Feedback busy={searchBusy} error={searchError}/>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 22, flexGrow: 1 }}>
          {!query.trim() ? <View style={s.searchEmpty}><Ionicons name="search-outline" size={42} color="#C2BBAE" /><Text style={s.empty}>Find a word or passage in this book.</Text></View> : <>
            <Text style={s.subtle}>{results.length === 100 ? 'First 100' : results.length} results</Text>
            {!results.length&&!searchBusy&&!searchError && <Text style={s.empty}>{query.trim().length<2?'Enter at least two characters.':`No matches for “${query.trim()}”. Try another word.`}</Text>}
            {results.map((result, i) => <Pressable key={i} accessibilityRole="button" accessibilityLabel={`Search result ${i + 1}: ${result.title}`} disabled={action.busy} onPress={() => action.run(async () => { await jump(result); setHighlight(query); })} style={s.searchResult}><Text style={s.chapterTitle}>{result.title} · {pageAt(pages, result) + 1}</Text><Text style={{ fontSize: 16, lineHeight: 24, color: '#55514A', marginTop: 8 }}>{result.snippet}</Text></Pressable>)}
          </>}
        </ScrollView>
        <View style={s.searchBar}><Ionicons name="search" size={23} color="#655D50" /><TextInput underlineColorAndroid="transparent" accessibilityLabel="Search in this book" placeholder="In this book" value={query} onChangeText={setQuery} autoFocus={panel === 'search'} returnKeyType="search" style={{ flex: 1, fontSize: 18, paddingVertical: 12, color: '#29251E', ...borderlessInputStyle }} />{!!query && <RoundButton name="close" label="Clear book search" onPress={() => { setQuery(''); setHighlight(''); }} />}</View>
        {!!action.error && <Text accessibilityRole="alert" style={s.notice}>{action.error}</Text>}
      </KeyboardAvoidingView>
    </ReaderSheet>
    {panel === 'themes' && <ThemePanel settings={settings} setSettings={next => { scrollTarget.current = index; setSettings(next); }} preview={page?.text || 'Make room for a little reading every day.'} onClose={saveSettings} onBrightness={changeBrightness} notice={action.error || notice} ambientAvailable={ambientAvailable} busy={action.busy} />}
    <ReaderSheet visible={panel === 'reels'} title="Passage reels" onClose={() => setPanel(null)}><ScrollView style={{ paddingHorizontal: 20 }}><PageReels bookId={id} page={chapterIndex} startOffset={page?.offset} endOffset={page?.end} navigation={navigation} /></ScrollView></ReaderSheet>
  </View>;
}
const s = StyleSheet.create({
  root: { flex: 1, width: '100%', maxWidth: 800, alignSelf: 'center' },
  top: { minHeight: 70, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 22, gap: 8 },
  footer: { height: 70, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 26 },
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
