import { unzipSync, strFromU8 } from 'fflate';
import { load } from 'cheerio';
import sanitize from 'sanitize-html';
import { digest } from './hash.mjs';
import path from 'node:path';
export { digest } from './hash.mjs';
const MAX_EXPANDED = 100 * 1024 * 1024;
const allowedTags = ['p','div','section','article','h1','h2','h3','h4','h5','h6','em','strong','i','b','br','hr','blockquote','ul','ol','li','a','img','figure','figcaption','sup','sub','pre','span','table','tr','td','th','tbody'];
export function safeMarkup(html) {
  return sanitize(html, { allowedTags, allowedAttributes:{'*':['id','lang','dir'],a:['href'],img:['src','alt']},
    allowedSchemes:['https'], allowProtocolRelative:false,
    transformTags:{a:(tag,attrs)=>({tagName:tag,attribs:{...attrs,...(attrs.href && !attrs.href.startsWith('#') ? {href:''} : {})}})} });
}
export function resolveArchive(base, relative) {
  const clean = decodeURIComponent(relative.split('#')[0]);
  if (/^[a-z]+:|^\/|\\|\0/i.test(clean)) throw new Error('Unsafe EPUB resource path.');
  const result = path.posix.normalize(path.posix.join(path.posix.dirname(base),clean));
  if (result.startsWith('../')) throw new Error('EPUB resource escapes the archive.');
  return result;
}
// Plain text and formatting offsets are generated together, so search/bookmarks use identical coordinates.
export function normalizeChapter(html, title, reference, order) {
  html = safeMarkup(html);
  const $ = load(html); const blocks = []; let text = '';
  function addText(value, marks) {
    value = value.replace(/\s+/gu,' ');
    if (!value) return;
    const start = text.length; text += value;
    blocks.push({type:'text',start,end:text.length,text:value,...marks});
  }
  function walk(node, marks = {}) {
    if (node.type === 'text') { addText(node.data,marks); return; }
    if (node.type !== 'tag') return;
    const tag = node.name;
    const block = /^(p|div|section|article|h[1-6]|blockquote|li|pre|tr|figcaption)$/.test(tag);
    if (block && text && !text.endsWith('\n\n')) text += '\n\n';
    const start = text.length;
    if (node.attribs.id) blocks.push({type:'anchor',id:node.attribs.id,start,end:start});
    if (tag === 'img') {
      if (node.attribs.src?.startsWith('/api/book-assets/') || node.attribs.src?.startsWith('https://'))
        blocks.push({type:'image',src:node.attribs.src,alt:node.attribs.alt || 'Book illustration',start,end:start});
      return;
    }
    if (tag === 'br') { text += '\n'; return; }
    const next = {...marks, ...(/^(b|strong|h[1-6])$/.test(tag) ? {bold:true}:{}),
      ...(/^(i|em)$/.test(tag) ? {italic:true}:{}), ...(tag==='a' && node.attribs.href ? {href:node.attribs.href}:{}),
      ...(tag==='sup' ? {sup:true}:{})};
    for (const child of node.children || []) walk(child,next);
    if (block && text && !text.endsWith('\n\n')) text += '\n\n';
  }
  for (const child of $('body')[0]?.children || []) walk(child);
  // Keep offsets exact; do not trim or normalize text after constructing spans.
  return {id:digest(reference).slice(0,24),order,title:title.trim() || `Chapter ${order+1}`,html,text,blocks,
    wordCount:text.trim().split(/\s+/u).filter(Boolean).length,sourceReference:reference};
}
export async function parseEpub(buffer, saveAsset = async () => null) {
  let expanded = 0, entries = 0;
  const files = unzipSync(new Uint8Array(buffer), {filter:entry=>{
    if (++entries>5000 || (expanded+=entry.originalSize)>MAX_EXPANDED) throw new Error('EPUB expands beyond the safe import limit.');
    if (entry.name.startsWith('/') || entry.name.split('/').includes('..') || /\\|\0/.test(entry.name)) throw new Error('Unsafe EPUB archive path.');
    return true;
  }});
  if (files['META-INF/encryption.xml']) throw new Error('Encrypted EPUBs require a licensed DRM integration.');
  const read = name => { if (!files[name]) throw new Error(`Missing EPUB resource: ${name}`); return strFromU8(files[name]); };
  const container = load(read('META-INF/container.xml'),{xml:true});
  const packagePath = container('rootfile').first().attr('full-path');
  if (!packagePath) throw new Error('EPUB has no package document.');
  const pkg = load(read(packagePath),{xml:true});
  const manifest = new Map();
  pkg('manifest item').each((_,el)=>{const a=el.attribs;manifest.set(a.id,{...a,path:resolveArchive(packagePath,a.href)});});
  const warnings = [], assets = new Map();
  const imageItems=[...manifest.values()].filter(item=>/^image\/(jpeg|png|gif|webp)$/.test(item['media-type']));
  let imageCursor=0;
  async function saveImage(item) {
    const bytes=files[item.path];
    if (!bytes || bytes.length>8*1024*1024) {warnings.push(`Missing or oversized image: ${item.path}`);return;}
    const url=await saveAsset(Buffer.from(bytes),item['media-type'],item.path);
    if (url) assets.set(item.path,url); else warnings.push(`Image was not stored: ${item.path}`);
  }
  await Promise.all(Array.from({length:4},async()=>{while(imageCursor<imageItems.length)await saveImage(imageItems[imageCursor++]);}));
  const titles=new Map(),toc=[];
  const hasNavigation=[...manifest.values()].some(item=>item.properties?.split(' ').includes('nav'));
  for (const item of manifest.values()) {
    if (item.properties?.split(' ').includes('nav')) {
      const nav=load(read(item.path));
      nav('nav').first().find('a[href]').each((_,el)=>{
        try {const href=el.attribs.href, target=resolveArchive(item.path,href); const title=nav(el).text().trim();
          if (!titles.has(target)) titles.set(target,title);
          toc.push({title,source:target,fragment:href.split('#')[1] || null});
        } catch {warnings.push('Invalid table-of-contents link.');}
      });
    } else if (!hasNavigation && item['media-type']==='application/x-dtbncx+xml') {
      const nav=load(read(item.path),{xml:true});
      nav('navPoint').each((_,el)=>{const href=nav(el).children('content').attr('src');if(!href)return;
        const target=resolveArchive(item.path,href), title=nav(el).children('navLabel').text().trim();
        if(!titles.has(target))titles.set(target,title);toc.push({title,source:target,fragment:href.split('#')[1] || null});});
    }
  }
  const chapters=[];
  const spine=[];pkg('spine itemref').each((_,el)=>{if(el.attribs.linear!=='no')spine.push(el.attribs.idref);});
  if(!spine.length)throw new Error('EPUB has no reading order.');
  for(const id of spine){
    const item=manifest.get(id);if(!item)throw new Error('EPUB spine references a missing chapter.');
    if(item.properties?.split(' ').includes('nav'))continue;
    const $=load(read(item.path));$('script,style,nav,iframe,object,form').remove();
    $('img').each((_,el)=>{try{const url=assets.get(resolveArchive(item.path,el.attribs.src || ''));
      if(url)$(el).attr('src',url);else {warnings.push(`Unresolved image in ${item.path}`);$(el).remove();}}catch{$(el).remove();}});
    $('a[href]').each((_,el)=>{try{const href=el.attribs.href;if(/^[a-z]+:/i.test(href)){$(el).removeAttr('href');return;}
      const target=href.startsWith('#')?item.path:resolveArchive(item.path,href);
      $(el).attr('href','#'+digest(target).slice(0,24)+(href.includes('#')?':'+href.split('#')[1]:''));
    }catch{$(el).removeAttr('href');}});
    const title=titles.get(item.path) || $('h1,h2,h3').first().text() || $('title').text() || `Section ${chapters.length+1}`;
    const chapter=normalizeChapter($('body').html() || '',title,item.path,chapters.length);
    if(chapter.text.trim() || chapter.blocks.some(b=>b.type==='image'))chapters.push(chapter);
  }
  return {chapters,toc:toc.map(t=>{
    const chapterId=digest(t.source).slice(0,24),chapter=chapters.find(c=>c.id===chapterId);
    const anchor=chapter?.blocks.find(b=>b.type==='anchor'&&b.id===t.fragment);
    if(t.fragment&&!anchor)warnings.push(`Unresolved contents anchor: ${t.title}`);
    return {...t,chapterId,offset:anchor?.start || 0};
  }).filter(t=>chapters.some(c=>c.id===t.chapterId)),warnings};
}
export async function parseHtml(buffer, saveAsset, sourceUrl) {
  const $=load(buffer.toString('utf8'));$('script,style,nav,header,footer,aside,iframe,object,form').remove();
  const warnings=[];
  let imageBytes=0;
  for(const [index,el] of $('img').toArray().entries()){
    try{
      if(index>=100||!saveAsset||!sourceUrl)throw new Error('Image import needs a source URL.');
      const {download,allowedUrl}=await import('./network.mjs');
      const url=allowedUrl(new URL(el.attribs.src,sourceUrl).href);
      const extension=url.pathname.split('.').pop().toLowerCase(),mime={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',gif:'image/gif',webp:'image/webp'}[extension];
      if(!mime)throw new Error('Unsupported image type.');
      const bytes=await download(url.href,{maxBytes:8*1024*1024});imageBytes+=bytes.length;
      if(imageBytes>MAX_EXPANDED)throw new Error('Image budget exceeded.');
      const stored=await saveAsset(bytes,mime,url.pathname);if(!stored)throw new Error('Image storage unavailable.');
      $(el).attr('src',stored);
    }catch{warnings.push('HTML illustration needs review: '+(el.attribs.alt || 'image'));$(el).remove();}
  }
  const root=$('main,article').first().length ? $('main,article').first() : $('body');
  const chapters=[]; let title=$('title').text() || 'Book',parts=[];
  function flush(){if(parts.length){const c=normalizeChapter(parts.join(''),title,`html-section-${chapters.length}`,chapters.length);if(c.text.trim())chapters.push(c);parts=[];}}
  function visit(el){if(/^h[12]$/.test(el.name)){flush();title=$(el).text();parts.push($.html(el));}
    else if($(el).find('h1,h2').length)$(el).contents().each((_,child)=>visit(child));else parts.push($.html(el));}
  root.contents().each((_,el)=>visit(el));flush();
  return {chapters,toc:chapters.map(c=>({title:c.title,chapterId:c.id})),warnings};
}
export async function parsePdf(buffer) {
  const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task=getDocument({data:new Uint8Array(buffer),useSystemFonts:true,isEvalSupported:false});
  const pdf=await task.promise;
  const warnings=[],chapters=[];let sparse=0;
  try{
    if(pdf.numPages>2000)throw new Error('PDF exceeds the 2,000-page import limit.');
    for(let n=1;n<=pdf.numPages;n++){
      const page=await pdf.getPage(n), content=await page.getTextContent();
      const text=content.items.map(i=>i.str+(i.hasEOL?'\n':' ')).join('').replace(/-\n(?=\p{Ll})/gu,'');
      if(text.trim().length<60)sparse++;
      const escaped=text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
      chapters.push(normalizeChapter(`<p>${escaped}</p>`,`Page ${n}`,`pdf-page-${n}`,n-1));
      page.cleanup();
    }
  } finally {await task.destroy();}
  if(sparse)warnings.push(`${sparse} PDF pages need OCR or manual review. No text was invented for scanned pages.`);
  warnings.push('PDF extraction preserves page order. Check columns, paragraphs and repeated headers before publishing.');
  return {chapters,toc:chapters.map(c=>({title:c.title,chapterId:c.id})),warnings,requiresOcr:sparse>0};
}
export function validateBook(result) {
  const errors=[];
  if(!result.chapters.length)errors.push('No readable chapters were found.');
  const words=result.chapters.reduce((n,c)=>n+c.wordCount,0);
  if(words<50)errors.push('Too little readable text was extracted.');
  if(result.chapters.length>3000)errors.push('Too many chapters.');
  if(result.chapters.reduce((n,c)=>n+c.text.length,0)>15_000_000)errors.push('Book exceeds the text limit.');
  if(new Set(result.chapters.map(c=>c.id)).size!==result.chapters.length)errors.push('Duplicate chapter identifiers.');
  const seen=new Set();let duplicates=0;
  for(const c of result.chapters){if(c.text.length>1000){const key=digest(c.text);if(seen.has(key))duplicates++;seen.add(key);}}
  if(duplicates)result.warnings.push(`${duplicates} duplicate chapter bodies need review.`);
  return {errors,warnings:result.warnings,chapters:result.chapters.length,words,requiresOcr:!!result.requiresOcr,quality:errors.length?'failed':result.warnings.length?'review':'passed'};
}
