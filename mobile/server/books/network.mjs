// Downloads only target administrator-configured providers, never arbitrary client URLs.
export const MAX_DOWNLOAD = 30 * 1024 * 1024;
export function allowedUrl(value, extraHosts = []) {
  const u = new URL(value);
  const allowed = ['gutendex.com', 'gutenberg.pglaf.org', 'mirror.cs.odu.edu',
    'www.googleapis.com', 'openlibrary.org', 'covers.openlibrary.org',
    ...(process.env.BOOK_DOWNLOAD_HOSTS || '').split(',').map(s => s.trim()), ...extraHosts];
  if (u.protocol !== 'https:' || u.username || u.password || u.port || !allowed.includes(u.hostname))
    throw new Error('This download host is not configured.');
  return u;
}
export async function download(value, { maxBytes = MAX_DOWNLOAD, extraHosts = [], timeoutMs = 45000 } = {}) {
  let url = allowedUrl(value, extraHosts);
  const signal = AbortSignal.timeout(timeoutMs);
  for (let redirects = 0; redirects < 4; redirects++) {
    const response = await fetch(url, { redirect: 'manual', signal, headers: { 'User-Agent': 'iBook-Importer/1.0' } });
    if ([301,302,303,307,308].includes(response.status)) {
      await response.body?.cancel();
      url = allowedUrl(new URL(response.headers.get('location'), url).href, extraHosts);
      continue;
    }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`Book provider returned ${response.status}.`); }
    if (Number(response.headers.get('content-length')) > maxBytes) {
      await response.body?.cancel(); throw new Error('Book exceeds the import size limit.');
    }
    const chunks = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > maxBytes) throw new Error('Book exceeds the import size limit.');
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
  throw new Error('Too many provider redirects.');
}
export function mirrorUrl(value) {
  const u = new URL(value);
  const generated=u.pathname.match(/^\/ebooks\/(\d+)\.(epub3\.images|epub\.images|epub\.noimages|html\.images)$/);
  if(generated&&['www.gutenberg.org','gutenberg.org','gutenberg.pglaf.org'].includes(u.hostname)){
    const [,id,format]=generated;
    const filename=format==='html.images'?`pg${id}-images.html`:format==='epub.noimages'?`pg${id}.epub`:`pg${id}-images${format==='epub3.images'?'-3':''}.epub`;
    return `https://gutenberg.pglaf.org/cache/epub/${id}/${filename}`;
  }
  if (!['www.gutenberg.org', 'gutenberg.org'].includes(u.hostname)) return allowedUrl(value).href;
  return allowedUrl('https://gutenberg.pglaf.org' + u.pathname + u.search).href;
}
