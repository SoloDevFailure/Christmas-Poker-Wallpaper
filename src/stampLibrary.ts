import { db } from './backend';
import { validCustomAsset,type CustomAsset } from './customStamp';
export type ArtworkKind='ai'|'photo'|'drawing'|'text';
export type SavedStamp={id:string;label:string;kind:ArtworkKind;object_path:string;created_at:string;width:number;height:number;state:'pending'|'ready'|'deleting';thumbnail?:string};
async function bounded<T>(task:PromiseLike<T>):Promise<T>{let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([Promise.resolve(task),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('My Stamps request timed out. Check your connection and retry.')),15000);})]);}finally{clearTimeout(timer);}}
async function authHeaders(){if(!db)throw Error('The wallpaper is not connected.');const {data,error}=await db.auth.getSession();if(error||!data.session)throw Error('Your phone session expired. Reopen the controller.');return {Authorization:'Bearer '+data.session.access_token,apikey:import.meta.env.VITE_SUPABASE_ANON_KEY};}
async function mutate(body:FormData|undefined,id?:string){const response=await fetch(import.meta.env.VITE_SUPABASE_URL+'/functions/v1/stamp-library'+(id?'?id='+encodeURIComponent(id):''),{method:id?'DELETE':'POST',headers:await authHeaders(),body,signal:AbortSignal.timeout(35000)});const result=await response.json();if(!response.ok)throw Error(result.error||'My Stamps is unavailable. Retry without regenerating.');return result;}
export async function savePersonalStamp(asset:CustomAsset,kind:ArtworkKind):Promise<SavedStamp>{
 if(!validCustomAsset(asset))throw Error('The prepared artwork is invalid.');
 const form=new FormData();form.set('image',await (await fetch(asset.image_data)).blob(),'stamp.png');form.set('kind',kind);form.set('label',({ai:'AI cartoon',photo:'Photo',drawing:'Drawing',text:'Text'})[kind]);
 return (await mutate(form)).item;
}
export async function listPersonalStamps():Promise<SavedStamp[]>{
 if(!db)throw Error('The wallpaper is not connected.');
 const {data,error}=await bounded(db.from('personal_stamps').select('id,label,kind,object_path,created_at,width,height,state').order('created_at',{ascending:false}));if(error)throw error;
 const rows=data as SavedStamp[],ready=rows.filter(r=>r.state==='ready');
 if(ready.length){const signed=await bounded(db.storage.from('personal-stamps').createSignedUrls(ready.map(r=>r.object_path),300));if(signed.error)throw signed.error;for(const row of rows)row.thumbnail=signed.data?.find(s=>s.path===row.object_path)?.signedUrl||undefined;}
 return rows;
}
export async function loadPersonalStamp(row:SavedStamp):Promise<CustomAsset>{
 const {data,error}=await bounded(db!.storage.from('personal-stamps').download(row.object_path));if(error)throw error;
 const image_data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error('Could not open saved artwork.'));reader.readAsDataURL(data);});
 const asset={image_data,image_width:row.width,image_height:row.height};if(!validCustomAsset(asset))throw Error('This saved stamp is unavailable or damaged.');return asset;
}
export async function deletePersonalStamp(id:string){await mutate(undefined,id);}
