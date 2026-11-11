import Aruco from 'js-aruco2';
import {CANVAS,W,H,SIZE,QUIET,markers} from './geometry';
import {stampSource} from './art';
import {stampDimensions,type Placement,type Stamp,type Preview} from './types';
const dictionary=new Aruco.AR.Dictionary('ARUCO');
const tags=markers.map(m=>'data:image/svg+xml,'+encodeURIComponent(dictionary.generateSVG(m.id).replace('viewBox="0 0 9 9"','viewBox="1 1 7 7"')));
function Artwork({p,preview=false}:{p:Placement;preview?:boolean}){const {width,height}=stampDimensions(p);return <image href={stampSource(p)} x={-width/2} y={-height/2} width={width} height={height} opacity={preview?.6:1} transform={'translate('+p.position_x*W+' '+p.position_y*H+') rotate('+p.rotation+')'}/>;}
export default function Wallpaper({stamps,previews,qr}:{stamps:Stamp[];previews:Preview[];qr:string}){
 return <svg className="wallpaper" viewBox={'0 0 '+W+' '+H} aria-label="Shared Christmas Poker wallpaper">
  <rect width={W} height={H} fill="#07130f"/>
  <svg x={CANVAS.x} y={CANVAS.y} width={CANVAS.width} height={CANVAS.height} viewBox={'0 0 '+W+' '+H} overflow="hidden" aria-label="Printable canvas">
   <rect width={W} height={H} fill="#06281f"/>{stamps.map(s=><Artwork key={s.id} p={s}/>)}{previews.map(p=><Artwork key={p.sender} p={p} preview/>)}
  </svg>
  <g className="foreground"><rect x={CANVAS.x} y={CANVAS.y} width={CANVAS.width} height={CANVAS.height} fill="none" stroke="#947940" strokeWidth="2"/>
   <text x="510" y="37" textAnchor="middle" fill="#e6cc89" fontFamily="Georgia" fontSize="31" fontWeight="bold">CHRISTMAS POKER 2026</text>
   <text x="1380" y="36" textAnchor="middle" fill="#e6cc89" fontSize="25">Draw on the canvas!</text>
   {[{x:48,y:300,s:'♠'},{x:48,y:790,s:'♥'},{x:1872,y:300,s:'♣'},{x:1872,y:790,s:'♦'}].map(p=><text key={p.s} x={p.x} y={p.y} textAnchor="middle" fill={p.s==='♥'||p.s==='♦'?'#ec6c67':'#e6cc89'} fontSize="45">{p.s}</text>)}
   <text x="510" y="1063" textAnchor="middle" fill="#e6cc89" fontSize="21">Aim · pinch &amp; turn · tap Stamp</text>
   <text x="1260" y="1063" textAnchor="middle" fill="#e6cc89" fontSize="23">Scan the QR code to draw!</text>
   {qr&&<image href={qr} x="1580" y="948" width="120" height="120"/>}
   {markers.map((m,i)=><g key={m.id}><rect x={m.x-QUIET} y={m.y-QUIET} width={SIZE+2*QUIET} height={SIZE+2*QUIET} fill="white"/><image href={tags[i]} x={m.x} y={m.y} width={SIZE} height={SIZE}/></g>)}
  </g>
 </svg>;
}
