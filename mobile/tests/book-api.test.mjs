import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const base=process.env.TEST_API_URL;
test('imported books integrate with catalogue, chapter loading, search and saved positions',{skip:!base},async()=>{
  const {query,pool}=await import('../server/db.mjs');let userId;
  async function request(path,options={},expected=200){
    const r=await fetch(base+path,{...options,headers:{'Content-Type':'application/json',...options.headers}});
    const result=await r.json();assert.equal(r.status,expected,JSON.stringify(result));return result;
  }
  try{
    const first=await request('/catalog/search');assert.ok(first.count>=first.results.length);assert.equal(first.results.length,24);
    const second=await request('/catalog/search?page=2');assert.ok(second.results.every(b=>!first.results.some(a=>a.id===b.id)));
    await request('/catalog/search?page=-1',{},400);
    const pilots=first.results.filter(b=>b.available&&b.provider==='gutenberg').slice(0,3);
    assert.equal(pilots.length,3,'Import at least three Gutenberg books before running the integration suite.');
    for(const pilot of pilots){
      const contents=await request('/books/'+pilot.id+'/contents');
      assert.ok(contents.chapters.length>0);
      for(const index of new Set([0,contents.chapters.length-1])){
        const chapter=await request(`/books/${pilot.id}/chapters/${contents.chapters[index].id}`);
        assert.equal(chapter.text.length,contents.chapters[index].length);
        assert.ok(chapter.text.trim().length>0);
      }
      for(const item of contents.toc){
        const chapter=contents.chapters.find(c=>c.id===item.chapterId);
        assert.ok(chapter,'Contents must reference an existing chapter');
        assert.ok((item.offset || 0)>=0&&(item.offset || 0)<=chapter.length);
      }
    }
    const b=pilots[0];
    const contents=await request('/books/'+b.id+'/contents');assert.ok(contents.chapters.length>0);
    assert.ok(contents.chapters.every(c=>!('text' in c)&&typeof c.length==='number'));
    const chapter=await request(`/books/${b.id}/chapters/${contents.chapters[0].id}`);
    assert.equal(chapter.text.length,contents.chapters[0].length);
    const target=chapter.text.match(/[A-Za-z]{6,}/)?.[0];assert.ok(target);
    const matches=await request(`/books/${b.id}/search?q=${encodeURIComponent(target)}`);assert.ok(matches.length);
    const matched=await request(`/books/${b.id}/chapters/${matches[0].chapterId}`);
    assert.equal(matched.text.slice(matches[0].offset,matches[0].offset+target.length).toLowerCase(),target.toLowerCase());
    const user=await request('/auth/signup',{method:'POST',headers:{'X-iBook-Client':'native'},body:JSON.stringify({email:`book-qa-${randomUUID()}@example.invalid`,name:'Book pipeline QA',password:'QA-only-'+randomUUID()})},201);
    userId=user.user.id;const headers={Authorization:'Bearer '+user.token};
    const position=await request('/library/'+b.id,{method:'PUT',headers,body:JSON.stringify({page:0,reader_offset:25,bookmarks:[{chapter:0,offset:25}]})});
    assert.equal(position.reader_offset,25);assert.equal(position.reader_anchor.chapterId,chapter.id);
    await request('/library/'+b.id,{method:'PUT',headers,body:JSON.stringify({page:0,reader_offset:chapter.text.length+1})},400);
    await request('/admin/imports',{headers},403);
    await request('/admin/imports',{},401);
    await request('/catalog/import',{method:'POST',headers,body:JSON.stringify({id:'http://127.0.0.1'})},400);
    const ready=await request('/catalog/import',{method:'POST',headers,body:JSON.stringify({id:b.id})});assert.equal(ready.status,'ready');
    const draft=await query("SELECT id FROM ibook.books WHERE provider='gutenberg' AND NOT available LIMIT 1");
    if(draft.length){await request('/books/'+draft[0].id+'/contents',{},409);await request('/books/'+draft[0].id+'/chapters/anything',{},404);}
  }finally{if(userId)await query('DELETE FROM ibook.users WHERE id=$1',[userId]);await pool.end();}
});
