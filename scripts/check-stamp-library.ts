// Opt-in integration test: two temporary anonymous profiles, synthetic PNG only.
// No OpenAI calls. Run: node --env-file=.env.local --import tsx scripts/check-stamp-library.ts
import {createClient} from '@supabase/supabase-js';import assert from 'node:assert/strict';import {pngFixture} from '../tests/ai-png.fixture';
const url=process.env.VITE_SUPABASE_URL!,key=process.env.VITE_SUPABASE_ANON_KEY!;
assert.ok(url&&key);const create=()=>createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});const a=create(),b=create();
const ids:string[]=[];let userA='',userB='',wallpaperId='';let placedPng='';
async function save(client:ReturnType<typeof create>,fakeOwner?:string){const token=(await client.auth.getSession()).data.session!.access_token;const form=new FormData();form.set('image',new Blob([Uint8Array.from(pngFixture())],{type:'image/png'}),'fixture.png');form.set('label','Disposable integration fixture');form.set('kind','ai');if(fakeOwner)form.set('owner_id',fakeOwner);const r=await fetch(url+'/functions/v1/stamp-library',{method:'POST',headers:{Authorization:'Bearer '+token,apikey:key},body:form});const result=await r.json();assert.equal(r.status,200,JSON.stringify(result));return result.item;}
async function remove(client:ReturnType<typeof create>,id:string){const token=(await client.auth.getSession()).data.session!.access_token;return fetch(url+'/functions/v1/stamp-library?id='+id,{method:'DELETE',headers:{Authorization:'Bearer '+token,apikey:key}});}
try{
 for(const client of [a,b])assert.equal((await client.auth.signInAnonymously()).error,null);
 userA=(await a.auth.getSession()).data.session!.user.id;userB=(await b.auth.getSession()).data.session!.user.id;
 const saved=await Promise.all([save(a,userB),save(a)]);assert.equal(saved[0].id,saved[1].id);const item=saved[0];ids.push(item.id);assert.equal(item.owner_id,userA);
 const own=await a.from('personal_stamps').select('*').eq('id',item.id);assert.equal(own.error,null);assert.equal(own.data!.length,1);
 const isolated=await b.from('personal_stamps').select('*').eq('id',item.id);assert.equal(isolated.error,null);assert.equal(isolated.data!.length,0);
 assert.ok((await b.storage.from('personal-stamps').download(item.object_path)).error);
 assert.ok((await b.storage.from('personal-stamps').upload(item.object_path,pngFixture(),{contentType:'image/png'})).error);
 assert.ok((await b.rpc('reserve_personal_stamp',{p_owner:userA,p_hash:'a'.repeat(64),p_label:'Forged',p_kind:'ai',p_width:16,p_height:16,p_bytes:100})).error);
 assert.notEqual((await remove(b,item.id)).status,200);
 const restored=create(),session=(await a.auth.getSession()).data.session!;assert.equal((await restored.auth.setSession({access_token:session.access_token,refresh_token:session.refresh_token})).error,null);
 const downloaded=await restored.storage.from('personal-stamps').download(item.object_path);assert.equal(downloaded.error,null);placedPng=Buffer.from(await downloaded.data!.arrayBuffer()).toString('base64');assert.equal(placedPng,pngFixture().toString('base64'));
 const created=await a.rpc('create_wallpaper');assert.equal(created.error,null);wallpaperId=created.data.id;const stampId=crypto.randomUUID();const imageData='data:image/png;base64,'+placedPng;assert.equal((await a.from('wallpaper_stamps').insert({id:stampId,session_id:wallpaperId,stamp_type:'custom',image_data:imageData,image_width:16,image_height:16,position_x:.5,position_y:.5,scale:160,rotation:35})).error,null);
 assert.equal((await remove(a,item.id)).status,200);assert.equal((await a.from('personal_stamps').select('*').eq('state','ready')).data!.length,0);assert.ok((await a.storage.from('personal-stamps').createSignedUrl(item.object_path,60)).error,'Deleted object issued a fresh download URL');assert.equal(placedPng,pngFixture().toString('base64'),'Deletion changed already-copied placement PNG');
 const persisted=await a.from('wallpaper_stamps').select('image_data,scale,rotation').eq('id',stampId).single();assert.equal(persisted.error,null);assert.equal(persisted.data!.image_data,imageData,'Deleting library changed the permanent wallpaper copy');assert.equal(persisted.data!.rotation,35);
 const again=await save(a);ids.push(again.id);assert.notEqual(again.id,item.id);assert.equal((await remove(a,again.id)).status,200);
 console.log('PASS: authenticated private Storage upload/download, concurrent deduplication, forged ownership ignored, cross-user isolation/RPC denial/delete denial, restored identity reuse, deletion and independent placed PNG, resave after deletion. No OpenAI requests.');
}finally{if(wallpaperId)await a.rpc('reset_wallpaper',{target:wallpaperId});console.log('Disposable empty wallpaper ID:',wallpaperId);for(const id of ids)await remove(a,id).catch(()=>{});console.log('Temporary anonymous test user IDs (no credentials):',userA,userB);await Promise.all([a.removeAllChannels(),b.removeAllChannels()]);}
