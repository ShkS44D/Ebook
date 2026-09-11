export type ReaderTheme = 'original' | 'quiet' | 'paper' | 'bold' | 'calm' | 'focus';
export type ReaderSettings = {
  theme: ReaderTheme; fontSize: number; font: 'serif' | 'sans' | 'mono';
  bold: boolean; customize: boolean; lineSpacing: number; characterSpacing: number;
  wordSpacing: number; margins: number; justify: boolean; brightness: number;
  appearance: 'light' | 'dark' | 'device' | 'surroundings'; scroll: boolean;
};
export type Chapter = { title: string; text: string };
export type Position = { chapter: number; offset: number };
export type ReaderPage = Position & { text: string; end: number };
export const themes: Record<ReaderTheme, { name: string; bg: string; ink: string; font: ReaderSettings['font']; bold: boolean }> = {
  original: { name: 'Original', bg: '#FFFFFF', ink: '#242424', font: 'sans', bold: false },
  quiet: { name: 'Quiet', bg: '#48484B', ink: '#E2DFDB', font: 'serif', bold: false },
  paper: { name: 'Paper', bg: '#EEEEEC', ink: '#272724', font: 'serif', bold: false },
  bold: { name: 'Bold', bg: '#FFFFFF', ink: '#161616', font: 'sans', bold: true },
  calm: { name: 'Calm', bg: '#F1E4C8', ink: '#34291C', font: 'serif', bold: false },
  focus: { name: 'Focus', bg: '#FFFCF5', ink: '#26251E', font: 'sans', bold: false },
};
export function defaults(theme: ReaderTheme = 'calm'): ReaderSettings {
  return { theme, fontSize: 22, font: themes[theme].font, bold: themes[theme].bold,
    customize: false, lineSpacing: 1.55, characterSpacing: 0, wordSpacing: 0,
    margins: 0, justify: false, brightness: 0.8, appearance: 'light', scroll: false };
}
export function normalizeSettings(saved: any): ReaderSettings {
  const theme = saved?.theme === 'light' ? 'original' : saved?.theme === 'dark' ? 'quiet'
    : saved?.theme in themes ? saved.theme : 'calm';
  return { ...defaults(theme), ...saved, theme };
}
// Page breaks are presentation only; saved offsets always refer to the original chapter.
export function paginate(chapters: Chapter[], capacity: number): ReaderPage[] {
  const pages: ReaderPage[] = [];
  const size = Math.max(80, Math.floor(capacity));
  chapters.forEach((chapter, index) => {
    const text = chapter.text || '';
    if (!text.length) pages.push({ chapter: index, offset: 0, end: 0, text: '' });
    for (let offset = 0; offset < text.length;) {
      let end = Math.min(text.length, offset + size);
      if (end < text.length) {
        const boundary = text.lastIndexOf(' ', end);
        if (boundary > offset + size / 2) end = boundary + 1;
      }
      pages.push({ chapter: index, offset, end, text: text.slice(offset, end) });
      offset = end;
    }
  });
  return pages;
}
export function pageAt(pages: ReaderPage[], position: Position): number {
  const matching = pages.findIndex(p => p.chapter === position.chapter && p.offset <= position.offset && p.end > position.offset);
  if (matching >= 0) return matching;
  const last = pages.map(p => p.chapter).lastIndexOf(position.chapter);
  return Math.max(0, last);
}
export function searchBook(chapters: Chapter[], query: string) {
  const needle = query.trim().toLocaleLowerCase();
  const results: (Position & { snippet: string; title: string })[] = [];
  if (!needle) return results;
  chapters.forEach((chapter, index) => {
    const text = chapter.text.toLocaleLowerCase();
    let from = 0, match: number;
    while ((match = text.indexOf(needle, from)) !== -1 && results.length < 200) {
      results.push({ chapter: index, offset: match, title: chapter.title,
        snippet: (match > 45 ? '…' : '') + chapter.text.slice(Math.max(0, match - 45), match + needle.length + 85) + (match + needle.length + 85 < text.length ? '…' : '') });
      from = match + needle.length;
    }
  });
  return results;
}
