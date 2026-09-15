import { query,pool } from '../db.mjs';
import { readBytes,storeBytes } from './storage.mjs';
if(!process.env.BOOK_BLOB_READ_WRITE_TOKEN)throw new Error('Configure private book storage before migrating files.');
try{
  const keys=await query(`SELECT DISTINCT storage_key AS key FROM ibook.book_assets WHERE storage_key NOT LIKE 'https://%'
    UNION SELECT DISTINCT source_key AS key FROM ibook.book_imports WHERE source_key IS NOT NULL AND source_key NOT LIKE 'https://%'`);
  let migrated=0;const missing=[];
  async function transfer({key}){
    try{
      const bytes=await readBytes(key),remote=await storeBytes(bytes);
      await query('UPDATE ibook.book_assets SET storage_key=$2 WHERE storage_key=$1',[key,remote]);
      await query('UPDATE ibook.book_imports SET source_key=$2 WHERE source_key=$1',[key,remote]);
      migrated++;if(migrated%20===0)console.log(JSON.stringify({migrated,total:keys.length}));
    }catch(error){missing.push({key,error:error.message});}
  }
  // Independent content-addressed files can transfer concurrently without overwrites.
  let cursor=0;
  await Promise.all(Array.from({length:4},async()=>{while(cursor<keys.length)await transfer(keys[cursor++]);}));
  console.log(JSON.stringify({migrated,total:keys.length,missing}));
  if(missing.length)process.exitCode=1;
}finally{await pool.end();}
