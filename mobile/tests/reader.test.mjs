import test from 'node:test';
import assert from 'node:assert/strict';
import { paginate, pageAt, searchBook, normalizeSettings } from '../src/reader-model.ts';
import { readerSettingsSchema, libraryUpdateSchema, validPosition } from '../server/reader-validation.mjs';

const chapters = [
  { title: 'First', text: 'A quiet place. '.repeat(160) },
  { title: 'Second', text: 'A question opens a book. A QUESTION changes a day.' },
];
test('page breaks preserve all content and chapter offsets across reflow', () => {
  const pages = paginate(chapters, 240);
  chapters.forEach((chapter, index) => assert.equal(pages.filter(p => p.chapter === index).map(p => p.text).join(''), chapter.text));
  const position = { chapter: 0, offset: 1340 };
  for (const capacity of [80, 300, 750]) {
    const reflow = paginate(chapters, capacity);
    const page = reflow[pageAt(reflow, position)];
    assert.ok(page.offset <= position.offset && page.end > position.offset);
  }
  assert.equal(pages[pageAt(pages, { chapter: 1, offset: 0 })].chapter, 1);
});
test('search finds every case-insensitive occurrence and returns source offsets', () => {
  const results = searchBook(chapters, ' question ');
  assert.equal(results.length, 2);
  results.forEach(result => assert.equal(chapters[result.chapter].text.slice(result.offset, result.offset + 8).toLowerCase(), 'question'));
  assert.equal(searchBook(chapters, 'absent').length, 0);
  assert.equal(searchBook(chapters, ' ').length, 0);
  assert.equal(searchBook([{ title: 'Literal', text: 'Match [a]+ exactly' }], '[a]+').length, 1);
});
test('empty chapters and long unbroken words do not lose content or loop', () => {
  const pages = paginate([{ title: 'Empty', text: '' }, { title: 'Long', text: 'x'.repeat(500) }], 80);
  assert.equal(pages[0].text, '');
  assert.equal(pages.slice(1).map(p => p.text).join(''), 'x'.repeat(500));
});
test('blank lines consume page space while search offsets survive reflow', () => {
  const text = 'Earlier passage.\n' + '\n'.repeat(30) + 'Call me Ishmael. ' + 'The story continues. '.repeat(30);
  const chapters = [{ title: 'Imported chapter', text }];
  for (const columns of [20, 40]) {
    const pages = paginate(chapters, columns * 8, columns);
    assert.equal(pages.map(p=>p.text).join(''), text);
    assert.ok(pages.every(p=>p.text.split('\n').length <= 9));
    const result = searchBook(chapters, 'Call me Ishmael')[0];
    const page = pages[pageAt(pages, result)];
    assert.ok(page.text.includes('Call me Ishmael'));
    assert.ok(page.offset > text.indexOf('Earlier passage.'));
  }
});
test('legacy themes migrate and expanded settings validate without silent field loss', () => {
  assert.equal(normalizeSettings({ theme: 'dark', fontSize: 18 }).theme, 'quiet');
  assert.equal(normalizeSettings({ theme: 'light', fontSize: 20 }).theme, 'original');
  const settings = { ...normalizeSettings({ theme: 'calm', fontSize: 26 }), customize: true, lineSpacing: 1.8, wordSpacing: 6, margins: 12 };
  assert.deepEqual(readerSettingsSchema.parse(settings), settings);
  assert.equal(readerSettingsSchema.safeParse({ ...settings, lineSpacing: 100 }).success, false);
  assert.equal(readerSettingsSchema.safeParse({ ...settings, injected: true }).success, false);
});
test('bookmark and offset validation rejects malformed and out-of-book positions', () => {
  assert.equal(libraryUpdateSchema.safeParse({ bookmarks: [{ chapter: 0, offset: -1 }] }).success, false);
  assert.equal(libraryUpdateSchema.safeParse({ reader_offset: 0.5 }).success, false);
  assert.equal(validPosition(chapters, { chapter: 10, offset: 0 }), false);
  assert.equal(validPosition(chapters, { chapter: 1, offset: 999 }), false);
  assert.equal(validPosition(chapters, { chapter: 1, offset: 5 }), true);
});

const { displayRuns, passageSegments, layoutPages, showChapterTitle, pageImages } = await import('../src/reader-layout.ts');
const layout = {width:320,height:520,fontSize:22,lineHeight:34.1,fontFamily:'Georgia',bold:false,letterSpacing:0,wordSpacing:0,justify:false};
test('reader removes imported spacer runs without changing source coordinates', () => {
  const text='\n\n   Opening   words.\n \n \n\n'+'The next paragraph continues. '.repeat(60)+'\n\n\n';
  const chapter={title:'Opening',text};
  assert.equal(displayRuns(chapter).map(r=>r.text).join('').includes('\n\n\n'),false);
  for(const width of [220,320,700]) {
    const pages=layoutPages(chapter,0,{...layout,width});
    assert.equal(pages.map(p=>p.text).join(''),text);
    assert.ok(pages.every(p=>displayRuns(chapter,p.offset,p.end).some(r=>r.text.trim())));
    const target={chapter:0,offset:text.indexOf('next paragraph')};
    const page=pages[pageAt(pages,target)];assert.ok(page.offset<=target.offset && page.end>target.offset);
  }
});
test('PDF physical lines reflow while EPUB verse and paragraph breaks survive',()=>{
  const text='First line\nsecond line\n\nNew paragraph.';
  const pdf={title:'Page 1',text};
  assert.equal(displayRuns(pdf).map(r=>r.text).join(''),'First line second line\n\nNew paragraph.');
  assert.equal(displayRuns({...pdf,title:'Poem'}).map(r=>r.text).join(''),text);
});
test('normalization preserves inline link and emphasis offsets and avoids duplicate titles',()=>{
  const text='Heading\n\nA   bright reader follows a link.';
  const start=text.indexOf('bright'),end=text.indexOf(' follows');
  const chapter={title:'Heading',text,blocks:[{type:'text',start,end,bold:true,href:'#note'}]};
  assert.equal(showChapterTitle(chapter),false);
  const segments=passageSegments(chapter,0,text.length);
  assert.equal(segments.map(s=>s.text).join(''),'Heading\n\nA bright reader follows a link.');
  assert.equal(segments.find(s=>s.mark?.href).text,'bright reader');
});
test('illustrations are reserved exactly once and whitespace-only tails create no extra page',()=>{
  const text='A passage. '.repeat(100)+'\n'.repeat(80);
  const chapter={title:'Pictures',text,blocks:[{type:'image',start:45,end:45,src:'/image'},{type:'image',start:text.length,end:text.length,src:'/last'}]};
  const pages=layoutPages(chapter,0,layout);
  assert.equal(pages.flatMap(p=>pageImages(chapter,p)).length,2);
  assert.ok(pages.every(p=>p.text.trim()));
});
