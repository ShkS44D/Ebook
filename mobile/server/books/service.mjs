import { randomUUID } from 'node:crypto';
import { query, transaction } from '../db.mjs';
import { download } from './network.mjs';
import { parseEpub,parseHtml,parsePdf,digest,validateBook } from './parsers.mjs';
import { storeBytes,readBytes } from './storage.mjs';
export const isBookAdmin = id => (process.env.BOOK_ADMIN_IDS || '').split(',').map(s=>s.trim()).includes(id);
export const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
export async function getBook(id,{contents=true}={}) {
  const [b]=await query(`SELECT id,title,author,category,description,available,cover_url,provider,provider_id,language,rights,formats,content_version,import_status,popularity,toc,
    CASE WHEN provider IS NULL THEN chapters ELSE '[]'::jsonb END AS chapters FROM ibook.books WHERE id=$1`,[id]);
  if(!b)fail(404,'Book not found.');
  b.toc=b.toc.filter((item,index,all)=>all.findIndex(other=>other.chapterId===item.chapterId&&(other.offset || 0)===(item.offset || 0)&&other.title===item.title)===index);
  if(b.available && b.provider){
    b.chapters=await query(`SELECT id,title,ordinal AS "order",text_length AS length${contents?',text,blocks':''} FROM ibook.book_chapters WHERE book_id=$1 AND version=$2 ORDER BY ordinal`,[id,b.content_version]);
  }
  b.pages=b.chapters.length;
  return b;
}
export async function enqueue(bookId,{userId=null,autoPublish=false,sourceType,sourceKey}={}) {
  return transaction(async q=>{
    const [b]=await q('SELECT * FROM ibook.books WHERE id=$1 FOR UPDATE',[bookId]);
    if(!b)fail(404,'Book not found.');
    if(b.available)fail(409,'This edition is already published. Import a new edition to preserve saved positions.');
    if(!['public-domain','licensed'].includes(b.rights.status))fail(403,'Verified content rights are required before import.');
    const [active]=await q("SELECT * FROM ibook.book_imports WHERE book_id=$1 AND status IN ('queued','downloading','parsing','validating','review')",[bookId]);
    if(active)return active;
    const format=b.formats.find(f=>f.type==='epub') || b.formats.find(f=>f.type==='html') || b.formats.find(f=>f.type==='pdf');
    if(!sourceKey&&!format)fail(400,'No supported full-text format is available.');
    const [job]=await q(`INSERT INTO ibook.book_imports(id,book_id,source_type,source_url,source_key,auto_publish,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[randomUUID(),bookId,sourceType || format.type,format?.url || null,sourceKey || null,autoPublish,userId]);
    await q("UPDATE ibook.books SET import_status='queued' WHERE id=$1",[bookId]);return job;
  });
}
export async function publish(id) {
  return transaction(async q=>{
    const [job]=await q('SELECT * FROM ibook.book_imports WHERE id=$1 FOR UPDATE',[id]);
    if(!job)fail(404,'Import not found.');
    if(job.status==='ready')return job;
    if(job.status!=='review'||job.report.errors?.length||job.report.requiresOcr)fail(409,'This import must pass validation before publishing.');
    const [b]=await q('SELECT rights FROM ibook.books WHERE id=$1',[job.book_id]);
    if(!['public-domain','licensed'].includes(b.rights.status))fail(403,'Publication rights are not verified.');
    const [count]=await q('SELECT count(*)::int AS n FROM ibook.book_chapters WHERE book_id=$1',[job.book_id]);
    if(!count.n)fail(409,'No chapters to publish.');
    // Transitional text snapshot keeps the currently deployed reader usable during rollout.
    // New APIs read normalized chapter rows; remove this snapshot after all clients migrate.
    await q(`UPDATE ibook.books b SET available=true,import_status='ready',chapters=(SELECT jsonb_agg(jsonb_build_object('title',c.title,'text',c.text) ORDER BY c.ordinal) FROM ibook.book_chapters c WHERE c.book_id=b.id AND c.version=b.content_version) WHERE b.id=$1`,[job.book_id]);
    const [ready]=await q("UPDATE ibook.book_imports SET status='ready',updated_at=now() WHERE id=$1 RETURNING *",[id]);return ready;
  });
}
export async function runNextImport() {
  const job=await transaction(async q=>{
    // Recover interrupted workers; SKIP LOCKED prevents duplicate work across processes.
    await q("UPDATE ibook.book_imports SET status='queued',lease_until=NULL WHERE status IN ('downloading','parsing','validating') AND lease_until<now() AND attempts<3");
    await q("UPDATE ibook.book_imports SET status='failed',error='Worker interrupted repeatedly.',lease_until=NULL WHERE status IN ('downloading','parsing','validating') AND lease_until<now() AND attempts>=3");
    const [next]=await q("SELECT * FROM ibook.book_imports WHERE status='queued' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1");
    if(!next)return null;
    await q("UPDATE ibook.book_imports SET status='downloading',attempts=attempts+1,lease_until=now()+interval '10 minutes',updated_at=now() WHERE id=$1",[next.id]);
    return next;
  });
  if(!job)return null;
  const heartbeat=setInterval(()=>{void query("UPDATE ibook.book_imports SET lease_until=now()+interval '10 minutes' WHERE id=$1",[job.id]).catch(()=>{});},30000);
  try{
    let buffer;
    if(job.source_key)buffer=await readBytes(job.source_key);
    else{
      const [sourceBook]=await query('SELECT formats FROM ibook.books WHERE id=$1',[job.book_id]);
      const candidates=[{type:job.source_type,url:job.source_url},...sourceBook.formats.filter(f=>f.url!==job.source_url)];
      let lastError;
      for(const candidate of candidates){try{buffer=await download(candidate.url,{timeoutMs:180000});job.source_type=candidate.type;job.source_url=candidate.url;break;}catch(error){lastError=error;}}
      if(!buffer)throw lastError || new Error('No source file available.');
    }
    const sourceKey=job.source_key || await storeBytes(buffer);
    await query("UPDATE ibook.book_imports SET status='parsing',source_key=$2,checksum=$3,source_type=$4,source_url=$5,updated_at=now() WHERE id=$1",[job.id,sourceKey,digest(buffer),job.source_type,job.source_url]);
    const saveAsset=async(bytes,mime,reference)=>{
      const id=digest(job.book_id+reference+digest(bytes));const key=await storeBytes(bytes);
      await query('INSERT INTO ibook.book_assets(id,book_id,mime,storage_key,byte_size) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET storage_key=EXCLUDED.storage_key',[id,job.book_id,mime,key,bytes.length]);
      return '/api/book-assets/'+id;
    };
    let result=await ({epub:parseEpub,html:parseHtml,pdf:parsePdf}[job.source_type])(buffer,saveAsset,job.source_url);
    if(job.source_type==='pdf'&&result.requiresOcr){
      const {recognizePdf}=await import('./ocr.mjs');const recognized=await recognizePdf(buffer);
      if(recognized){result=await parsePdf(recognized);result.warnings.push('OCR was applied. Compare extracted text with the original before publishing.');}
    }
    const report=validateBook(result);
    await query("UPDATE ibook.book_imports SET status='validating',report=$2,updated_at=now() WHERE id=$1",[job.id,JSON.stringify(report)]);
    if(report.errors.length)throw new Error(report.errors.join(' '));
    await transaction(async q=>{
      const [b]=await q('SELECT * FROM ibook.books WHERE id=$1 FOR UPDATE',[job.book_id]);
      if(b.available)throw new Error('Published editions are immutable.');
      await q('DELETE FROM ibook.book_chapters WHERE book_id=$1',[b.id]);
      await q(`INSERT INTO ibook.book_chapters(book_id,version,id,ordinal,title,html,text,blocks,source_reference,word_count,text_length)
        SELECT $1,$2,c.id,c.ordinal,c.title,c.html,c.text,c.blocks,c.source_reference,c.word_count,c.text_length
        FROM jsonb_to_recordset($3::jsonb) AS c(id text,ordinal integer,title text,html text,text text,blocks jsonb,source_reference text,word_count integer,text_length integer)`,
        [b.id,b.content_version,JSON.stringify(result.chapters.map(c=>({id:c.id,ordinal:c.order,title:c.title,html:c.html,text:c.text,blocks:c.blocks,source_reference:c.sourceReference,word_count:c.wordCount,text_length:c.text.length})))]);
      await q("UPDATE ibook.books SET toc=$2,import_status='review' WHERE id=$1",[b.id,JSON.stringify(result.toc)]);
      await q("UPDATE ibook.book_imports SET status='review',report=$2,error=NULL,lease_until=NULL,updated_at=now() WHERE id=$1",[job.id,JSON.stringify(report)]);
    });
    if(job.auto_publish&&report.quality==='passed')await publish(job.id);
    return {id:job.id,bookId:job.book_id,status:job.auto_publish&&report.quality==='passed'?'ready':'review',report};
  }catch(error){
    await query("UPDATE ibook.book_imports SET status='failed',error=$2,lease_until=NULL,updated_at=now() WHERE id=$1",[job.id,error.message.slice(0,1000)]);
    await query("UPDATE ibook.books SET import_status='failed' WHERE id=$1 AND NOT available",[job.book_id]);
    return {id:job.id,bookId:job.book_id,status:'failed',error:error.message};
  }finally{clearInterval(heartbeat);}
}
