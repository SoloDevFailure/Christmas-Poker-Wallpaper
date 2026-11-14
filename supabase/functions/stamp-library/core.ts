import { decodePng } from '../ai-stamp/png.ts';
export const MAX_STAMP_BYTES=49134;
export type LibraryItem={id:string;object_path:string;state:string;label:string;width:number;height:number;kind:string;created_at:string};
export type LibraryDeps={authenticate:(token:string)=>Promise<string|null>;reserve:(user:string,hash:string,label:string,kind:string,width:number,height:number,bytes:number)=>Promise<LibraryItem>;finish:(user:string,id:string)=>Promise<boolean>;deletion:(user:string,id:string,finish:boolean)=>Promise<string>;upload:(path:string,bytes:Uint8Array)=>Promise<void>;remove:(path:string)=>Promise<void>};
export function validateLibraryPng(bytes:Uint8Array){if(!bytes.length||bytes.length>MAX_STAMP_BYTES)throw Error('Use prepared PNG artwork up to 49 KB.');const image=decodePng(bytes,512);if(image.height>256)throw Error('Prepared stamps must fit 512 × 256 pixels.');return image;}
export function libraryHandler(deps:LibraryDeps,origins:string[]){return async(req:Request)=>{
 const origin=req.headers.get('origin'),headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
 if(origin&&origins.includes(origin))headers['Access-Control-Allow-Origin']=origin;
 const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
 if(origin&&!origins.includes(origin))return reply({error:'Origin denied.'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,DELETE,OPTIONS'}});
 try{
  const token=req.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1];const user=token?await deps.authenticate(token):null;
  if(!user)return reply({error:'Your phone session expired. Reopen the controller.'},401);
  if(req.method==='DELETE'){
   const id=new URL(req.url).searchParams.get('id')||'';
   if(!/^[a-f0-9-]{36}$/i.test(id))return reply({error:'Invalid stamp ID.'},400);
   const path=await deps.deletion(user,id,false);await deps.remove(path);await deps.deletion(user,id,true);return reply({deleted:true});
  }
  if(req.method!=='POST')return reply({error:'Use POST or DELETE.'},405);
  // Bound the multipart body while reading, even without Content-Length.
  if(Number(req.headers.get('content-length'))>MAX_STAMP_BYTES+8192)throw Error('Artwork upload is too large.');
  const reader=req.body?.getReader();if(!reader)throw Error('No artwork received.');
  const chunks:Uint8Array[]=[];let length=0;
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{await Promise.race([(async()=>{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>MAX_STAMP_BYTES+8192)throw Error('Artwork upload is too large.');chunks.push(value);}})(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Artwork upload timed out. Retry saving.')),20000);})]);}finally{clearTimeout(timer);void reader.cancel().catch(()=>{});}
  const body=new Uint8Array(length);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.length;}
  const form=await new Response(body,{headers:{'Content-Type':req.headers.get('content-type')||''}}).formData();
  const file=form.get('image'),kind=String(form.get('kind')||''),label=String(form.get('label')||'').trim().slice(0,80);
  if(!(file instanceof File)||file.type!=='image/png'||!['ai','photo','drawing','text'].includes(kind)||!label)throw Error('Use a prepared PNG stamp.');
  const bytes=new Uint8Array(await file.arrayBuffer()),image=validateLibraryPng(bytes);
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
  const item=await deps.reserve(user,hash,label,kind,image.width,image.height,bytes.length);
  if(item.state!=='ready'){
   await deps.upload(item.object_path,bytes);
   if(!await deps.finish(user,item.id)){await deps.remove(item.object_path);throw Error('This stamp was deleted while saving. Your artwork is still selected.');}
  }
  return reply({item:{...item,state:'ready'}});
 }catch(e){
  // Never include Storage responses, headers, tokens or image bytes in logs/errors.
  const message=e instanceof Error?e.message:'';
  const safe=/^(Use prepared|Prepared stamps|Artwork upload|Use a prepared|My Stamps is full|Stamp not found|Deletion is in progress|This stamp was deleted)/.test(message)?message:'Could not save changes to My Stamps. Your artwork is still selected. Please retry.';
  return reply({error:safe},400);
 }
};}
