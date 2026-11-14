import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {usePhoneModal} from './usePhoneModal';
import {savePersonalStamp,type ArtworkKind} from './stampLibrary';
import type {CustomAsset} from './customStamp';
export default function SaveArtwork({asset,kind,onDone,onCancel,saveStamp=savePersonalStamp}:{asset:CustomAsset;kind:ArtworkKind;onDone:()=>void;onCancel:()=>void;saveStamp?:typeof savePersonalStamp}){
 const dialog=useRef<HTMLElement>(null);usePhoneModal(dialog);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');const running=useRef(false),active=useRef(true),done=useRef(onDone);done.current=onDone;
 async function save(){if(running.current)return;running.current=true;setBusy(true);setError('');try{await saveStamp(asset,kind);if(active.current)done.current();}catch{if(active.current)setError('Not saved yet. Your artwork is still selected on this phone. Check your connection or library space, then retry saving—no new AI generation is needed.');}finally{running.current=false;if(active.current)setBusy(false);}}
 useEffect(()=>{active.current=true;void save();return()=>{active.current=false;};},[asset]);
 return createPortal(<div className="photo-backdrop"><section ref={dialog} tabIndex={-1} className="photo-preparation" role="dialog" aria-modal="true" aria-label="Save artwork"><h2>Save to My Stamps</h2><img className="photo-preview" src={asset.image_data} alt="Artwork being saved"/>{busy?<p role="status">Saving your stamp…</p>:<><p role="alert" className="warning">{error}</p><button onClick={()=>void save()}>Retry saving</button><button onClick={onCancel}>Keep selected locally</button></>}</section></div>,document.body);
}
