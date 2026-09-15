import { download, mirrorUrl } from './network.mjs';
import { query } from '../db.mjs';
const categories = ['Adventure','Fantasy','Romance','History','Horror','Poetry','Science','Philosophy','Children'];
export function gutenbergBook(b) {
  const formats = Object.entries(b.formats || {}).flatMap(([mime,url]) => {
    const type = mime === 'application/epub+zip' ? 'epub' : mime.startsWith('text/html') && !url.endsWith('.zip') ? 'html' : mime === 'application/pdf' ? 'pdf' : null;
    return type ? [{ type, url: mirrorUrl(url) }] : [];
  }).sort((a,b) => ['epub','html','pdf'].indexOf(a.type) - ['epub','html','pdf'].indexOf(b.type));
  const subjects = [...b.subjects || [], ...b.bookshelves || []].join(' ');
  return { id: 'gutenberg-' + b.id, provider: 'gutenberg', provider_id: String(b.id),
    title: b.title, author: (b.authors || []).map(a => a.name).join(', ') || 'Unknown author',
    category: categories.find(c => subjects.toLowerCase().includes(c.toLowerCase())) || 'Classics',
    description: b.summaries?.join('\n\n') || subjects || `${b.title}, from Project Gutenberg.`,
    language: b.languages?.[0] || 'und', cover_url: b.formats?.['image/jpeg'] ? mirrorUrl(b.formats['image/jpeg']) : null,
    rights: { status: b.copyright === false ? 'public-domain' : 'unknown', countries: ['US'],
      source: `https://www.gutenberg.org/ebooks/${b.id}`, license: 'Project Gutenberg License', verifiedAt: new Date().toISOString() },
    formats, popularity: b.download_count || 0, available: false, import_status: 'discoverable' };
}
export async function providerSearch({ provider = 'gutenberg', q = '', page = 1, language = 'en', topic = '' } = {}) {
  const cacheKey = JSON.stringify({ provider,q,page,language,topic });
  const [cached] = await query('SELECT payload FROM ibook.provider_cache WHERE key=$1 AND expires_at>now()', [cacheKey]);
  if (cached) return cached.payload;
  let result;
  if (provider === 'gutenberg') {
    const base = process.env.GUTENDEX_URL || 'https://gutendex.com';
    const url = new URL(base + '/books/');
    url.search = new URLSearchParams({page:String(page),...(q?{search:q}:{}),...(language!=='en'?{languages:language}:{}),...(topic?{topic}:{})}).toString();
    const data = JSON.parse((await download(url.href, {maxBytes:3*1024*1024, extraHosts:[new URL(base).hostname]})).toString());
    result = { count:data.count,countLabel:'titles in the source catalogue',nextPage:data.next ? page+1 : null,results:data.results.filter(b=>b.copyright===false && b.formats?.['application/epub+zip'] && (b.languages || []).includes(language)).map(gutenbergBook) };
  } else if (provider === 'google') {
    const url = new URL('https://www.googleapis.com/books/v1/volumes');
    url.search = new URLSearchParams({q:q || 'classic literature',startIndex:String((page-1)*20),maxResults:'20',...(process.env.GOOGLE_BOOKS_API_KEY ? {key:process.env.GOOGLE_BOOKS_API_KEY} : {})}).toString();
    const data = JSON.parse((await download(url.href,{maxBytes:3*1024*1024})).toString());
    result = {count:data.totalItems || 0,nextPage:data.items?.length === 20 ? page+1 : null,results:(data.items || []).map(b => ({id:'google-'+b.id,title:b.volumeInfo.title,author:b.volumeInfo.authors?.join(', ') || 'Unknown author',description:b.volumeInfo.description || '',category:b.volumeInfo.categories?.[0] || 'Books',cover_url:b.volumeInfo.imageLinks?.thumbnail?.replace(/^http:/,'https:'),provider:'google',provider_id:b.id,available:false,rights:{status:'preview',countries:[b.accessInfo?.country].filter(Boolean)},external_url:b.volumeInfo.previewLink,access_label:'View preview'}))};
  } else {
    const url = new URL('https://openlibrary.org/search.json');
    url.search = new URLSearchParams({q:q || 'classics',page:String(page),limit:'20',fields:'key,title,author_name,cover_i'}).toString();
    const data = JSON.parse((await download(url.href,{maxBytes:3*1024*1024})).toString());
    result = {count:data.numFound,nextPage:page*20<data.numFound ? page+1:null,results:data.docs.map(b=>({id:'openlibrary-'+b.key.split('/').pop(),title:b.title,author:b.author_name?.join(', ') || 'Unknown author',description:'Explore editions and borrowing options on Open Library.',category:'Books',provider:'openlibrary',available:false,cover_url:b.cover_i ? `https://covers.openlibrary.org/b/id/${b.cover_i}-M.jpg`:null,external_url:'https://openlibrary.org'+b.key,access_label:'View editions'}))};
  }
  await query("INSERT INTO ibook.provider_cache VALUES($1,$2,now()+interval '1 hour') ON CONFLICT(key) DO UPDATE SET payload=$2,expires_at=EXCLUDED.expires_at",[cacheKey,JSON.stringify(result)]);
  return result;
}
export async function saveCandidates(candidates) {
  for (const b of candidates) {
    if (b.provider !== 'gutenberg') continue;
    await query(`INSERT INTO ibook.books(id,title,author,category,description,provider,provider_id,language,cover_url,rights,formats,popularity,import_status)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'discoverable') ON CONFLICT(id) DO UPDATE SET popularity=EXCLUDED.popularity`,
      [b.id,b.title,b.author,b.category,b.description,b.provider,b.provider_id,b.language,b.cover_url,JSON.stringify(b.rights),JSON.stringify(b.formats),b.popularity]);
  }
}
