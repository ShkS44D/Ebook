import React from 'react';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';

const readers = [
  ['#E8DDF4','#F1C7A5','#3A2925','#795C9E','#FFF7E8',1],['#D9EDF0','#8F563B','#191716','#367C83','#FFF4D8',0],
  ['#F5DFD8','#D89B72','#603B2F','#B45F67','#FFF9EA',1],['#DFE9D8','#F0C39F','#B66A3C','#557A55','#FFF3D0',0],
  ['#E2E5F5','#6F412F','#151313','#5668A6','#FFF7E7',1],['#F6E7C9','#C9835A','#4A2B25','#A16B35','#FFF9EA',0],
  ['#DDEBF8','#F3C7A2','#D0A070','#3976A5','#FFF5DC',1],['#F2DDE8','#9C6045','#2A1B18','#9A527C','#FFF8E7',0],
  ['#D7ECE4','#E6AE82','#57362D','#3D806D','#FFF5D8',1],['#EEE0D4','#70422E','#211715','#9A5D3E','#FFF8E8',0],
  ['#E6DDF1','#F0B98D','#7C4934','#71569B','#FFF1CF',1],['#DCE8EF','#B87550','#32221E','#43758D','#FFF9E9',0],
  ['#F2E1D5','#FFD0AD','#A95E45','#A85757','#FFF5DB',1],['#DAE9DE','#855139','#171413','#4D775E','#FFF8E5',0],
  ['#E0E4F3','#C17C58','#3F2924','#5366A0','#FFF3D4',1],['#F1DDE4','#F2C8A6','#51332C','#985775','#FFF8E8',0],
  ['#D9ECEB','#75452F','#251916','#367B78','#FFF4D5',1],['#F4E4CE','#D69669','#6B3D2D','#9A6937','#FFF9E7',0],
  ['#E3DDF0','#E9B68D','#2D211E','#6B5894','#FFF2D6',1],['#DCEAF4','#9B5D40','#141313','#3E7694','#FFF8E4',0],
  ['#F3DFDA','#F4CBA8','#8B4E39','#AA5E5D','#FFF6DF',1],['#DCE9D9','#B36F4D','#34231E','#52784E','#FFF9E9',0],
] as const;

export function ReadingAvatar({index=0,size=46}:{index?:number;size?:number}) {
  const [background,skin,hair,shirt,paper,glasses]=readers[((index%readers.length)+readers.length)%readers.length];
  const longHair=index%4===0||index%4===3, curls=index%5===2;
  return <Svg width={size} height={size} viewBox="0 0 100 100">
    <Circle cx="50" cy="50" r="50" fill={background}/>
    <Circle cx={index%2?82:18} cy="18" r="3" fill={paper} opacity=".85"/>
    <Path d={index%2?'M77 29l2.2 4.3 4.8.7-3.5 3.4.8 4.8-4.3-2.3-4.3 2.3.8-4.8-3.5-3.4 4.8-.7z':'M15 31c7-5 11-10 13-17 3 8 8 13 14 17-8 1-12 5-14 13-2-8-6-12-13-13z'} fill={paper} opacity=".55"/>
    {longHair&&<Ellipse cx="50" cy="47" rx="25" ry="30" fill={hair}/>}
    <Path d="M25 88c2-19 12-29 25-29s23 10 25 29" fill={shirt}/>
    <Circle cx="50" cy="39" r="21" fill={skin}/>
    <Path d={curls?'M29 39c-2-16 8-26 21-26 16 0 24 11 21 29-6-2-8-9-10-14-8 7-20 9-32 11z':'M29 39c0-18 9-27 22-27 14 0 23 10 21 28-7-2-11-8-13-15-7 7-17 11-30 14z'} fill={hair}/>
    {curls&&<G fill={hair}><Circle cx="31" cy="26" r="7"/><Circle cx="40" cy="18" r="7"/><Circle cx="52" cy="17" r="8"/><Circle cx="64" cy="21" r="7"/><Circle cx="70" cy="31" r="7"/></G>}
    <Circle cx="42" cy="41" r="1.7" fill="#2B211D"/><Circle cx="58" cy="41" r="1.7" fill="#2B211D"/>
    {glasses?<G fill="none" stroke="#3B3330" strokeWidth="2"><Circle cx="42" cy="41" r="6"/><Circle cx="58" cy="41" r="6"/><Path d="M48 41h4"/></G>:null}
    <Path d="M45 51c3 2 7 2 10 0" fill="none" stroke="#8E5549" strokeWidth="1.8" strokeLinecap="round"/>
    <Path d="M8 72c13-5 27-3 42 7v21C37 91 23 88 8 91z" fill={paper}/>
    <Path d="M92 72c-13-5-27-3-42 7v21c13-9 27-12 42-9z" fill={paper}/>
    <Path d="M50 79v21" stroke="#CBBE9E" strokeWidth="2"/>
    <Path d="M16 79c10-2 19 0 27 5M84 79c-10-2-19 0-27 5" fill="none" stroke={shirt} strokeWidth="1.8" opacity=".55"/>
    <Rect x="7" y="90" width="86" height="10" fill={shirt} opacity=".9"/>
  </Svg>;
}
