import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, Platform, StyleSheet, View } from 'react-native';
import { useReducedMotion } from './use-reduced-motion';
import type { ReaderPage } from './reader-model';

export type TurnTarget = { page: ReaderPage; content: React.ReactNode };
export type ReaderPagerHandle = { turn: (direction: number) => void; ignoreTap: () => boolean };
type Props = {
  children: React.ReactNode; background: string; width: number; layoutKey: string;
  disabled: boolean; prepare: (direction: number) => Promise<TurnTarget | null>;
  commit: (page: ReaderPage) => void; onTurnStart: () => void; onTap: () => void; onError: (message: string) => void;
};

// A fixed paper surface. Only the foreground sheet moves; the next page stays put.
export const ReaderPager = forwardRef<ReaderPagerHandle, Props>(function ReaderPager(props, ref) {
  const reduced = useReducedMotion();
  const surface = useRef<View>(null);
  const suppressTapUntil = useRef(0);
  const reducedRef = useRef(reduced); reducedRef.current = reduced;
  const progress = useRef(new Animated.Value(0)).current;
  const [turn, setTurn] = useState<{direction:number; target:TurnTarget; source:React.ReactNode} | null>(null);
  const current = useRef(props); current.current = props;
  const state = useRef({ busy:false, generation:0, direction:1, amount:0, released:false, accept:false, target:null as TurnTarget | null });
  const animate = useRef<(accept:boolean) => void>(() => {});
  animate.current = accept => {
    const active=state.current, generation=active.generation;
    Animated.timing(progress, {toValue:accept ? 1 : 0, duration:reduced ? 0 : Math.max(120, 340 * (accept ? 1-active.amount : active.amount)),
      easing:Easing.out(Easing.cubic), useNativeDriver:Platform.OS !== 'web'}).start(({finished}) => {
      if(!finished || generation!==state.current.generation)return;
      const target=active.target;
      if(accept && target)current.current.commit(target.page);
      active.busy=false; active.target=null; setTurn(null);
    });
  };
  async function begin(direction:number, automatic:boolean) {
    if(state.current.busy || current.current.disabled)return;
    const active=state.current;
    Object.assign(active,{busy:true,direction,amount:0,released:automatic,accept:automatic,target:null});
    const generation=++active.generation, source=current.current.children;
    current.current.onTurnStart();
    progress.setValue(0);
    try {
      const target=await current.current.prepare(direction);
      if(generation!==active.generation)return;
      if(!target){active.busy=false;return;}
      active.target=target; setTurn({direction,target,source});
      // Mount both pages before starting a turn, including under reduced motion.
      requestAnimationFrame(() => {
        if(generation!==active.generation)return;
        progress.setValue(reduced ? 0 : active.amount);
        if(active.released)animate.current(active.accept);
      });
    } catch(error:any) {
      if(generation!==active.generation)return;
      active.busy=false;setTurn(null);current.current.onError(error.message || 'This page could not be loaded.');
    }
  }
  const beginRef=useRef(begin);beginRef.current=begin;
  useImperativeHandle(ref,()=>({turn:direction=>{void beginRef.current(direction,true);}, ignoreTap:()=>state.current.busy || Date.now()<suppressTapUntil.current}),[]);
  function move(dx:number) {
    const active=state.current;if(!active.busy || active.released)return;
    active.amount=Math.max(0,Math.min(1,-dx*active.direction/Math.max(1,current.current.width)));
    if(active.target&&!reducedRef.current)progress.setValue(active.amount);
  }
  function release(velocity:number,cancel=false) {
    const active=state.current;if(!active.busy)return;
    suppressTapUntil.current=Date.now()+450;
    active.released=true;
    active.accept=!cancel&&(active.amount>.18 || (-velocity*active.direction>.35 && active.amount>.035));
    if(active.target)animate.current(active.accept);
  }
  const gestureActions=useRef({move,release});gestureActions.current={move,release};
  // A single pointer stream avoids the synthetic click emitted after touch drags on web.
  const webDrag=useRef<null|{id:number;x:number;y:number;lastX:number;lastTime:number;velocity:number;started:number;claimed:boolean}>(null);
  const webHandlers={
    onPointerDown:(event:any)=>{const e=event.nativeEvent || event;
      if(!e.isPrimary||e.button!==0||current.current.disabled||state.current.busy)return;
      const target=e.target as HTMLElement,labelled=target.closest('[aria-label]');
      const label=labelled?.getAttribute('aria-label') || '';
      const isReaderSurface=/^(Reading page\.|Show reading controls|Hide reading controls)/.test(label);
      if(target.closest('a,button,input,textarea')||(labelled&&!isReaderSurface))return;
      webDrag.current={id:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,lastTime:e.timeStamp,velocity:0,started:e.timeStamp,claimed:false};
    },
    onPointerMove:(event:any)=>{const e=event.nativeEvent || event,drag=webDrag.current;if(!drag||drag.id!==e.pointerId)return;
      const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
      if(!drag.claimed){if(Math.abs(dy)>12&&Math.abs(dy)>Math.abs(dx)){webDrag.current=null;return;}
        if(Math.abs(dx)<10||Math.abs(dx)<Math.abs(dy)*1.4)return;
        if(e.timeStamp-drag.started>400){webDrag.current=null;return;}
        drag.claimed=true;suppressTapUntil.current=Date.now()+800;event.currentTarget.setPointerCapture(e.pointerId);void beginRef.current(dx<0?1:-1,false);}
      event.preventDefault();const elapsed=e.timeStamp-drag.lastTime;if(elapsed>0)drag.velocity=(e.clientX-drag.lastX)/elapsed;
      drag.lastX=e.clientX;drag.lastTime=e.timeStamp;gestureActions.current.move(dx);
    },
    onPointerUp:(event:any)=>{const e=event.nativeEvent || event,drag=webDrag.current;if(!drag||drag.id!==e.pointerId)return;
      if(drag.claimed){gestureActions.current.move(e.clientX-drag.x);gestureActions.current.release(e.timeStamp-drag.lastTime<120?drag.velocity:0);}
      else if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<10&&e.timeStamp-drag.started<500)current.current.onTap();
      webDrag.current=null;
    },
    onPointerCancel:(event:any)=>{if(webDrag.current?.claimed)gestureActions.current.release(0,true);webDrag.current=null;},
    onClick:(event:any)=>{if(Date.now()<suppressTapUntil.current){event.preventDefault();event.stopPropagation();}},
  };
  useEffect(() => {
    state.current.generation++;state.current.busy=false;state.current.target=null;
    progress.stopAnimation();setTurn(null);
    return () => {state.current.generation++;progress.stopAnimation();};
  },[props.layoutKey,progress]);
  useEffect(()=>{if(props.disabled){state.current.generation++;state.current.busy=false;state.current.target=null;progress.stopAnimation();setTurn(null);}},[props.disabled,progress]);
  useEffect(() => {
    if(Platform.OS!=='web')return;
    function key(event:KeyboardEvent) {
      if(current.current.disabled || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)return;
      const target=event.target as HTMLElement;
      if(target.closest('input,textarea,select,[contenteditable="true"],[role="dialog"],button,[role="button"]'))return;
      const direction=event.key==='ArrowLeft' || event.key==='PageUp' ? -1 : ['ArrowRight','PageDown',' '].includes(event.key) ? 1 : 0;
      if(direction){event.preventDefault();void beginRef.current(direction,true);}
    }
    window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
  },[]);
  const claimedDirection=useRef(1);
  const responder=useRef(PanResponder.create({
    onMoveShouldSetPanResponder:(_,gesture)=>{
      if(current.current.disabled||state.current.busy||gesture.numberActiveTouches!==1)return false;
      if(Math.abs(gesture.dx)<=10||Math.abs(gesture.dx)<=Math.abs(gesture.dy)*1.4)return false;
      claimedDirection.current=gesture.dx<0?1:-1;return true;
    },
    onPanResponderGrant:()=>{suppressTapUntil.current=Date.now()+450;void beginRef.current(claimedDirection.current,false);},
    onPanResponderMove:(_,gesture)=>gestureActions.current.move(gesture.dx),
    onPanResponderRelease:(_,gesture)=>gestureActions.current.release(gesture.vx),
    onPanResponderTerminate:()=>gestureActions.current.release(0,true),
    onPanResponderTerminationRequest:()=>false,
  })).current;
  const forward=turn?.direction===1;
  const contents=!turn ? props.children : <>
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
      {forward ? turn.target.content : turn.source}
      <Animated.View testID="page-turn-shade" style={[StyleSheet.absoluteFill,{backgroundColor:'#241B10',opacity:progress.interpolate({inputRange:[0,1],outputRange:forward ? [.18,0] : [0,.18]})}]} />
    </View>
    <Animated.View testID="page-turn-sheet" pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill,styles.sheet,{backgroundColor:props.background,
      transform:[{translateX:progress.interpolate({inputRange:[0,1],outputRange:forward ? [0,-props.width] : [-props.width,0]})}]}]}>
      {forward ? turn.source : turn.target.content}
    </Animated.View>
  </>;
  if(Platform.OS==='web')return React.createElement('div',{ref:surface as any,'data-testid':'reader-pager',...webHandlers,
    style:{display:'flex',flex:1,minHeight:0,overflow:'hidden',backgroundColor:props.background,touchAction:'pan-y pinch-zoom',overscrollBehaviorX:'none',position:'relative'}},contents);
  return <View ref={surface} testID="reader-pager" {...responder.panHandlers} style={[styles.surface,{backgroundColor:props.background}]}>
    {contents}
  </View>;
});
const styles=StyleSheet.create({
  surface:{flex:1,minHeight:0,overflow:'hidden'},
  sheet:{borderTopRightRadius:38,borderBottomRightRadius:38,overflow:'hidden',boxShadow:'8px 0 24px #241B1029'},
});
