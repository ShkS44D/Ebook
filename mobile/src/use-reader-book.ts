import {useCallback,useEffect,useRef,useState} from 'react';
import {api} from './store';
import {cachedBookData} from './book-cache';
export function useReaderBook(id:string,chapterIndex:number){
  const [book,setBook]=useState<any>(null),[error,setError]=useState('');
  const generation=useRef(0),pending=useRef(new Map<string,Promise<any>>());
  useEffect(()=>{const request=++generation.current;setBook(null);setError('');
    void (async()=>{try{const b=await api('/books/'+encodeURIComponent(id)+'/contents');if(generation.current===request)setBook(b);await cachedBookData(id+':contents',b);}
      catch(e:any){const cached=await cachedBookData(id+':contents');if(generation.current===request){if(cached&&!e.status)setBook(cached);else setError(e.message);}}})();
    return()=>{generation.current++;pending.current.clear();};},[id]);
  const loadChapter=useCallback(async(index:number)=>{
    const chapter=book?.id===id?book.chapters[index]:null;if(!chapter)return null;if(chapter.text!==undefined)return chapter;
    const request=generation.current;
    const key=id+':'+book.content_version+':'+chapter.id;
    if(pending.current.has(key))return pending.current.get(key);
    const work=(async()=>{
      const cached=await cachedBookData(key);let result=cached;
      if(!result){result=await api('/books/'+encodeURIComponent(id)+'/chapters/'+encodeURIComponent(chapter.id));await cachedBookData(key,result);}
      if(generation.current===request)setBook((previous:any)=>previous?.id===id&&previous.content_version===book.content_version?({...previous,chapters:previous.chapters.map((c:any)=>c.id===chapter.id?{...c,...result}:c)}):previous);
      return result;
    })().finally(()=>{if(pending.current.get(key)===work)pending.current.delete(key);});pending.current.set(key,work);return work;
  },[id,book]);
  useEffect(()=>{if(!book)return;let relevant=true;setError('');
    void loadChapter(chapterIndex).then(()=>{if(relevant&&chapterIndex+1<book.chapters.length)void loadChapter(chapterIndex+1).catch(()=>{});})
      .catch(e=>{if(relevant)setError(e.message);});return()=>{relevant=false;};
  },[book?.id,book?.content_version,chapterIndex,book?.chapters[chapterIndex]?.text]);
  return {book,error,loadChapter};
}
