import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FrameGate,TrackingState,processingFrame} from '../src/trackingState.ts';
test('single flight skips duplicate capture timestamps and rejects out-of-order replies',()=>{
 const gate=new FrameGate(),first=gate.begin(1);assert.equal(first,1);assert.equal(gate.begin(2),null);assert.equal(gate.finish(2),false);assert.equal(gate.begin(3),null);assert.equal(gate.finish(first!),true);assert.equal(gate.begin(1),null);const next=gate.begin(4);assert.equal(next,2);assert.equal(gate.finish(1),false);assert.equal(gate.finish(next!),true);
});
test('processing a new frame does not renew a session until its homography validates',()=>{
 const state=new TrackingState();state.accept(100,200);const deadline=state.validUntil;
 for(const at of [300,500,900]){state.reject('insufficient-markers',at);assert.equal(state.validUntil,deadline);assert.equal(state.read(at).phase,'holding');}
 assert.equal(state.read(1201).phase,'lost');state.accept(1300,1400);assert.equal(state.read(1400).phase,'locked');assert.equal(state.validUntil,2400);
});

test('restored processing resolution never turns an over-age result into valid tracking',()=>{const state=new TrackingState();assert.equal(state.accept(100,500).phase,'lost');assert.equal(state.reason,'stale-frame');assert.equal(state.validUntil,0);});

test('camera processing stays at the proven full-frame detail across repeated slow/failing frames',()=>{for(let frame=0;frame<200;frame++){assert.deepEqual(processingFrame(2160,3840),{width:720,height:1280});assert.deepEqual(processingFrame(3840,2160),{width:1280,height:720});}assert.deepEqual(processingFrame(640,480),{width:640,height:480});});
