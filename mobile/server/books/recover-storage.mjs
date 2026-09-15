import {query,pool} from '../db.mjs';
import {readBytes,storeBytes} from './storage.mjs';
import {download} from './network.mjs';
import {digest} from './parsers.mjs';
import {unzipSync} from 'fflate';
// Recover files referenced by another machine without changing published text or offsets.
try{
  const books=await query(`SELECT DISTINCT b.id,b.formats FROM ibook.books b JOIN ibook.book_assets a ON a.book_id=b.id WHERE a.storage_key NOT LIKE 'https://%'
    UNION SELECT DISTINCT b.id,b.formats FROM ibook.books b JOIN ibook.book_imports i ON i.book_id=b.id WHERE i.source_key IS NOT NULL AND i.source_key NOT LIKE 'https://%'`);
  let completed=0;const unresolved=[];
  for(const book of books){
    try{
      const assets=await query("SELECT id,storage_key FROM ibook.book_assets WHERE book_id=$1 AND storage_key NOT LIKE 'https://%'",[book.id]);
      const jobs=await query("SELECT id,source_key,source_url,source_type,checksum FROM ibook.book_imports WHERE book_id=$1 AND source_key IS NOT NULL ORDER BY created_at DESC",[book.id]);
      const sources=new Map();
      for(const job of jobs){
        if(sources.has(job.source_url))continue;
        let bytes;
        try{bytes=await readBytes(job.source_key);}catch{if(job.source_url)bytes=await download(job.source_url,{timeoutMs:180000});}
        if(!bytes)continue;sources.set(job.source_url,bytes);
        if(digest(bytes)===job.checksum || digest(bytes)===job.source_key){
          const key=await storeBytes(bytes);await query('UPDATE ibook.book_imports SET source_key=$2 WHERE source_key=$1',[job.source_key,key]);
        }
      }
      // EPUB resources preserve the original bytes, allowing exact hash-based restoration.
      if(assets.length&&!([...sources.values()].some(b=>b[0]===80&&b[1]===75))){
        const epub=book.formats.find(f=>f.type==='epub');if(epub)sources.set(epub.url,await download(epub.url,{timeoutMs:180000}));
      }
      const found=new Map();
      for(const bytes of sources.values()){
        if(bytes[0]!==80||bytes[1]!==75)continue;
        let size=0;
        const files=unzipSync(new Uint8Array(bytes),{filter:e=>{size+=e.originalSize;if(size>100*1024*1024)throw new Error('Archive exceeds restoration limit.');return e.originalSize<=8*1024*1024;}});
        for(const content of Object.values(files))found.set(digest(content),Buffer.from(content));
      }
      let restored=0;
      for(const a of assets){
        let bytes;try{bytes=await readBytes(a.storage_key);}catch{bytes=found.get(a.storage_key);}
        if(!bytes){unresolved.push({bookId:book.id,assetId:a.id});continue;}
        const key=await storeBytes(bytes);await query('UPDATE ibook.book_assets SET storage_key=$2 WHERE id=$1',[a.id,key]);restored++;
      }
      completed++;console.log(JSON.stringify({bookId:book.id,restored,completed,total:books.length}));
    }catch(error){unresolved.push({bookId:book.id,error:error.message});console.log(JSON.stringify({bookId:book.id,recoveryError:error.message}));}
    await new Promise(resolve=>setTimeout(resolve,2500));
  }
  console.log(JSON.stringify({completed,total:books.length,unresolved}));if(unresolved.length)process.exitCode=1;
}finally{await pool.end();}
