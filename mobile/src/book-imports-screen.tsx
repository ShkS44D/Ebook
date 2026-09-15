import React,{useCallback,useState} from 'react';
import {Linking,Platform,View} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import {api,apiBase,useStore} from './store';
import {Button,Card,Field,Header,Page,Txt,Title} from './ui';
import {Feedback,RequireAccount,useAction} from './functional-ui';
export function BookImportsScreen({navigation}:any){
  const store=useStore(),action=useAction();
  const [jobs,setJobs]=useState<any[]>([]),[selected,setSelected]=useState<any>(null);
  const [title,setTitle]=useState(''),[author,setAuthor]=useState(''),[license,setLicense]=useState(''),[countries,setCountries]=useState('US');
  const refresh=useCallback(async()=>setJobs(await api('/admin/imports')),[]);
  useFocusEffect(useCallback(()=>{if(store.user?.book_admin)void action.run(refresh);},[store.user?.book_admin]));
  return <RequireAccount navigation={navigation}><Page><Header navigation={navigation}/><Title>Book imports</Title>
    {!store.user?.book_admin?<Txt>This area is available to book administrators.</Txt>:<>
      <Txt style={{marginBottom:20}}>Review editions, check extraction quality, and publish books to the reader.</Txt>
      <Card><Txt bold>Upload an authorized edition</Txt>
        <Field label="Book title" value={title} onChangeText={setTitle}/><Field label="Author" value={author} onChangeText={setAuthor}/>
        <Field label="License or permission details" value={license} onChangeText={setLicense}/><Field label="Permitted country codes (US,PK,…)" value={countries} onChangeText={setCountries}/>
        <Button title="Choose EPUB, HTML or PDF" disabled={action.busy||!title.trim()||!author.trim()||license.trim().length<5} onPress={()=>void action.run(async()=>{
          const picked=await DocumentPicker.getDocumentAsync({type:['application/epub+zip','text/html','application/pdf'],copyToCacheDirectory:true});
          if(picked.canceled)return;const file=picked.assets[0];if((file.size || 0)>30*1024*1024)throw new Error('Choose a file smaller than 30 MB.');
          const extension=file.name.toLowerCase().split('.').pop();const type=extension==='htm'?'html':extension;
          if(!['epub','html','pdf'].includes(type || ''))throw new Error('Choose an EPUB, HTML or PDF.');
          const data=new FormData();data.append('title',title);data.append('author',author);data.append('license',license);data.append('countries',countries.toUpperCase());data.append('type',type!);
          if(Platform.OS==='web')data.append('file',await (await fetch(file.uri)).blob(),file.name);
          else data.append('file',{uri:file.uri,name:file.name,type:file.mimeType || 'application/octet-stream'} as any);
          await api('/admin/upload','POST',data);await refresh();
        })}/>
      </Card>
      <Feedback {...action}/><Button title="Refresh imports" secondary disabled={action.busy} onPress={()=>void action.run(refresh)}/>
      {selected&&<Card style={{marginVertical:20}}><Txt bold size={20}>{selected.book.title}</Txt><Txt>{selected.book.author} · {selected.status}</Txt>
        <Txt style={{marginVertical:12}}>{selected.book.rights.license} · {(selected.book.rights.countries || []).join(', ')}</Txt>
        <Txt>{selected.report.chapters || 0} chapters · {(selected.report.words || 0).toLocaleString()} words</Txt>
        {[...(selected.report.errors || []),...(selected.report.warnings || [])].map((message:string,i:number)=><Txt key={i} style={{marginTop:8}}>{message}</Txt>)}
        {!!selected.error&&<Txt color="#C03845">{selected.error}</Txt>}
        {selected.chapters.map((c:any)=><View key={c.id} style={{marginTop:20}}><Txt bold>{c.title}</Txt><Txt size={12}>{c.word_count} words</Txt><Txt selectable style={{marginTop:8}}>{c.preview}</Txt></View>)}
        <Button title="Download original for comparison" secondary onPress={()=>void Linking.openURL(apiBase+'/api/admin/imports/'+selected.id+'/source')}/>
        <Button title="Publish to reader" disabled={action.busy||selected.status!=='review'||!!selected.report.errors?.length||selected.report.requiresOcr} onPress={()=>void action.run(async()=>{await api('/admin/imports/'+selected.id+'/publish','POST',{});setSelected(null);await refresh();await store.loadBooks();})}/>
        <Button title="Close preview" secondary onPress={()=>setSelected(null)}/>
      </Card>}
      {jobs.map(job=><Card key={job.id} style={{marginVertical:8}}><Txt bold>{job.title}</Txt><Txt>{job.status} · {job.source_type.toUpperCase()}</Txt>{!!job.error&&<Txt>{job.error}</Txt>}
        <Button title="Review import" secondary disabled={action.busy} onPress={()=>void action.run(async()=>setSelected(await api('/admin/imports/'+job.id)))}/>
      </Card>)}
    </>}
  </Page></RequireAccount>;
}
