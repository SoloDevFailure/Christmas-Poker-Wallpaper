// Marker count/acceptance never enters health detection. Only pipeline progress.
export class CameraHealth {
 private media=-1;private frameAt:number;private pending:number|null;private failures=0;private progressAt:number;
 constructor(now:number){this.frameAt=now;this.pending=now;this.progressAt=now;}
 video(time:number,now:number){if(Number.isFinite(time)&&time!==this.media){this.media=time;this.frameAt=now;}}
 begin(now:number){this.pending=now;this.progressAt=now;}
 complete(captureFailure=false,now?:number){this.pending=null;if(now!==undefined)this.progressAt=now;this.failures=captureFailure?this.failures+1:0;}
 failure(){this.pending=null;this.failures++;}
 problem(now:number,visible:boolean,paused:boolean,ended=false){
  if(!visible||paused){this.frameAt=now;this.progressAt=now;if(this.pending!==null)this.pending=now;return '';}
  if(ended)return 'The camera stream stopped.';
  if(this.failures>=8)return 'Camera frame capture keeps failing.';
  if(this.pending!==null&&now-this.pending>6000)return 'Camera processing has stalled.';
  if(now-this.frameAt>6000)return 'The camera stopped delivering new frames.';
  if(now-this.progressAt>6000)return 'The camera processing loop has stopped.';
  return '';
 }
}
