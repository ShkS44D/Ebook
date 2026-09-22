import React, { useRef, useState } from 'react';

const frame=280;
export function PhotoCropper({uri,onCancel,onConfirm}:{uri:string;onCancel:()=>void;onConfirm:(file:Blob)=>void}) {
  const image=useRef<HTMLImageElement|null>(null),drag=useRef<{x:number;y:number;ox:number;oy:number}|null>(null);
  const [size,setSize]=useState({w:1,h:1}),[zoom,setZoom]=useState(1),[offset,setOffset]=useState({x:0,y:0}),[busy,setBusy]=useState(false);
  const scale=Math.max(frame/size.w,frame/size.h)*zoom,rendered={w:size.w*scale,h:size.h*scale};
  const clamp=(x:number,y:number)=>({x:Math.max((frame-rendered.w)/2,Math.min((rendered.w-frame)/2,x)),y:Math.max((frame-rendered.h)/2,Math.min((rendered.h-frame)/2,y))});
  async function finish(){if(!image.current)return;setBusy(true);const canvas=document.createElement('canvas');canvas.width=canvas.height=512;const context=canvas.getContext('2d');if(!context)return;
    const sx=(rendered.w/2-frame/2-offset.x)/scale,sy=(rendered.h/2-frame/2-offset.y)/scale,source=frame/scale;
    context.drawImage(image.current,sx,sy,source,source,0,0,512,512);canvas.toBlob(blob=>{setBusy(false);if(blob)onConfirm(blob);},'image/webp',.9);
  }
  return <div role="dialog" aria-modal="true" aria-label="Crop profile picture" style={{position:'fixed',inset:0,zIndex:10000,background:'rgba(25,22,18,.72)',display:'flex',alignItems:'center',justifyContent:'center',padding:20,fontFamily:'Poppins, sans-serif'}}>
    <div style={{width:'min(390px,100%)',background:'#F8F5EE',borderRadius:30,padding:24,boxShadow:'0 24px 80px #0007'}}>
      <div style={{fontSize:22,fontWeight:600,color:'#302920',marginBottom:6}}>Crop profile picture</div>
      <div style={{fontSize:13,color:'#756D61',marginBottom:20}}>Drag and zoom until your photo fits the circle.</div>
      <div onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);drag.current={x:e.clientX,y:e.clientY,ox:offset.x,oy:offset.y}}} onPointerMove={e=>{if(drag.current)setOffset(clamp(drag.current.ox+e.clientX-drag.current.x,drag.current.oy+e.clientY-drag.current.y))}} onPointerUp={()=>drag.current=null} onPointerCancel={()=>drag.current=null}
        style={{width:frame,height:frame,maxWidth:'100%',margin:'0 auto',overflow:'hidden',borderRadius:'50%',position:'relative',background:'#DDD6C9',cursor:'grab',touchAction:'none',boxShadow:'0 0 0 5px #fff, 0 0 0 7px #D9D1C3'}}>
        <img ref={image} src={uri} alt="Photo crop preview" draggable={false} onLoad={e=>setSize({w:e.currentTarget.naturalWidth,h:e.currentTarget.naturalHeight})}
          style={{position:'absolute',width:rendered.w,height:rendered.h,left:'50%',top:'50%',transform:`translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,userSelect:'none',pointerEvents:'none',maxWidth:'none'}}/>
      </div>
      <label style={{display:'block',fontSize:13,color:'#625A4E',marginTop:24}}>Zoom
        <input aria-label="Photo zoom" type="range" min="1" max="3" step="0.01" value={zoom} onChange={e=>{setZoom(Number(e.target.value));setOffset({x:0,y:0})}} style={{display:'block',width:'100%',accentColor:'#3A3026',marginTop:10}}/>
      </label>
      <div style={{display:'flex',gap:12,marginTop:24}}><button onClick={onCancel} style={button('#FFF','#352E26')}>Cancel</button><button disabled={busy} onClick={finish} style={button('#3A3026','#FFF')}>{busy?'Preparing…':'Use photo'}</button></div>
    </div>
  </div>;
}
function button(background:string,color:string):React.CSSProperties{return{flex:1,minHeight:52,borderRadius:17,border:'1px solid #DED7CA',background,color,fontSize:14,fontWeight:600,cursor:'pointer'}}
