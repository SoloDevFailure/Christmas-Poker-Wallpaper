import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {usePhoneModal} from './usePhoneModal';
import {listPersonalStamps,loadPersonalStamp,deletePersonalStamp,type SavedStamp} from './stampLibrary';
import type {CustomAsset} from './customStamp';
export default function MyStamps({onClose,onSelect,onSaveSelected,services={list:listPersonalStamps,load:loadPersonalStamp,remove:deletePersonalStamp}}:{onClose:()=>void;onSelect:(asset:CustomAsset)=>void;onSaveSelected?:()=>void;services?:{list:typeof listPersonalStamps;load:typeof loadPersonalStamp;remove:typeof deletePersonalStamp}}){
 const dialog=useRef<HTMLElement>(null),active=useRef(true);usePhoneModal(dialog);
 const [rows,setRows]=useState<SavedStamp[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function refresh(){setBusy(true);setError('');try{const rows=await services.list();if(active.current)setRows(rows);}catch{setError('Could not load My Stamps. Check your connection and retry.');}finally{setBusy(false);}}
 useEffect(()=>{active.current=true;void refresh();return()=>{active.current=false;};},[]);
 async function select(row:SavedStamp){setBusy(true);setError('');try{const asset=await services.load(row);if(active.current)onSelect(asset);}catch{setError('This stamp could not be opened. Check your connection and refresh the gallery.');}finally{setBusy(false);}}
 async function remove(row:SavedStamp){if(!confirm('Delete this saved stamp? Copies already on the wallpaper will remain.'))return;setBusy(true);setError('');try{await services.remove(row.id);setRows(items=>items.filter(r=>r.id!==row.id));}catch{setError('Deletion could not be confirmed. Retry deletion or refresh the gallery.');}finally{setBusy(false);}}
 return createPortal(<div className="photo-backdrop"><section ref={dialog} tabIndex={-1} className="photo-preparation stamp-library" role="dialog" aria-modal="true" aria-labelledby="my-stamps-title" onKeyDown={e=>{if(e.key==='Escape'&&!busy)onClose();}}>
 <div className="settings-title"><h2 id="my-stamps-title">My Stamps</h2><button aria-label="Close My Stamps" disabled={busy} onClick={onClose}>×</button></div>
 <small>Private to this browser profile. Clearing site data loses access. Reuse never spends AI credits.</small>
 {onSaveSelected&&<button disabled={busy} onClick={onSaveSelected}>Save selected artwork</button>}
 <button disabled={busy} onClick={()=>void refresh()}>{busy?'Loading…':'Refresh library'}</button>
 {error&&<p role="alert" className="warning">{error}</p>}
 {!rows.length&&!busy&&!error&&<p>No saved stamps yet. Use an AI stamp, photo, drawing or text to save it here.</p>}
 <div className="saved-stamp-grid">{rows.map(row=><article key={row.id}><button disabled={busy||row.state!=='ready'} onClick={()=>void select(row)} aria-label={'Reuse '+row.label}>{row.thumbnail?<img loading="lazy" src={row.thumbnail} alt={row.label}/>:<span>{row.state==='deleting'?'Deletion pending':'Save incomplete'}</span>}</button><small>{row.label} · {new Date(row.created_at).toLocaleDateString()}</small><button disabled={busy} onClick={()=>void remove(row)}>Delete</button></article>)}</div>
 </section></div>,document.body);
}
