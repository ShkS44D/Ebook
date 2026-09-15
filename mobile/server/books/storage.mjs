import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { put, get } from '@vercel/blob';
import { digest } from './hash.mjs';
const root=path.resolve(process.env.BOOK_STORAGE_DIR || 'book-storage');
export async function storeBytes(bytes) {
  const key=digest(bytes);
  if(process.env.BOOK_BLOB_READ_WRITE_TOKEN){
    const b=await put(`books/${key}`,bytes,{access:'private',addRandomSuffix:false,allowOverwrite:true,token:process.env.BOOK_BLOB_READ_WRITE_TOKEN});
    return b.url;
  }
  if(process.env.VERCEL)throw new Error('Configure private BOOK_BLOB_READ_WRITE_TOKEN for persistent book storage.');
  await mkdir(root,{recursive:true});await writeFile(path.join(root,key),bytes);return key;
}
export async function readBytes(key) {
  if(key.startsWith('https://')){
    const response=await get(key,{access:'private',token:process.env.BOOK_BLOB_READ_WRITE_TOKEN});
    if(!response || response.statusCode!==200)throw new Error('Stored book file is unavailable.');
    return Buffer.from(await new Response(response.stream).arrayBuffer());
  }
  if(!/^[a-f0-9]{64}$/.test(key))throw new Error('Invalid storage key.');
  return readFile(path.join(root,key));
}
