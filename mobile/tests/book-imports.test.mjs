import test from 'node:test';
import assert from 'node:assert/strict';
import {zipSync,strToU8} from 'fflate';
import {parseEpub,parseHtml,parsePdf,normalizeChapter,safeMarkup,resolveArchive,validateBook} from '../server/books/parsers.mjs';
import {allowedUrl,mirrorUrl} from '../server/books/network.mjs';
const paragraph='A thoughtful reader follows the story through every chapter and remembers the people who live within its pages. '.repeat(6);
function fixture(extra={}){
  const files={
    'META-INF/container.xml':'<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>',
    'OPS/book.opf':'<package><manifest><item id="one" href="one.xhtml" media-type="application/xhtml+xml"/><item id="two" href="two.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" properties="nav"/><item id="picture" href="image.png" media-type="image/png"/></manifest><spine><itemref idref="two"/><itemref idref="one"/></spine></package>',
    'OPS/nav.xhtml':'<nav><ol><li><a href="two.xhtml">Beginning</a></li><li><a href="one.xhtml">Ending</a></li></ol></nav>',
    'OPS/one.xhtml':`<html><body><h2>Ending</h2><p>${paragraph}</p><p id="note">A footnote.</p></body></html>`,
    'OPS/two.xhtml':`<html><body><h2>Beginning</h2><p><strong>Bright</strong> words. <em>Gentle</em> reading.</p><img src="image.png" alt="An illustration"/><p>${paragraph}</p><a href="one.xhtml#note">Note</a><script>alert(1)</script></body></html>`,
    'OPS/image.png':'image fixture',...extra};
  return Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([k,v])=>[k,strToU8(v)]))));
}
test('EPUB follows spine order, keeps formatting and rewrites images/footnotes',async()=>{
  const b=await parseEpub(fixture(),async()=>'/api/book-assets/fixture');
  assert.deepEqual(b.chapters.map(c=>c.title),['Beginning','Ending']);
  assert.equal(b.chapters[0].blocks.find(b=>b.bold&&b.text==='Bright').text,'Bright');
  assert.ok(b.chapters[0].blocks.some(b=>b.src==='/api/book-assets/fixture'));
  assert.ok(b.chapters[0].blocks.some(s=>s.href==='#'+b.chapters[1].id+':note'));
  assert.ok(!b.chapters[0].html.includes('script'));
  for(const c of b.chapters)for(const span of c.blocks.filter(b=>b.type==='text'))assert.equal(c.text.slice(span.start,span.end),span.text);
  assert.equal(validateBook(b).errors.length,0);
});
test('rejects broken, traversal and encrypted EPUBs',async()=>{
  await assert.rejects(()=>parseEpub(Buffer.from('not epub')));
  await assert.rejects(()=>parseEpub(fixture({'../escape':'bad'})),/Unsafe/);
  await assert.rejects(()=>parseEpub(fixture({'META-INF/encryption.xml':'encrypted'})),/Encrypted/);
  assert.throws(()=>resolveArchive('OPS/book.opf','../../etc/passwd'),/escapes/);
});
test('EPUB contents entries resolve to the passage inside a chapter',async()=>{
  const b=await parseEpub(fixture({
    'OPS/nav.xhtml':'<nav><ol><li><a href="one.xhtml#note">Footnote</a></li></ol></nav>',
  }),async()=>'/api/book-assets/fixture');
  const entry=b.toc.find(item=>item.title==='Footnote');
  const chapter=b.chapters.find(item=>item.id===entry.chapterId);
  assert.ok(entry.offset>0);
  assert.equal(chapter.text.slice(entry.offset,entry.offset+'A footnote.'.length),'A footnote.');
});
test('HTML sanitizes untrusted markup, splits headings and preserves RTL text',async()=>{
  const b=await parseHtml(Buffer.from(`<html><head><title>Book</title></head><body><nav>Advert</nav><main><h2>First</h2><p onclick="bad()">${paragraph}</p><h2>ثاني</h2><p>هذه قصة جميلة للقراءة</p><iframe src="https://evil.test"></iframe></main></body></html>`));
  assert.equal(b.chapters.length,2);assert.match(b.chapters[1].text,/هذه قصة/);
  assert.ok(!b.chapters[0].html.includes('onclick'));assert.ok(!b.chapters[0].text.includes('Advert'));
  const safe=safeMarkup('<img src="javascript:alert(1)" onerror="bad()"><a href="https://evil.test">link</a><script>bad()</script>');
  assert.ok(!safe.includes('javascript'));assert.ok(!safe.includes('onerror'));assert.ok(!safe.includes('evil.test'));
});
test('blocks unconfigured downloads and validates every mirror path',()=>{
  for(const url of ['http://gutendex.com/books','https://127.0.0.1/book','https://gutendex.com@evil.test/book','https://gutendex.com:444/book'])assert.throws(()=>allowedUrl(url));
  assert.equal(mirrorUrl('https://www.gutenberg.org/cache/epub/11/pg11-images-3.epub'),'https://gutenberg.pglaf.org/cache/epub/11/pg11-images-3.epub');
});
test('reports empty and duplicate extraction without inventing text',()=>{
  assert.ok(validateBook({chapters:[],warnings:[]}).errors.length);
  const a=normalizeChapter('<p>'+paragraph.repeat(2)+'</p>','A','a',0),b=normalizeChapter('<p>'+paragraph.repeat(2)+'</p>','B','b',1);
  assert.ok(validateBook({chapters:[a,b],warnings:[]}).warnings.some(w=>w.includes('duplicate')));
});
function pdfFixture(text=''){
  const stream=text?`BT /F1 12 Tf 40 700 Td (${text}) Tj ET`:'';
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let pdf='%PDF-1.4\n';const offsets=[0];objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${o}\nendobj\n`;});
  const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 6\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}
test('PDF extracts actual text and flags scanned pages for OCR',async()=>{
  const text='Reading a real book should preserve the original words for every reader. '.repeat(6);
  const result=await parsePdf(pdfFixture(text));assert.match(result.chapters[0].text,/Reading a real book/);assert.equal(result.requiresOcr,false);
  const scanned=await parsePdf(pdfFixture());assert.equal(scanned.requiresOcr,true);assert.equal(scanned.chapters[0].text.trim(),'');
  assert.equal(validateBook(scanned).quality,'failed');
});
test('UTF-16 offsets preserve astral characters and explicit whitespace',()=>{
  const c=normalizeChapter('<p>Hello 🌙 <b>reader</b></p><p>مرحبا</p>','Unicode','unicode',0);
  const span=c.blocks.find(b=>b.text==='reader');assert.equal(c.text.slice(span.start,span.end),'reader');
  assert.equal(c.text.indexOf('reader'),span.start);
});
