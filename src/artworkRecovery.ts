import { validPlacement,type Placement } from './types';
export type CameraSettings={size:number;rotation:number;zoom:1|2};
export function recoveryKey(user:string,session:string){return 'wallpaper-artwork:'+user+':'+session;}
export function readArtwork(key:string):Placement|null{try{const data=JSON.parse(localStorage.getItem(key)||'null');return validPlacement(data)?data:null;}catch{return null;}}
export function writeArtwork(key:string,placement:Placement){if(!validPlacement(placement))return false;try{localStorage.setItem(key,JSON.stringify(placement));return true;}catch{return false;}}
export function readCameraSettings(key?:string):CameraSettings|null{if(!key)return null;try{const v=JSON.parse(localStorage.getItem(key+':camera')||'null');return v&&Number.isFinite(v.size)&&v.size>=.06&&v.size<=.85&&Number.isFinite(v.rotation)&&Math.abs(v.rotation)<=360&&[1,2].includes(v.zoom)?v:null;}catch{return null;}}
export function writeCameraSettings(key:string|undefined,v:CameraSettings){if(key)try{localStorage.setItem(key+':camera',JSON.stringify(v));}catch{/* The private library is the fallback when local storage is full. */}}
