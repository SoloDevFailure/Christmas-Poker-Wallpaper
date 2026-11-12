import {MAX_TRACKING_AGE} from './manipulation';
export const RECOVERY_HOLD=1000;
export type TrackingPhase='locked'|'holding'|'lost';
export function withinTrackingGrace(validUntil:number,now:number){return Number.isFinite(validUntil)&&validUntil>0&&now>=0&&now<=validUntil;}
// Only a newly validated solution advances the monotonic grace deadline.
export class TrackingState {
 private captured:number|null=null;
 private received:number|null=null;
 private accepted=false;
 reason='';
 lastRejection='';
 get validUntil(){return this.received===null?0:this.received+RECOVERY_HOLD;}
 accept(at:number,now:number){if(now-at>MAX_TRACKING_AGE||at>now)return this.reject('stale-frame',now);this.captured=at;this.received=now;this.accepted=true;this.reason='';return this.read(now);}
 reject(reason:string,now:number,immediate=false){this.accepted=false;this.reason=reason;this.lastRejection=reason;if(immediate)this.received=null;return this.read(now);}
 read(now:number):{phase:TrackingPhase;stampable:boolean}{const usable=this.received!==null&&now>=this.received&&withinTrackingGrace(this.validUntil,now);const fresh=usable&&this.accepted&&this.captured!==null&&now-this.captured<=MAX_TRACKING_AGE;return {phase:fresh?'locked':usable?'holding':'lost',stampable:usable};}
}

// Preserve the demonstrated 720×1280 portrait / 1280×720 landscape detail.
// Latency must not silently change marker sampling resolution.
export const DETECTION_LONG_EDGE=1280;
// Resize the entire frame; smaller camera sources are never upscaled.
export function processingFrame(width:number,height:number,limit=DETECTION_LONG_EDGE){const scale=Math.min(1,limit/Math.max(width,height));return {width:Math.round(width*scale),height:Math.round(height*scale)};}

export const FRAME_PAUSE=30;
// One transferred image at a time. A duplicate video frame is not a failed
// detection and may never renew a homography timestamp.
export class FrameGate {
 private serial=0;private pending:number|null=null;private mediaTime:number|null=null;
 begin(mediaTime:number){if(this.pending!==null||!Number.isFinite(mediaTime)||mediaTime===this.mediaTime)return null;this.mediaTime=mediaTime;this.pending=++this.serial;return this.pending;}
 finish(id:number){if(id!==this.pending)return false;this.pending=null;return true;}
 cancel(){this.pending=null;}
}
