import { Platform } from 'react-native';
import { File,Paths,Directory } from 'expo-file-system';
// Content is public/authorized book data. Account data is never stored in this cache.
const cacheName='ibook-chapters-v1';
export async function cachedBookData(key:string,value?:unknown):Promise<any>{
  try{
    if(Platform.OS==='web'){
      if(typeof caches==='undefined')return null;
      const cache=await caches.open(cacheName),url=new URL('/__book_cache__/'+encodeURIComponent(key),window.location.origin).href;
      if(value!==undefined){await cache.put(url,new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}}));
        const keys=await cache.keys();for(const old of keys.slice(0,Math.max(0,keys.length-150)))await cache.delete(old);return value;}
      const hit=await cache.match(url);return hit?await hit.json():null;
    }
    const directory=new Directory(Paths.cache,'book-content');directory.create({idempotent:true,intermediates:true});
    const file=new File(directory,encodeURIComponent(key)+'.json');
    if(value!==undefined){file.write(JSON.stringify(value));return value;}
    return file.exists?JSON.parse(await file.text()):null;
  }catch{return null;}
}
