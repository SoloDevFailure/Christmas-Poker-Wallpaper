import {memo} from 'react';
import {MAX_TRACKING_AGE} from './manipulation';
import {detectedCorners,debugColors,frameMarkerDecisions,type DebugSnapshot} from './trackingDebug';
export default memo(function TrackingDebug({snapshot:s,now,width,height,zoom}:{snapshot:DebugSnapshot;now:number;width:number;height:number;zoom:1|2}){
 const age=s.at===null?null:Math.max(0,now-s.at),expired=age!==null&&age>MAX_TRACKING_AGE;
 const ids=s.phase==='locked'&&!expired?s.acceptedIds:[];
 const markers=frameMarkerDecisions(s.markers,ids,expired?'stale-frame':s.reason);
 const state=s.phase==='locked'&&!expired?'VALID':s.phase==='holding'||s.phase==='locked'?'HELD':'LOST';
 const reason=expired?'stale-frame: tracking timeout (no fresh camera result)':s.reason+(s.detail?' · '+s.detail:'');
 return <div className="tracking-debug" aria-label="Visual tracking debugger">
  <svg className="marker-outlines" viewBox={'0 0 '+Math.max(1,width)+' '+Math.max(1,height)} aria-label="Detected marker outlines">
   {s.draw&&!expired&&width>0&&height>0&&s.width>0&&s.height>0&&markers.map((m,i)=>{const points=detectedCorners(m.corners,{width,height},s,zoom).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));if(!points.length)return null;const color=debugColors[m.status],label=points.reduce((a,p)=>p.y<a.y?p:a,points[0]);return <g key={i} data-marker-id={m.id} data-marker-status={m.status} stroke={color} fill="none"><title>{m.id+': '+m.reason}</title><polygon points={points.map(p=>p.x+','+p.y).join(' ')} strokeWidth="2"/>{points.map((p,j)=><circle key={j} cx={p.x} cy={p.y} r="3" fill={color} stroke="#000"/>)}<text x={Math.max(4,Math.min(width-70,label.x+4))} y={Math.max(13,Math.min(height-4,label.y-6))} fill={color} stroke="#07100d" strokeWidth="3" paintOrder="stroke" fontSize="12" fontWeight="bold">{m.id+' '+m.status}</text></g>;})}
  </svg>
  <aside className="tracking-debug-panel" aria-label="Live tracking diagnostics" aria-live="off">
   <strong>{state} · detected {s.detected}/8 · accepted {ids.length}/8</strong>
   <div>Used IDs: {ids.length?ids.join(', '):'none'}</div>
   <div>Reason: {reason||'none'}</div>{s.check&&<div>Fit check: {s.check}</div>}
   {s.lastFailure&&<div>Last rejection ({Math.max(0,Math.round(now-s.lastFailure.at))} ms ago): {s.lastFailure.reason}</div>}
   <div>Error: {s.error===null?'—':s.error.toFixed(2)+' px'} · last valid: {s.lastValidAt===null?'never':Math.max(0,Math.round(now-s.lastValidAt))+' ms'}</div>
   <div>Capture {s.capture} · process {s.width} × {s.height}</div>
   <div>Detection age: {age===null?'—':Math.round(age)+' ms'} · green used / red rejected / yellow pending</div>
   <ul>{markers.map((m,i)=><li key={i} style={{color:debugColors[m.status]}}>{m.id}: {m.status==='accepted'?'Used':m.reason.startsWith('Frame rejected:')?'Frame rejected (see Fit check)':m.reason}</li>)}</ul>
   {(!s.draw||expired)&&<div>Outlines waiting for a current camera frame</div>}
  </aside>
 </div>;
});
