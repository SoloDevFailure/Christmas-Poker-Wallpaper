import {MAX_TRACKING_AGE} from './manipulation';
export const RECOVERY_HOLD=700;
export type TrackingPhase='locked'|'holding'|'lost';
// Freshness controls submissions; receipt-based hysteresis controls presentation.
export class TrackingState {
 private captured:number|null=null;
 private received:number|null=null;
 private accepted=false;
 reason='';
 lastRejection='';
 accept(at:number,now:number){if(now-at>MAX_TRACKING_AGE||at>now)return this.reject('stale-frame',now);this.captured=at;this.received=now;this.accepted=true;this.reason='';return this.read(now);}
 reject(reason:string,now:number,immediate=false){this.accepted=false;this.reason=reason;this.lastRejection=reason;if(immediate)this.received=null;return this.read(now);}
 read(now:number):{phase:TrackingPhase;stampable:boolean}{const fresh=this.accepted&&this.captured!==null&&now-this.captured<=MAX_TRACKING_AGE;return {phase:fresh?'locked':this.received!==null&&now-this.received<=RECOVERY_HOLD?'holding':'lost',stampable:fresh};}
}

// Bound total detector work equally in portrait and landscape, without cropping.
export function processingFrame(width:number,height:number,limit:number){const scale=Math.min(1,limit/Math.max(width,height));return {width:Math.round(width*scale),height:Math.round(height*scale)};}

export const FRAME_PAUSE=30;
// The previous solution must remain fresh until its successor arrives. A 350ms
// capture-age limit needs roughly TWO processing intervals, not just one.
export function processingBudget(current:number,latency:number,needsDetail:boolean){
 const budget=MAX_TRACKING_AGE-20;
 if(current>960&&2*latency+FRAME_PAUSE>budget)return current>1280?1280:960;
 const target=Math.min(1920,current*1.5);
 if(needsDetail&&target>current&&2*latency*(target/current)**2+FRAME_PAUSE<budget)return target;
 return current;
}
