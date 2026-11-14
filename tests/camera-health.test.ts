import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CameraHealth} from '../src/cameraHealth';
test('ordinary marker loss with continuing video and completed frames is not a stall',()=>{const h=new CameraHealth(0);h.complete();for(let at=0;at<30000;at+=100){h.video(at/1000,at);h.begin(at);h.complete();assert.equal(h.problem(at,true,false),'');}});
test('stuck capture/worker locks, ended tracks and no new frames are distinct failures',()=>{const h=new CameraHealth(0);h.video(1,100);assert.match(h.problem(6101,true,false),/processing/);h.complete();assert.match(h.problem(6200,true,false),/new frames/);assert.match(h.problem(100,true,false,true),/stream stopped/);const f=new CameraHealth(0);for(let i=0;i<8;i++)f.failure();assert.match(f.problem(100,true,false),/capture/);});
test('hidden pages and deliberately paused drawing do not trigger restart loops',()=>{const h=new CameraHealth(0);assert.equal(h.problem(9000,false,false),'');assert.equal(h.problem(9010,true,false),'');assert.equal(h.problem(20000,true,true),'');assert.equal(h.problem(20010,true,false),'');const replacement=new CameraHealth(20000);replacement.complete();replacement.video(1,20000);assert.equal(replacement.problem(20001,true,false),'');});

test('lost scheduling is detected even when the video clock continues advancing',()=>{const h=new CameraHealth(0);h.complete(false,0);for(let now=0;now<=7000;now+=100)h.video(now/1000,now);assert.match(h.problem(7001,true,false),/processing loop/);});

test('visibility resume resets only health deadlines after suspended browser timers',()=>{const h=new CameraHealth(0);h.begin(1);assert.match(h.problem(100000,true,false),/stalled/);assert.equal(h.problem(100000,false,true),'');assert.equal(h.problem(100001,true,false),'');assert.match(h.problem(106001,true,false),/stalled/);});
