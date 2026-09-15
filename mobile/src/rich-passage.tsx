import React from 'react';
import {Image,Text,View} from 'react-native';
import {apiBase} from './store';
import type {Chapter,ReaderPage} from './reader-model';
export function RichPassage({chapter,page,textStyle,highlight,onLink}: {chapter:Chapter;page:ReaderPage;textStyle:any;highlight:string;onLink:(href:string)=>void}){
  const spans=(chapter.blocks || []).filter(b=>b.type==='text'&&b.end>page.offset&&b.start<page.end);
  function marked(text:string,key:string){
    const needle=highlight.trim().toLowerCase();if(!needle)return text;
    const parts:React.ReactNode[]=[];let from=0,index;
    while((index=text.toLowerCase().indexOf(needle,from))>=0){parts.push(text.slice(from,index));parts.push(<Text key={key+index} style={{backgroundColor:'#E7BE5E',color:'#302719'}}>{text.slice(index,index+needle.length)}</Text>);from=index+needle.length;}
    parts.push(text.slice(from));return parts;
  }
  const pieces:React.ReactNode[]=[];let cursor=page.offset;
  for(const [i,b] of spans.entries()){
    const start=Math.max(page.offset,b.start),end=Math.min(page.end,b.end);
    if(start>cursor)pieces.push(chapter.text.slice(cursor,start));
    pieces.push(<Text key={i} style={{...(b.bold?{fontWeight:'700'}:{}),...(b.italic?{fontStyle:'italic'}:{}),...(b.href?{textDecorationLine:'underline'}:{})}} onPress={b.href?(e)=>{e.stopPropagation();onLink(b.href);}:undefined}>{marked(chapter.text.slice(start,end),String(i))}</Text>);cursor=end;
  }
  if(cursor<page.end)pieces.push(marked(chapter.text.slice(cursor,page.end),'end'));
  const images=(chapter.blocks || []).filter(b=>b.type==='image'&&b.start>=page.offset&&(b.start<page.end || (page.end===chapter.text.length&&b.start===page.end)));
  return <View><Text testID="reader-text" style={textStyle}>{pieces}</Text>{images.map((b,i)=><View key={i} style={{marginVertical:16}}><Image accessibilityLabel={b.alt} source={{uri:b.src.startsWith('/')?apiBase+b.src:b.src}} resizeMode="contain" style={{width:'100%',height:240}}/><Text style={{color:textStyle.color,fontSize:12,textAlign:'center'}}>{b.alt}</Text></View>)}</View>;
}
