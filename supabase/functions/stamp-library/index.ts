import { libraryHandler,type LibraryDeps,type LibraryItem } from './core.ts';
const runtime=(globalThis as unknown as {Deno:{env:{get:(key:string)=>string|undefined};serve:(handler:(req:Request)=>Promise<Response>)=>void}}).Deno;
const env=(key:string)=>runtime.env.get(key)||'';
const url=env('SUPABASE_URL'),key=env('SUPABASE_SERVICE_ROLE_KEY'),anon=env('SUPABASE_ANON_KEY');
const headers={apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'};
async function rpc(name:string,args:unknown){const r=await fetch(url+'/rest/v1/rpc/'+name,{method:'POST',headers,body:JSON.stringify(args),signal:AbortSignal.timeout(10000)});const result=await r.json();if(!r.ok)throw Error(typeof result.message==='string'?result.message:'Library unavailable');return result;}
const deps:LibraryDeps={
 authenticate:async token=>{const r=await fetch(url+'/auth/v1/user',{headers:{apikey:anon,Authorization:'Bearer '+token},signal:AbortSignal.timeout(10000)});if(!r.ok)return null;const user=await r.json();return typeof user.id==='string'?user.id:null;},
 reserve:async(user,hash,label,kind,width,height,bytes)=>await rpc('reserve_personal_stamp',{p_owner:user,p_hash:hash,p_label:label,p_kind:kind,p_width:width,p_height:height,p_bytes:bytes}) as LibraryItem,
 finish:async(user,id)=>await rpc('finish_personal_stamp',{p_owner:user,p_id:id})===true,
 deletion:async(user,id,finish)=>await rpc('delete_personal_stamp',{p_owner:user,p_id:id,p_finish:finish}) as string,
 upload:async(path,bytes)=>{const r=await fetch(url+'/storage/v1/object/personal-stamps/'+path,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'image/png','x-upsert':'true','cache-control':'max-age=0'},body:Uint8Array.from(bytes),signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Storage upload failed');},
 remove:async path=>{const r=await fetch(url+'/storage/v1/object/personal-stamps',{method:'DELETE',headers,body:JSON.stringify({prefixes:[path]}),signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Storage deletion failed');},
};
runtime.serve(libraryHandler(deps,(env('AI_ALLOWED_ORIGINS')||'https://solodevfailure.github.io').split(',').map(s=>s.trim())));
