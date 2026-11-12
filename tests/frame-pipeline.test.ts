import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FrameGate,TrackingState,processingBudget,FRAME_PAUSE} from '../src/trackingState.ts';
test('single flight skips duplicate capture timestamps and rejects out-of-order replies',()=>{
 const gate=new FrameGate(),first=gate.begin(1);assert.equal(first,1);assert.equal(gate.begin(2),null);assert.equal(gate.finish(2),false);assert.equal(gate.begin(3),null);assert.equal(gate.finish(first!),true);assert.equal(gate.begin(1),null);const next=gate.begin(4);assert.equal(next,2);assert.equal(gate.finish(1),false);assert.equal(gate.finish(next!),true);
});
test('335ms processing at the old 960px floor downshifts until a successor fits the freshness budget',()=>{
 let size=960,latency=335;
 for(let i=0;i<4;i++){const next=processingBudget(size,latency,true);latency*=(next/size)**2;size=next;}
 assert.ok(size<960);assert.ok(2*latency+FRAME_PAUSE<350);
 const state=new TrackingState();state.accept(1000,1000+latency);assert.equal(state.read(1000+2*latency+FRAME_PAUSE).phase,'locked');
});
test('processing a new frame does not renew a session until its homography validates',()=>{
 const state=new TrackingState();state.accept(100,200);const deadline=state.validUntil;
 for(const at of [300,500,900]){state.reject('insufficient-markers',at);assert.equal(state.validUntil,deadline);assert.equal(state.read(at).phase,'holding');}
 assert.equal(state.read(1201).phase,'lost');state.accept(1300,1400);assert.equal(state.read(1400).phase,'locked');assert.equal(state.validUntil,2400);
});

test('processing detail floor never turns an over-age result into valid tracking',()=>{assert.equal(processingBudget(640,400,true),640);const state=new TrackingState();assert.equal(state.accept(100,500).phase,'lost');assert.equal(state.reason,'stale-frame');assert.equal(state.validUntil,0);});
