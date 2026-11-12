import type {Point} from './geometry';
import {resizePhoneStamp} from './cameraPlacement';
type Transform={size:number;rotation:number};
// Screen-space finger state belongs to the interaction, not camera recovery.
// Its baseline changes only when the participating fingers change.
export class PhoneGesture {
 private fingers=new Map<number,Point>();
 private start:Point[]=[];
 private base:Transform|null=null;
 has(id:number){return this.fingers.has(id);}
 begin(id:number,point:Point,value:Transform){
  if(this.has(id)||this.fingers.size>=2)return false;
  this.fingers.set(id,{...point});
  if(this.fingers.size===2){this.base={...value};this.start=[...this.fingers.values()].map(p=>({...p}));}
  return true;
 }
 move(id:number,point:Point){
  if(!this.has(id))return null;
  this.fingers.set(id,{...point});
  return this.base&&this.fingers.size===2?resizePhoneStamp(this.base,this.start,[...this.fingers.values()]):null;
 }
 end(id:number){if(!this.fingers.delete(id))return;this.base=null;this.start=[];}
 clear(){this.fingers.clear();this.base=null;this.start=[];}
}
