import {memo} from 'react';
import {MAX_TRACKING_AGE} from './manipulation';
import {RECOVERY_HOLD} from './trackingState';
import {detectedCorners,debugColors,frameMarkerDecisions,markerConnections,type DebugSnapshot} from './trackingDebug';
export default memo(function TrackingDebug({snapshot:s,now,width,height,zoom}:{snapshot:DebugSnapshot;now:number;width:number;height:number;zoom:1|2}){
 const age=s.at===null?null:Math.max(0,now-s.at),expired=age!==null&&age>MAX_TRACKING_AGE;
 const validAge=s.lastValidAt===null?null:Math.max(0,now-s.lastValidAt);
 const state=s.phase==='lost'||validAge===null||validAge>RECOVERY_HOLD?'LOST':s.phase==='locked'&&!expired?'VALID':'HELD';
 const ids=state==='VALID'&&!expired?s.acceptedIds:[];
 const markers=frameMarkerDecisions(s.markers,ids,expired?'stale-frame':s.reason);
 const reason=expired?'stale-frame: no fresh camera result':s.reason+(s.detail?' · '+s.detail:'');
 const fresh=s.draw&&!expired&&width>0&&height>0&&s.width>0&&s.height>0;
 const connections=fresh&&state==='VALID'?markerConnections(markers,ids,{width,height},s,zoom):[];
 const rejected=new Map<string,number[]>();for(const m of markers.filter(m=>m.status!=='accepted'))rejected.set(m.reason,[...(rejected.get(m.reason)||[]),m.id]);
 return <div className="tracking-debug" aria-label="Visual tracking debugger">
  <svg className="marker-outlines" viewBox={'0 0 '+Math.max(1,width)+' '+Math.max(1,height)} aria-label="Detected marker outlines">
   {connections.map((edge,i)=><line key={'edge'+i} data-tracking-connection={edge.from.id+'-'+edge.to.id} x1={edge.from.x} y1={edge.from.y} x2={edge.to.x} y2={edge.to.y} stroke={debugColors.accepted} strokeWidth="1.5" opacity=".45"/>)}
   {fresh&&markers.map((m,i)=>{const points=detectedCorners(m.corners,{width,height},s,zoom).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));if(!points.length)return null;const color=debugColors[m.status],label=points.reduce((a,p)=>p.y<a.y?p:a,points[0]);return <g key={i} data-marker-id={m.id} data-marker-status={m.status} stroke={color} fill="none"><title>{m.id+': '+m.reason}</title><polygon points={points.map(p=>p.x+','+p.y).join(' ')} strokeWidth="2"/>{points.map((p,j)=><circle key={j} cx={p.x} cy={p.y} r="3" fill={color} stroke="#000"/>)}<text x={Math.max(4,Math.min(width-100,label.x+4))} y={Math.max(14,Math.min(height-4,label.y-6))} fill={color} stroke="#07100d" strokeWidth="3" paintOrder="stroke" fontSize="13" fontWeight="bold">{m.id+' '+m.status+(m.status==='rejected'&&m.residual!==undefined?' '+m.residual.toFixed(1)+'px':'')}</text></g>;})}
  </svg>
  <aside className="tracking-debug-panel" aria-label="Live tracking diagnostics" aria-live="off">
   <strong>TRACKING: {state} ({validAge===null?'no reliable solution':Math.round(validAge)+' ms'}){state==='HELD'?' · PLACEMENT FROZEN':''}</strong>
   <div>DETECTED: {expired?0:s.detected}/8 | ACCEPTED: {ids.length}/8 | IDS: {ids.length?ids.join(', '):'none'}{state==='HELD'&&s.lastValidIds?.length?' | HELD IDS: '+s.lastValidIds.join(', '):''}</div>
   <div>REJECTION: {reason||'none'}{s.check?' | FIT: '+s.check:''}</div>
   {!reason&&s.lastFailure&&<div>LAST REJECTION ({Math.max(0,Math.round(now-s.lastFailure.at))} ms): {s.lastFailure.reason}</div>}
   <div>CAMERA: {s.capture} | PROCESS: {s.width} × {s.height} | ERROR: {s.error===null?'—':s.error.toFixed(2)+' px'} | FRAME AGE: {age===null?'—':Math.round(age)+' ms'}{!fresh?' · stale outlines hidden':''}</div>
   {rejected.size>0&&<div className="marker-rejection-summary">{[...rejected].map(([reason,ids])=>ids.join(', ')+': '+reason).join(' | ')}</div>}
  </aside>
 </div>;
});
