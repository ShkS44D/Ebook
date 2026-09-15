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
