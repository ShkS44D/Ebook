import { setTimeout as pause } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { pool,query } from '../db.mjs';
import { migrate } from '../migrate.mjs';
import { providerSearch,saveCandidates } from './providers.mjs';
import { enqueue,runNextImport,publish } from './service.mjs';
const [command,...args]=process.argv.slice(2);
const count=Math.min(10000,Math.max(1,Number(args[0])||96));
try{
  await migrate();
  if(command==='sync'){
    let synced=0,page=1;
    while(synced<count){const batch=await providerSearch({page,language:process.env.BOOK_LANGUAGE || 'en'});
      const rows=batch.results.slice(0,count-synced);await saveCandidates(rows);synced+=rows.length;
      console.log(JSON.stringify({synced,catalogueTotal:batch.count}));if(!batch.nextPage)break;page=batch.nextPage;await pause(2000);}
  }else if(command==='queue'){
    const books=await query("SELECT id FROM ibook.books WHERE provider='gutenberg' AND NOT available AND rights->>'status'='public-domain' ORDER BY popularity DESC LIMIT $1",[count]);
    for(const b of books)await enqueue(b.id,{autoPublish:args.includes('--publish-clean')});console.log(`Queued ${books.length} books.`);
  }else if(command==='work'){
    let n=0;do{const result=await runNextImport();if(!result){if(!args.includes('--watch'))break;await pause(10000);continue;}
      console.log(JSON.stringify(result));n++;await pause(2500);
    }while(args.includes('--watch')||n<count);
  }else if(command==='publish'){
    console.log(JSON.stringify(await publish(args[0])));
  }else if(command==='status'){
    console.log(JSON.stringify(await query('SELECT import_status,count(*)::int AS count FROM ibook.books GROUP BY import_status')));
  }else{throw new Error('Usage: books sync [count] | queue [count] [--publish-clean] | work [count] [--watch] | publish <import-id> | status');}
}finally{await pool.end();}
