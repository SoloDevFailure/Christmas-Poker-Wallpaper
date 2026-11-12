import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import Camera from '../src/Camera.tsx';
import {screenArtworkStyle} from '../src/screenArtwork.ts';
import {PhoneGesture} from '../src/phoneGesture.ts';
import {phoneFixedPlacement} from '../src/cameraPlacement.ts';
import {videoViewport} from '../src/manipulation.ts';
import {TrackingState} from '../src/trackingState.ts';
const artwork={stamp_type:'star' as const,position_x:.5,position_y:.5,scale:160,rotation:0};
test('Camera Stamp artwork renders visibly before any tracking solution exists',()=>{const html=renderToStaticMarkup(React.createElement(Camera,{placement:artwork,onPlacement:()=>{},onStatus:()=>{},debug:false,trackingDebug:false,onMetrics:()=>{},calibration:{x:0,y:0},aimReset:0,mode:'camera-stamp',onPrecisionChange:()=>{},disabled:false}));assert.match(html,/alt="Selected sticker"[^>]*display:block/);assert.doesNotMatch(html,/display:none/);assert.match(html,/left:50%;top:50%/);});
test('screen artwork size, rotation and transparency aspect never require a homography',()=>{const p={...artwork,stamp_type:'custom' as const,image_width:400,image_height:100};assert.deepEqual(screenArtworkStyle(p,{size:.5,rotation:73},300),{width:'100px',height:'25px',transform:'translate(-50%, -50%) rotate(73deg) scale(1.5)'});});
test('gesture feedback continues through VALID, HELD and LOST without renewing stamp permission',()=>{const tracking=new TrackingState(),gesture=new PhoneGesture();tracking.accept(0,10);gesture.begin(1,{x:0,y:0},{size:.2,rotation:0});gesture.begin(2,{x:100,y:0},{size:.2,rotation:0});for(const [now,phase] of [[100,'locked'],[400,'holding'],[1200,'lost']] as const){assert.equal(tracking.read(now).phase,phase);const intent=gesture.move(2,{x:100+now/10,y:0})!;assert.ok(screenArtworkStyle(artwork,intent,200).transform.includes('scale('));assert.equal(tracking.validUntil,1010);}assert.equal(tracking.read(1200).stampable,false);});
test('latest gesture values map to a stamp without waiting for a published React placement',()=>{const gesture=new PhoneGesture();gesture.begin(1,{x:0,y:0},{size:.2,rotation:0});gesture.begin(2,{x:100,y:0},{size:.2,rotation:0});const intent=gesture.move(2,{x:0,y:150})!,v=videoViewport(844,390,1920,1080,'contain',2),screen={centre:{x:422,y:195},size:100*intent.size,rotation:intent.rotation};const p=phoneFixedPlacement(artwork,[1,0,0,0,1,0,0,0],v,screen);assert.equal(p.rotation,90);assert.ok(Math.abs(p.position_x-.5)<1e-9);assert.ok(Math.abs(p.position_y-.5)<1e-9);gesture.end(1);gesture.end(2);assert.equal(gesture.active,false);assert.equal(intent.rotation,90);});

test('independent preview cannot silently submit a different clamped stamp size',()=>{const v=videoViewport(844,390,1920,1080,'contain',2),screen={centre:{x:422,y:195},size:800,rotation:0};const raw=phoneFixedPlacement(artwork,[1,0,0,0,1,0,0,0],v,screen,false);assert.ok(raw.scale>600);const legacy=phoneFixedPlacement(artwork,[1,0,0,0,1,0,0,0],v,screen);assert.equal(legacy.scale,600);});
