import React from 'react';
import {Image,Platform,Text,View} from 'react-native';
import {apiBase} from './store';
import type {Chapter,ReaderPage} from './reader-model';
import { passageSegments, passageBlocks, paragraphStyle } from './reader-layout';
export function RichPassage({chapter,page,textStyle,highlight,onLink,imageHeight=240}: {chapter:Chapter;page:ReaderPage;textStyle:any;highlight:string;imageHeight?:number;onLink:(href:string)=>void}){
  function marked(text:string,key:string){
    const needle=highlight.trim().toLowerCase();if(!needle)return text;
    const parts:React.ReactNode[]=[];let from=0,index;
    while((index=text.toLowerCase().indexOf(needle,from))>=0){parts.push(text.slice(from,index));parts.push(<Text key={key+index} style={{backgroundColor:'#E7BE5E',color:'#302719'}}>{text.slice(index,index+needle.length)}</Text>);from=index+needle.length;}
    parts.push(text.slice(from));return parts;
  }
  const blocks=passageBlocks(chapter,page);
  return <View testID="reader-passage">{blocks.map((block,index)=>{
    if(block.type==='image') {
      const b=block.image;
      return <View key={'image'+index} style={{marginTop:8,marginBottom:6}}><Image accessibilityLabel={b.alt} source={{uri:b.src.startsWith('/')?apiBase+b.src:b.src}} resizeMode="contain" style={{width:'100%',height:imageHeight}}/><Text numberOfLines={1} style={{color:textStyle.color,fontSize:12,lineHeight:16,textAlign:'center'}}>{b.alt}</Text></View>;
    }
    const style=paragraphStyle(block,textStyle,index===blocks.length-1);
    return <Text key={'text'+index} testID="reader-text" selectable accessibilityRole={block.heading ? 'header' : undefined}
      style={[textStyle,style,Platform.OS==='web' && {whiteSpace:'pre-wrap',overflowWrap:'anywhere'} as any]}>
      {passageSegments(chapter,block.start,block.end).map(({text,mark:b,start})=><Text key={start}
        style={{...(b?.bold?{fontWeight:'700'}:{}),...(b?.italic?{fontStyle:'italic'}:{}),...(b?.sup?{fontSize:style.fontSize*.75,...(Platform.OS==='web'?{verticalAlign:'super'} as any:{})}:{}),...(b?.href?{textDecorationLine:'underline'}:{})}}
        accessibilityRole={b?.href?'link':undefined}
        onPress={b?.href?(e)=>{e.stopPropagation();onLink(b.href);}:undefined}>{marked(text,String(start))}</Text>)}
    </Text>;
  })}</View>;
}
