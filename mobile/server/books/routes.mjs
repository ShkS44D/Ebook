import express from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { query } from '../db.mjs';
import { providerSearch,saveCandidates } from './providers.mjs';
import { getBook,enqueue,publish,isBookAdmin,fail } from './service.mjs';
import { readBytes,storeBytes } from './storage.mjs';
const filters=z.object({q:z.string().max(200).default(''),page:z.coerce.number().int().min(1).max(10000).default(1),language:z.string().regex(/^[a-z]{2}$/).default('en'),topic:z.string().max(80).default(''),provider:z.enum(['gutenberg','google','openlibrary','local']).default('local')});
export function registerBookRoutes(app,auth) {
  const catalogLimit=rateLimit({windowMs:60000,limit:30});
  app.get('/api/catalog/search',catalogLimit,async(req,res)=>{
    const input=filters.parse(req.query);
    if(input.provider!=='local'){
      const data=await providerSearch(input);
      if(input.provider==='gutenberg'){
        const ids=data.results.map(b=>b.id);
        const existing=await query('SELECT id,available,import_status FROM ibook.books WHERE id=ANY($1::text[])',[ids]);
        data.results=data.results.map(b=>({...b,...existing.find(e=>e.id===b.id)}));
      }
      return res.json(data);
    }
    const params=[input.q,input.topic,(input.page-1)*24];
    const where="WHERE ($1='' OR strpos(lower(b.title||' '||b.author),lower($1))>0) AND ($2='' OR b.category=$2)";
    const [count]=await query(`SELECT count(*)::int AS n FROM ibook.books b ${where}`,params.slice(0,2));
    const results=await query(`SELECT b.id,b.title,b.author,b.category,b.description,b.available,b.cover_url,b.provider,b.import_status,b.language,b.rights,b.popularity,
      CASE WHEN b.provider IS NULL THEN jsonb_array_length(b.chapters) ELSE (SELECT count(*)::int FROM ibook.book_chapters c WHERE c.book_id=b.id AND c.version=b.content_version) END AS pages
      FROM ibook.books b ${where} ORDER BY b.available DESC,b.popularity DESC,b.title LIMIT 24 OFFSET $3`,params);
    res.json({count:count.n,nextPage:input.page*24<count.n?input.page+1:null,results});
  });
  app.get('/api/books/:id/contents',async(req,res)=>{
    const b=await getBook(req.params.id,{contents:false});
    if(!b.available)fail(409,'This book is not ready to read yet.');
    res.json({id:b.id,title:b.title,author:b.author,language:b.language,available:b.available,content_version:b.content_version,toc:b.toc,
      chapters:b.chapters.map((c,i)=>({id:c.id || String(i),title:c.title,length:c.length ?? c.text.length,order:i}))});
  });
  app.get('/api/books/:id/chapters/:chapterId',async(req,res)=>{
    const [b]=await query("SELECT available,content_version,provider,CASE WHEN provider IS NULL THEN chapters ELSE '[]'::jsonb END AS chapters FROM ibook.books WHERE id=$1",[req.params.id]);
    if(!b?.available)fail(404,'Readable book not found.');
    let c;
    if(b.provider)[c]=await query('SELECT id,title,text,blocks,ordinal AS "order" FROM ibook.book_chapters WHERE book_id=$1 AND version=$2 AND id=$3',[req.params.id,b.content_version,req.params.chapterId]);
    else c=b.chapters[Number(req.params.chapterId)];
    if(!c)fail(404,'Chapter not found.');
    res.set('Cache-Control','public,max-age=3600,immutable').json({...c,content_version:b.content_version});
  });
  app.get('/api/books/:id/search',async(req,res)=>{
    const needle=z.string().trim().min(2).max(100).parse(req.query.q);
    const b=await getBook(req.params.id,{contents:false});if(!b.available)fail(404,'Readable book not found.');
    const chapters=b.provider?await query(`SELECT id,title,text,ordinal AS "order" FROM ibook.book_chapters WHERE book_id=$1 AND version=$2 AND strpos(lower(text),lower($3))>0 ORDER BY ordinal`,[b.id,b.content_version,needle]):b.chapters.map((c,i)=>({...c,order:i,id:String(i)}));
    const results=[];
    for(const c of chapters){let from=0,offset;while(results.length<100&&(offset=c.text.toLowerCase().indexOf(needle.toLowerCase(),from))!==-1){results.push({chapter:c.order,chapterId:c.id,offset,title:c.title,snippet:c.text.slice(Math.max(0,offset-50),offset+needle.length+100)});from=offset+needle.length;}}
    res.json(results);
  });
  app.get('/api/book-assets/:id',async(req,res)=>{
    const [a]=await query('SELECT a.* FROM ibook.book_assets a JOIN ibook.books b ON b.id=a.book_id WHERE a.id=$1 AND b.available',[req.params.id]);
    if(!a)fail(404,'Image not found.');
    res.set('Cross-Origin-Resource-Policy','cross-origin').set('Cache-Control','public,max-age=31536000,immutable').type(a.mime).send(await readBytes(a.storage_key));
  });
  app.post('/api/catalog/import',auth,rateLimit({windowMs:3600000,limit:20}),async(req,res)=>{
    const {id}=z.object({id:z.string().regex(/^gutenberg-[1-9]\d{0,6}$/)}).parse(req.body);
    let [b]=await query('SELECT * FROM ibook.books WHERE id=$1',[id]);
    if(!b){
      // Fetch this exact provider record; never accept a download URL or claimed rights from the client.
      const {download}=await import('./network.mjs');const {gutenbergBook}=await import('./providers.mjs');
      const base=process.env.GUTENDEX_URL || 'https://gutendex.com';
      const raw=JSON.parse((await download(`${base}/books/${id.slice(10)}`,{maxBytes:512000,extraHosts:[new URL(base).hostname]})).toString());
      b=gutenbergBook(raw);await saveCandidates([b]);
    }
    if(b.available)return res.json({bookId:b.id,status:'ready'});
    const job=await enqueue(id,{userId:req.user.id,autoPublish:true});
    res.status(202).json({bookId:id,status:job.status});
  });
  const admin=express.Router();admin.use(auth,(req,res,next)=>{if(!isBookAdmin(req.user.id))return res.status(403).json({error:'Book administrator access required.'});next();});
  admin.get('/imports',async(req,res)=>res.json(await query('SELECT i.id,i.book_id,i.status,i.source_type,i.report,i.error,i.created_at,b.title,b.author,b.rights FROM ibook.book_imports i JOIN ibook.books b ON b.id=i.book_id ORDER BY i.created_at DESC LIMIT 100')));
  admin.get('/imports/:id',async(req,res)=>{
    const [job]=await query('SELECT * FROM ibook.book_imports WHERE id=$1',[z.uuid().parse(req.params.id)]);if(!job)fail(404,'Import not found.');
    const [book]=await query('SELECT id,title,author,rights,toc FROM ibook.books WHERE id=$1',[job.book_id]);
    const chapters=await query('SELECT id,title,word_count,text_length,left(text,2500) AS preview FROM ibook.book_chapters WHERE book_id=$1 ORDER BY ordinal',[job.book_id]);
    res.json({id:job.id,status:job.status,source_type:job.source_type,report:job.report,error:job.error,book,chapters});
  });
  admin.post('/imports',async(req,res)=>{
    const {bookId}=z.object({bookId:z.string().max(100)}).parse(req.body);
    const job=await enqueue(bookId,{userId:req.user.id});res.status(202).json({id:job.id,status:job.status});
  });
  admin.post('/imports/:id/publish',async(req,res)=>res.json(await publish(z.uuid().parse(req.params.id))));
  admin.get('/imports/:id/source',async(req,res)=>{
    const [job]=await query('SELECT source_key,source_type FROM ibook.book_imports WHERE id=$1',[z.uuid().parse(req.params.id)]);if(!job?.source_key)fail(404,'Source file not available.');
    res.set('Content-Disposition',`attachment; filename="source.${job.source_type}"`).type('application/octet-stream').send(await readBytes(job.source_key));
  });
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:30*1024*1024,files:1,fields:8}});
  admin.post('/upload',upload.single('file'),async(req,res)=>{
    const input=z.object({title:z.string().trim().min(1).max(300),author:z.string().trim().min(1).max(200),type:z.enum(['epub','html','pdf']),license:z.string().trim().min(5).max(2000),countries:z.string().regex(/^[A-Z]{2}(,[A-Z]{2})*$/),language:z.string().regex(/^[a-z]{2}$/).default('en')}).parse(req.body);
    if(!req.file)fail(400,'Choose an EPUB, HTML or PDF file.');
    const key=await storeBytes(req.file.buffer),id='upload-'+randomUUID();
    await query(`INSERT INTO ibook.books(id,title,author,category,description,provider,provider_id,language,rights,import_status) VALUES($1,$2,$3,'Books','Uploaded edition','upload',$1,$4,$5,'draft')`,[id,input.title,input.author,input.language,JSON.stringify({status:'licensed',license:input.license,countries:input.countries.split(','),verifiedBy:req.user.id,verifiedAt:new Date().toISOString()})]);
    const job=await enqueue(id,{userId:req.user.id,sourceKey:key,sourceType:input.type});res.status(202).json({id:job.id,bookId:id,status:job.status});
  });
  app.use('/api/admin',admin);
}
