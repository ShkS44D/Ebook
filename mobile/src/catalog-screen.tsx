import React,{useEffect,useRef,useState} from 'react';
import {FlatList,Linking,View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {api,catalogBook,useStore} from './store';
import {BookCover,BookRow,Button,Card,Field,Header,Page,Txt,Title,useTheme} from './ui';
import {Feedback,useAction} from './functional-ui';
const sources=[['local','In iBook'],['gutenberg','Public-domain books'],['google','Google Books'],['openlibrary','Open Library']];
export function CatalogScreen({navigation,title='Discover',initialQuery='',topic=''}:any){
  const t=useTheme(),insets=useSafeAreaInsets();
  const [q,setQ]=useState(initialQuery),[provider,setProvider]=useState('local'),[language,setLanguage]=useState('en');
  const [items,setItems]=useState<any[]>([]),[count,setCount]=useState(0),[next,setNext]=useState<number|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0);
  const generation=useRef(0),locked=useRef(false);
  async function load(page:number,epoch:number){
    locked.current=true;setBusy(true);setError('');
    try{const result=await api('/catalog/search?'+new URLSearchParams({q,provider,page:String(page),language,topic}).toString());
      if(epoch!==generation.current)return;
      setItems(previous=>page===1?result.results:previous.concat(result.results.filter((b:any)=>!previous.some(p=>p.id===b.id))));setCount(result.count);setNext(result.nextPage);
    }catch(e:any){if(epoch===generation.current)setError(e.message);}
    finally{if(epoch===generation.current){setBusy(false);locked.current=false;}}
  }
  useEffect(()=>{const epoch=++generation.current;setItems([]);setNext(null);setBusy(true);locked.current=true;
    const timer=setTimeout(()=>void load(1,epoch),300);return()=>{clearTimeout(timer);generation.current++;};},[q,provider,language,topic,revision]);
  return <View style={{flex:1,backgroundColor:t.bg,paddingTop:insets.top}}>
    <FlatList data={items} keyExtractor={b=>b.id} initialNumToRender={12} maxToRenderPerBatch={12} windowSize={5}
      contentContainerStyle={{padding:24,paddingBottom:insets.bottom+125,width:'100%',maxWidth:900,alignSelf:'center'}}
      ListHeaderComponent={<View>
        {!!topic&&<Button title="Back" secondary onPress={()=>navigation.goBack()}/>}
        <Title>{topic || title}</Title>
        <Txt style={{marginBottom:20}}>Find a story to settle into. Books marked “Read free” are ready in your reader.</Txt>
        <Field label="Search books or authors" placeholder="Enter a title or author" icon="search-outline" value={q} onChangeText={setQ}/>
        <View style={{flexDirection:'row',flexWrap:'wrap',gap:8,marginBottom:16}}>{sources.map(([id,label])=><Button key={id} title={label} secondary={provider!==id} onPress={()=>setProvider(id)}/>)}</View>
        {provider==='gutenberg'&&<View style={{flexDirection:'row',flexWrap:'wrap',gap:8,marginBottom:16}}>{[['en','English'],['fr','French'],['es','Spanish']].map(([id,label])=><Button key={id} title={label} secondary={language!==id} onPress={()=>setLanguage(id)}/>)}</View>}
        {provider==='gutenberg'&&<Txt size={12} style={{marginBottom:16}}>Public-domain status is reported for the United States. Availability elsewhere depends on local rights. Books are prepared once for the iBook reader.</Txt>}
        <Txt bold style={{marginBottom:20}}>{busy&&!items.length?'Finding books…':`${count.toLocaleString()} ${provider==='gutenberg'?'titles in the source catalogue':'books'}`}</Txt>
      </View>}
      renderItem={({item})=><BookRow book={catalogBook(item)} onPress={()=>navigation.navigate(item.provider&&item.provider!=='upload'&&provider!=='local'?'CatalogBook':'Book',{bookId:item.id,book:item})}/>}
      ListEmptyComponent={!busy&&!error?<Txt>No books found. Try another title, author, or source.</Txt>:null}
      ListFooterComponent={<View><Feedback error={error} busy={busy}/>{!!error&&<Button title="Try again" onPress={()=>setRevision(n=>n+1)}/>}{next&&!busy&&!error&&<Button title="Load more books" secondary onPress={()=>{if(!locked.current)void load(next,generation.current);}}/>}</View>}
    />
  </View>;
}
export function CatalogBookScreen({navigation,route}:any){
  const b=route.params.book,store=useStore(),action=useAction();
  return <Page><Header navigation={navigation}/><View style={{alignSelf:'center',marginBottom:20}}><BookCover book={catalogBook(b)} large/></View>
    <Title>{b.title}</Title><Txt bold>{b.author}</Txt><Txt style={{marginVertical:20}}>{b.description}</Txt>
    {b.external_url?<Button title={b.access_label} onPress={()=>void Linking.openURL(b.external_url)}/>:<>
      <Card><Txt>{b.available?'This book is ready to read in iBook.':'Prepare this edition for your library. You can return to it while the chapters are being prepared.'}</Txt></Card>
      <Feedback {...action}/><Button title={b.available?'Open book':'Add to iBook'} disabled={action.busy} onPress={()=>{
        if(!store.user){navigation.navigate('SignIn');return;}
        void action.run(async()=>{if(!b.available)await api('/catalog/import','POST',{id:b.id});await store.loadBooks();navigation.navigate('Book',{bookId:b.id});});
      }}/>
    </>}
  </Page>;
}
