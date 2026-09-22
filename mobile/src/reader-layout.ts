import type { Chapter, ReaderPage } from './reader-model';

// Presentation-only normalization: all navigation coordinates remain in the source text.
export function displayRuns(chapter: Chapter, start = 0, end = (chapter.text || '').length) {
  const source = chapter.text || '';
  const pdf = /^pdf-page-/.test((chapter as any).sourceReference || '') || /^Page \d+$/.test(chapter.title);
  const runs: { text: string; start: number; end: number }[] = [];
  const pattern = /\s+|\S+/gu;
  pattern.lastIndex = start;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) && match.index < end) {
    const value = match[0].slice(0, end - match.index);
    const whitespace = /^\s/u.test(value);
    const breaks = (value.match(/\n/g) || []).length;
    const text = whitespace ? (breaks >= 2 ? '\n\n' : breaks && !pdf ? '\n' : ' ') : value;
    runs.push({ text, start: match.index, end: match.index + value.length });
  }
  while (runs.length && /^\s+$/u.test(runs[0].text)) runs.shift();
  while (runs.length && /^\s+$/u.test(runs[runs.length - 1].text)) runs.pop();
  return runs;
}
export function passageSegments(chapter: Chapter, start: number, end: number) {
  const marks = (chapter.blocks || []).filter(b => b.type === 'text' && b.end > start && b.start < end);
  const segments: {text:string; mark:any; start:number}[]=[];
  let markIndex=0;
  for(const run of displayRuns(chapter,start,end)) {
    let cursor=run.start;
    while(cursor<run.end) {
      while(markIndex<marks.length && marks[markIndex].end<=cursor)markIndex++;
      const next=marks[markIndex];
      const mark=next && next.start<=cursor ? next : undefined;
      const stop=Math.min(run.end,mark ? mark.end : next?.start ?? run.end);
      const text=/^\s+$/u.test(run.text) ? (cursor===run.start ? run.text : '') : chapter.text.slice(cursor,stop);
      const previous=segments[segments.length-1];
      if(previous && previous.mark===mark)previous.text+=text;
      else segments.push({text,mark,start:cursor});
      cursor=stop;
    }
  }
  return segments;
}
export function pageImages(chapter: Chapter, page: ReaderPage) {
  return (chapter.blocks || []).filter(b => b.type === 'image' && b.start >= page.offset &&
    (b.start < page.end || (page.end === chapter.text.length && b.start === page.end)));
}
export function showChapterTitle(chapter: Chapter) {
  const first = displayRuns(chapter).map(r => r.text).join('').split('\n')[0].trim();
  return first.toLocaleLowerCase() !== chapter.title.trim().toLocaleLowerCase();
}
export type PassageBlock = { type:'paragraph'|'image'; start:number; end:number; heading:boolean; continuation:boolean; image?:any };
const blockCache = new WeakMap<Chapter, PassageBlock[]>();
function chapterBlocks(chapter:Chapter):PassageBlock[] {
  const cached=blockCache.get(chapter);if(cached)return cached;
  const text=chapter.text || '', blocks:PassageBlock[]=[];
  const images=(chapter.blocks || []).filter(b=>b.type==='image').sort((a,b)=>a.start-b.start);
  const paragraphs=(chapter.blocks || []).filter(b=>b.type==='paragraph');
  const boundaries=[0,...Array.from(text.matchAll(/\n[\s\u00a0]*\n/gu),match=>match.index!+match[0].length),text.length];
  for(let i=0;i<boundaries.length-1;i++) {
    let start=boundaries[i],end=boundaries[i+1];
    while(start<end && /\s/u.test(text[start]))start++;
    while(end>start && /\s/u.test(text[end-1]))end--;
    if(start===end)continue;
    const marks=(chapter.blocks || []).filter(b=>b.type==='text' && b.end>start && b.start<end);
    const explicit=paragraphs.find(b=>b.start<=start && b.end>=end);
    const heading=explicit?.kind==='heading' || text.slice(start,end).trim().toLowerCase()===chapter.title.trim().toLowerCase() ||
      (end-start<120 && marks.length>0 && marks.every(b=>b.bold || !text.slice(Math.max(start,b.start),Math.min(end,b.end)).trim()));
    let cursor=start;
    for(const image of images.filter(image=>image.start>start && image.start<end)) {
      blocks.push({type:'paragraph',start:cursor,end:image.start,heading,continuation:cursor>start});cursor=image.start;
    }
    blocks.push({type:'paragraph',start:cursor,end,heading,continuation:cursor>start});
  }
  for(const image of images)blocks.push({type:'image',start:image.start,end:image.start,heading:false,continuation:false,image});
  blocks.sort((a,b)=>a.start-b.start || (a.type==='image' ? -1 : 1));
  blockCache.set(chapter,blocks);return blocks;
}
export function passageBlocks(chapter:Chapter,page:ReaderPage):PassageBlock[] {
  return chapterBlocks(chapter).filter(block=>block.type==='image'
    ? block.start>=page.offset && (block.start<page.end || page.end===chapter.text.length && block.start===page.end)
    : block.end>page.offset && block.start<page.end).map(block=>({...block,
      start:Math.max(block.start,page.offset),end:Math.min(block.end,page.end),continuation:block.continuation || block.start<page.offset}));
}
export function paragraphStyle(block:PassageBlock,layout:Pick<PageLayout,'fontSize'|'lineHeight'>,last:boolean) {
  return { fontSize:block.heading ? layout.fontSize*1.18 : layout.fontSize,
    lineHeight:block.heading ? layout.lineHeight*1.12 : layout.lineHeight,
    marginTop:block.heading && !block.continuation ? layout.fontSize*.4 : 0,
    marginBottom:last ? 0 : block.heading ? layout.fontSize*.7 : layout.fontSize*.42,
    ...(block.heading ? {fontWeight:'600' as const,textAlign:'center' as const} : {}) };
}
export type PageLayout = {
  width: number; height: number; fontSize: number; lineHeight: number;
  fontFamily: string; bold: boolean; letterSpacing: number; wordSpacing: number;
  justify: boolean;
};
export function illustrationHeight(layout: Pick<PageLayout, 'height'>) {
  return Math.max(40, Math.min(240, layout.height * 0.4));
}

const pageCache = new WeakMap<Chapter, {key:string; pages:ReaderPage[]}>();

// The browser measures the same font, spans, whitespace and illustration boxes as the reader.
// Native platforms use the same normalized source ranges with a line-wrapping fallback.
export function layoutPages(chapter: Chapter, chapterIndex: number, layout: PageLayout): ReaderPage[] {
  const key=JSON.stringify([chapterIndex,layout]);
  const cached=pageCache.get(chapter);
  if(cached?.key===key)return cached.pages;
  const runs = displayRuns(chapter);
  const ends = [...new Set([...runs.map(r => r.end), chapter.text.length])].sort((a,b) => a-b);
  // Include character boundaries for words longer than a page.
  for (const run of runs) if (run.text.length > 80 && !/\s/u.test(run.text)) {
    let i=run.start; for(const char of run.text) { i+=char.length; if(i<run.end)ends.push(i); }
  }
  ends.sort((a,b) => a-b);
  const box = typeof document !== 'undefined' ? document.createElement('div') : null;
  if (box) {
    Object.assign(box.style, { position:'fixed', left:'-100000px', top:'0', visibility:'hidden',
      width:`${layout.width}px`, fontFamily:layout.fontFamily, fontSize:`${layout.fontSize}px`,
      lineHeight:`${layout.lineHeight}px`, fontWeight:layout.bold?'700':'400',
      letterSpacing:`${layout.letterSpacing}px`, wordSpacing:`${layout.wordSpacing}px`,
      whiteSpace:'pre-wrap', overflowWrap:'anywhere', textAlign:layout.justify?'justify':'left' });
    document.body.appendChild(box);
  }
  const hasTitle = showChapterTitle(chapter);
  function height(page: ReaderPage) {
    const content = passageBlocks(chapter,page);
    const title = page.offset === 0 && hasTitle;
    if (!box) {
      const columns = Math.max(1, Math.floor(layout.width / (layout.fontSize * (layout.fontFamily === 'monospace' ? .61 : .56) + layout.letterSpacing + layout.wordSpacing / 5)));
      let total=title ? Math.ceil(chapter.title.length / columns)*layout.lineHeight*1.12+layout.fontSize*1.1 : 0;
      for(const [i,block] of content.entries()) {
        if(block.type==='image'){total+=illustrationHeight(layout)+30;continue;}
        const style=paragraphStyle(block,layout,i===content.length-1);
        let lines=1,column=0;
        const text=displayRuns(chapter,block.start,block.end).map(run=>run.text).join('');
        for(const token of text.match(/\n|[^\S\n]+|[^\s]+/gu) || []) {
          if(token==='\n'){lines++;column=0;continue;}
          if(column && column+token.length>columns){lines++;column=0;}
          column+=token.length;
          while(column>columns){lines++;column-=columns;}
        }
        total+=lines*style.lineHeight+style.marginTop+style.marginBottom;
      }
      return total;
    }
    box.replaceChildren();
    if (title) {
      const heading = document.createElement('div'); heading.textContent = chapter.title;
      Object.assign(heading.style, { fontSize:`${layout.fontSize*1.18}px`, lineHeight:`${layout.lineHeight*1.12}px`, fontWeight:'600', textAlign:'center', marginTop:`${layout.fontSize*.4}px`,marginBottom:`${layout.fontSize*.7}px` });
      box.appendChild(heading);
    }
    for(const [i,block] of content.entries()) {
      const body=document.createElement('div');body.style.display='flow-root';
      if(block.type==='image'){body.style.height=`${illustrationHeight(layout)+30}px`;box.appendChild(body);continue;}
      const style=paragraphStyle(block,layout,i===content.length-1);
      Object.assign(body.style,{fontSize:`${style.fontSize}px`,lineHeight:`${style.lineHeight}px`,paddingTop:`${style.marginTop}px`,paddingBottom:`${style.marginBottom}px`,...(block.heading ? {textAlign:'center',fontWeight:'600'} : {})});
      for (const {text,mark} of passageSegments(chapter,block.start,block.end)) {
        const span=document.createElement('span'); span.textContent=text;
        if(mark?.bold)span.style.fontWeight='700'; if(mark?.italic)span.style.fontStyle='italic';
        if(mark?.sup){span.style.fontSize='.75em';span.style.verticalAlign='super';}
        body.appendChild(span);
      }
      box.appendChild(body);
    }
    return box.getBoundingClientRect().height;
  }
  function absorbWhitespace(end: number) {
    while(end<chapter.text.length && /\s/u.test(chapter.text[end]))end++;
    return end;
  }
  const pages: ReaderPage[] = [];
  try {
    let offset = 0, first = 0;
    do {
      while (first < ends.length - 1 && ends[first] <= offset) first++;
      // Start near one page, not halfway through an entire imported book section.
      // This keeps measurement work bounded for EPUB sections with 100k+ characters.
      let window=Math.max(16,Math.ceil(layout.height/layout.lineHeight*layout.width/layout.fontSize/3));
      let low=first, high=Math.min(ends.length-1,first+window), best=first;
      while(high<ends.length-1 && height({chapter:chapterIndex,offset,end:absorbWhitespace(ends[high]),text:''})<=layout.height) {
        best=high;low=high+1;window*=2;high=Math.min(ends.length-1,first+window);
      }
      while(low<=high) {
        const mid=(low+high)>>1;
        const candidate={chapter:chapterIndex,offset,end:absorbWhitespace(ends[mid]),text:''};
        if(height(candidate)<=layout.height) {best=mid;low=mid+1;} else high=mid-1;
      }
      let end=ends[best];
      const blocks=passageBlocks(chapter,{chapter:chapterIndex,offset,end,text:''});
      const last=blocks[blocks.length-1];
      // Keep a section heading with the paragraph that follows it.
      if(blocks.length>1 && last?.heading && last.start>offset && end<chapter.text.length)end=last.start;
      // Absorb trailing whitespace into this source range, never create a blank page.
      while(end<chapter.text.length && /\s/u.test(chapter.text[end]))end++;
      pages.push({chapter:chapterIndex,offset,end,text:chapter.text.slice(offset,end)});
      if(end<=offset)break;
      offset=end;first=best+1;
      while(first>0 && ends[first-1]>offset)first--;
    } while(offset<chapter.text.length);
  } finally { box?.remove(); }
  pageCache.set(chapter,{key,pages});
  return pages;
}
