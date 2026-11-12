import {useCallback,useEffect,useLayoutEffect,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react';
import {createPortal} from 'react-dom';
import {WIDTH,HEIGHT,SnapshotHistory,DrawingPointer,canvasPoint,clampCentre,floodPixels,viewScale,type Point,type DrawingTool} from './drawingCanvas';
import {exportDrawing} from './exportDrawing';
import type {CustomAsset} from '../customStamp';
import './drawing.css';
// Adapted from Scribbledicks DrawingBoard: Canvas 2D tools, raster history,
// shape previews and text layout. No gameplay, persistence or network code.
const colours=['#17131f','#ffffff','#e94f64','#f28c38','#f4d44d','#43a765','#3d79d8','#8b5bc2','#865133','#8b8792'];
const thicknesses=[4,10,22,40];
const names:Record<DrawingTool,string>={pen:'Pen',eraser:'Eraser',fill:'Fill',eyedropper:'Eyedropper',line:'Line',rectangle:'Rectangle',ellipse:'Ellipse',text:'Text',hand:'Move view'};
const icons:Record<DrawingTool,string>={pen:'✎',eraser:'⌫',fill:'▨',eyedropper:'◉',line:'╱',rectangle:'□',ellipse:'○',text:'Aa',hand:'✥'};
type TextBox={x:number;y:number;width:number;height:number;text:string;colour:string;fontSize:number;autoFit:boolean};
function wrappedLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const paragraphs = text.split('\n')
  const lines: string[] = []
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    if (words.length === 0) {
      lines.push('')
      continue
    }
    let line = words[0]!
    for (const word of words.slice(1)) {
      const candidate = `${line} ${word}`
      if (ctx.measureText(candidate).width <= maxWidth) line = candidate
      else {
        lines.push(line)
        line = word
      }
    }
    lines.push(line)
  }
  return lines
}

function fittedFontSize(
  ctx: CanvasRenderingContext2D,
  box: Pick<TextBox, 'width' | 'height' | 'text'>,
  preferred = 72,
): number {
  for (let size = Math.min(preferred, Math.floor(box.height * .7)); size >= 18; size -= 2) {
    ctx.font = `700 ${size}px Arial, sans-serif`
    const lines = wrappedLines(ctx, box.text || 'Type here', Math.max(20, box.width - 20))
    if (lines.length * size * 1.18 <= box.height - 16) return size
  }
  return 18
}


export default function DrawingEditor({onFinish,onCancel}:{onFinish:(asset:CustomAsset)=>void;onCancel:()=>void}){
 const canvas=useRef<HTMLCanvasElement>(null),viewport=useRef<HTMLDivElement>(null),input=useRef<HTMLTextAreaElement>(null);
 const pointer=useRef(new DrawingPointer()).current,history=useRef(new SnapshotHistory<ImageData>()).current;
 const start=useRef<Point|null>(null),last=useRef<Point|null>(null),preview=useRef<ImageData|null>(null),shapeFrame=useRef<number|null>(null);
 const centreRef=useRef<Point>({x:WIDTH/2,y:HEIGHT/2}),cached=useRef({left:0,top:0,width:1,height:1,scale:1});
 const panStart=useRef<{x:number;y:number;centre:Point}|null>(null),textDrag=useRef<{id:number;mode:'move'|'resize';x:number;y:number;box:TextBox;scale:number}|null>(null);
 const [tool,setTool]=useState<DrawingTool>('pen'),[colour,setColour]=useState(colours[0]),[thickness,setThickness]=useState(1),[more,setMore]=useState<'tools'|'colour'|'size'|null>(null);
 const [,historyVersion]=useState(0),[activeTextBox,setActiveTextBox]=useState<TextBox|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[clearConfirm,setClearConfirm]=useState(false);
 const [view,setView]=useState({width:1,height:1}),[centre,setCentre]=useState(centreRef.current),[fit,setFit]=useState<boolean|null>(null);
 const [screen,setScreen]=useState({height:window.visualViewport?.height||window.innerHeight,top:window.visualViewport?.offsetTop||0});
 const scale=viewScale(view.width,view.height,fit??view.width>=view.height);
 const context=useCallback(()=>canvas.current?.getContext('2d',{willReadFrequently:true})??null,[]);
 const commit=useCallback(()=>{const ctx=context();if(!ctx)return;history.push(ctx.getImageData(0,0,WIDTH,HEIGHT));historyVersion(v=>v+1);},[context,history]);
 const flattenTextBox=(box:TextBox)=>{if(!box.text.trim())return;const ctx=context()!;const fontSize=box.autoFit?fittedFontSize(ctx,box):box.fontSize;ctx.save();ctx.globalCompositeOperation='source-over';ctx.beginPath();ctx.rect(box.x,box.y,box.width,box.height);ctx.clip();ctx.fillStyle=box.colour;ctx.font='700 '+fontSize+'px Arial, sans-serif';ctx.textBaseline='top';const lineHeight=fontSize*1.18;wrappedLines(ctx,box.text.trim(),Math.max(20,box.width-20)).slice(0,Math.max(1,Math.floor((box.height-16)/lineHeight))).forEach((line,i)=>ctx.fillText(line,box.x+10,box.y+8+i*lineHeight));ctx.restore();};
 const commitText=()=>{if(!activeTextBox)return;flattenTextBox(activeTextBox);setActiveTextBox(null);if(activeTextBox.text.trim())commit();};
 function settings(ctx:CanvasRenderingContext2D){ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=thicknesses[thickness];ctx.strokeStyle=tool==='eraser'?'#000':colour;ctx.globalCompositeOperation=tool==='eraser'?'destination-out':'source-over';}
 function shape(){shapeFrame.current=null;const ctx=context(),a=start.current,b=last.current;if(!ctx||!a||!b)return;if(preview.current)ctx.putImageData(preview.current,0,0);if(tool==='text')return;settings(ctx);ctx.beginPath();if(tool==='line'){ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);}else if(tool==='rectangle')ctx.rect(a.x,a.y,b.x-a.x,b.y-a.y);else ctx.ellipse((a.x+b.x)/2,(a.y+b.y)/2,Math.abs(b.x-a.x)/2,Math.abs(b.y-a.y)/2,0,0,Math.PI*2);ctx.stroke();ctx.globalCompositeOperation='source-over';}
 function finishStroke(){
  if(pointer.id===null)return;pointer.id=null;
  if(tool==='hand'){panStart.current=null;return;}
  if(shapeFrame.current!==null){cancelAnimationFrame(shapeFrame.current);shape();}
  const a=start.current,b=last.current;
  if(tool==='text'&&a&&b){if(preview.current)context()!.putImageData(preview.current,0,0);const x=Math.max(0,Math.min(a.x,b.x)),y=Math.max(0,Math.min(a.y,b.y));setActiveTextBox({x,y,width:Math.min(WIDTH-x,Math.max(280,Math.abs(b.x-a.x))),height:Math.min(HEIGHT-y,Math.max(160,Math.abs(b.y-a.y))),text:'',colour,fontSize:48,autoFit:true});setTimeout(()=>input.current?.focus(),0);}
  else{context()!.globalCompositeOperation='source-over';commit();}
  start.current=null;last.current=null;preview.current=null;
 }
 const finishRef=useRef(finishStroke);finishRef.current=finishStroke;
 useLayoutEffect(()=>{commit();return()=>{history.clear();if(shapeFrame.current!==null)cancelAnimationFrame(shapeFrame.current);};},[commit,history]);
 useEffect(()=>{const update=()=>setScreen({height:window.visualViewport?.height||window.innerHeight,top:window.visualViewport?.offsetTop||0});window.visualViewport?.addEventListener('resize',update);window.visualViewport?.addEventListener('scroll',update);window.addEventListener('resize',update);return()=>{window.visualViewport?.removeEventListener('resize',update);window.visualViewport?.removeEventListener('scroll',update);window.removeEventListener('resize',update);};},[]);
 useLayoutEffect(()=>{const node=viewport.current;if(!node)return;const update=()=>{finishRef.current();const r=node.getBoundingClientRect();setView({width:r.width,height:r.height});};const observer=new ResizeObserver(update);observer.observe(node);update();return()=>observer.disconnect();},[]);
 useLayoutEffect(()=>{const next=clampCentre(centreRef.current,view.width,view.height,scale);centreRef.current=next;setCentre(next);},[scale,view.width,view.height]);
 function point(e:{clientX:number;clientY:number}){return canvasPoint(e.clientX,e.clientY,cached.current,centreRef.current);}
 function down(e:ReactPointerEvent<HTMLDivElement>){
  if(busy||textDrag.current||e.button!==0||pointer.id!==null)return;
  if(activeTextBox){commitText();return;}
  const r=viewport.current!.getBoundingClientRect();cached.current={left:r.left,top:r.top,width:r.width,height:r.height,scale};const p=point(e);
  if(tool!=='hand'&&(p.x<0||p.y<0||p.x>=WIDTH||p.y>=HEIGHT))return;
  if(!pointer.begin(e.pointerId))return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);setError('');
  if(tool==='hand'){panStart.current={x:e.clientX,y:e.clientY,centre:{...centreRef.current}};return;}
  const ctx=context()!;
  if(tool==='fill'){const image=ctx.getImageData(0,0,WIDTH,HEIGHT);if(floodPixels(image.data,WIDTH,HEIGHT,p,colour)){ctx.putImageData(image,0,0);commit();}pointer.end(e.pointerId);return;}
  if(tool==='eyedropper'){const pixel=ctx.getImageData(Math.floor(p.x),Math.floor(p.y),1,1).data;if(pixel[3]){setColour('#'+[...pixel.slice(0,3)].map(v=>v.toString(16).padStart(2,'0')).join(''));setTool('pen');}pointer.end(e.pointerId);return;}
  start.current=p;last.current=p;
  if(tool==='pen'||tool==='eraser'){settings(ctx);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x+.01,p.y+.01);ctx.stroke();}
  else preview.current=ctx.getImageData(0,0,WIDTH,HEIGHT);
 }
 function move(e:ReactPointerEvent<HTMLDivElement>){
  if(busy||!pointer.has(e.pointerId))return;e.preventDefault();
  if(tool==='hand'){const p=panStart.current;if(p){const next=clampCentre({x:p.centre.x-(e.clientX-p.x)/scale,y:p.centre.y-(e.clientY-p.y)/scale},view.width,view.height,scale);centreRef.current=next;setCentre(next);}return;}
  const ctx=context();if(!ctx||!start.current||!last.current)return;
  if(tool==='pen'||tool==='eraser'){settings(ctx);ctx.beginPath();ctx.moveTo(last.current.x,last.current.y);const events=e.nativeEvent.getCoalescedEvents?.()||[];for(const event of events.length?events:[e]){const p=point(event);ctx.lineTo(p.x,p.y);last.current=p;}ctx.stroke();}
  else{last.current=point(e);if(shapeFrame.current===null)shapeFrame.current=requestAnimationFrame(shape);}
 }
 function up(e:ReactPointerEvent<HTMLDivElement>){if(!pointer.has(e.pointerId))return;e.preventDefault();finishStroke();}
 function chooseTool(next:DrawingTool){finishStroke();commitText();setTool(next);setMore(null);setClearConfirm(false);}
 function chooseColour(value:string){finishStroke();setColour(value);setActiveTextBox(box=>box?{...box,colour:value}:null);}
 function undo(){finishStroke();commitText();const snapshot=history.undo();if(snapshot)context()!.putImageData(snapshot,0,0);historyVersion(v=>v+1);}
 function redo(){finishStroke();commitText();const snapshot=history.redo();if(snapshot)context()!.putImageData(snapshot,0,0);historyVersion(v=>v+1);}
 function clear(){finishStroke();commitText();const ctx=context()!;ctx.globalCompositeOperation='source-over';ctx.clearRect(0,0,WIDTH,HEIGHT);commit();setClearConfirm(false);}
 function beginText(e:ReactPointerEvent<HTMLButtonElement>,mode:'move'|'resize'){
  if(!activeTextBox||busy||textDrag.current||pointer.id!==null)return;e.preventDefault();e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);textDrag.current={id:e.pointerId,mode,x:e.clientX,y:e.clientY,box:{...activeTextBox},scale};
 }
 function moveText(e:ReactPointerEvent<HTMLButtonElement>){const t=textDrag.current;if(!t||t.id!==e.pointerId)return;e.preventDefault();e.stopPropagation();const dx=(e.clientX-t.x)/t.scale,dy=(e.clientY-t.y)/t.scale,b=t.box;if(t.mode==='move')setActiveTextBox({...b,x:Math.max(0,Math.min(WIDTH-b.width,b.x+dx)),y:Math.max(0,Math.min(HEIGHT-b.height,b.y+dy))});else{const next={...b,width:Math.max(80,Math.min(WIDTH-b.x,b.width+dx)),height:Math.max(50,Math.min(HEIGHT-b.y,b.height+dy))};if(next.autoFit)next.fontSize=fittedFontSize(context()!,next);setActiveTextBox(next);}}
 function endText(e:ReactPointerEvent<HTMLButtonElement>){if(textDrag.current?.id===e.pointerId)textDrag.current=null;}
 async function finish(){if(busy)return;finishStroke();commitText();setBusy(true);setError('');try{await document.fonts?.ready;onFinish(await exportDrawing(canvas.current!));}catch(e){setError(e instanceof Error?e.message:String(e));setBusy(false);}}
 function cancel(){onCancel();}
 const toggle=(panel:typeof more)=>{finishStroke();setClearConfirm(false);setMore(m=>m===panel?null:panel);};
 const toolButton=(value:DrawingTool)=><button type="button" key={value} aria-label={names[value]} aria-pressed={tool===value} disabled={busy} onClick={()=>chooseTool(value)}><span aria-hidden="true">{icons[value]}</span><small>{names[value]}</small></button>;
 const textFont=activeTextBox?(activeTextBox.autoFit?fittedFontSize(context()!,activeTextBox):activeTextBox.fontSize):48;
 return createPortal(<section className="drawing-editor" role="dialog" aria-modal="true" aria-label="Drawing editor" style={{height:screen.height,top:screen.top}}>
  <header className="drawing-header"><button type="button" onClick={cancel} disabled={busy}>Cancel</button><strong>Draw a sticker</strong><button type="button" className="drawing-finish" onClick={()=>void finish()} disabled={busy}>{busy?'Preparing…':'Finish'}</button></header>
  <nav className="drawing-view-tools" aria-label="Canvas view"><button type="button" onClick={()=>{finishStroke();setFit(!(fit??view.width>=view.height));}} disabled={busy}>{(fit??view.width>=view.height)?'Fill view':'Fit canvas'}</button>{toolButton('hand')}<span className="drawing-selected"><b>{names[tool]}</b><i style={{background:colour}}/>{thicknesses[thickness]} px</span></nav>
  <div ref={viewport} className="drawing-viewport" aria-label="Drawing workspace" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up} onContextMenu={e=>e.preventDefault()}>
   <div className="drawing-paper" style={{width:WIDTH,height:HEIGHT,transform:'translate('+view.width/2+'px,'+view.height/2+'px) scale('+scale+') translate('+(-centre.x)+'px,'+(-centre.y)+'px)'}}>
    <canvas ref={canvas} width={WIDTH} height={HEIGHT} aria-label="Drawing canvas"/>
    {activeTextBox&&<div className="drawing-text-box" style={{left:activeTextBox.x,top:activeTextBox.y,width:activeTextBox.width,height:activeTextBox.height,color:activeTextBox.colour,fontSize:textFont}}>
     <div className="drawing-text-preview">{activeTextBox.text||'Type below…'}</div>
     <button type="button" aria-label="Move text" className="drawing-text-move" style={{width:44/scale,height:44/scale,fontSize:12/scale}} onPointerDown={e=>beginText(e,'move')} onPointerMove={moveText} onPointerUp={endText} onPointerCancel={endText} onLostPointerCapture={endText}>Move</button>
     <button type="button" aria-label="Resize text" className="drawing-text-resize" style={{width:44/scale,height:44/scale,fontSize:20/scale}} onPointerDown={e=>beginText(e,'resize')} onPointerMove={moveText} onPointerUp={endText} onPointerCancel={endText} onLostPointerCapture={endText}>↘</button>
    </div>}
   </div>
  </div>
  {error&&<p className="drawing-error" role="alert">{error}</p>}
  {clearConfirm&&<div className="drawing-confirm"><span>Clear the drawing? You can undo.</span><button type="button" onClick={()=>setClearConfirm(false)}>Keep drawing</button><button type="button" onClick={clear}>Clear drawing</button></div>}
  {activeTextBox&&<div className="drawing-text-controls"><label>Text<textarea ref={input} aria-label="Drawing text" rows={2} maxLength={300} value={activeTextBox.text} onChange={e=>setActiveTextBox(box=>box?{...box,text:e.target.value}:null)}/></label><label>Text size<select aria-label="Text size" value={activeTextBox.autoFit?0:activeTextBox.fontSize} onChange={e=>{const size=+e.target.value;setActiveTextBox(box=>box?{...box,autoFit:size===0,fontSize:size||48}:null);}}><option value="0">Auto fit</option>{[18,28,48,72].map(size=><option key={size} value={size}>{size} px</option>)}</select></label><button type="button" onClick={commitText}>Done text</button></div>}
  {more&&<div className="drawing-panel" aria-label={more==='tools'?'More drawing tools':more==='colour'?'Drawing colours':'Brush sizes'}>
   {more==='tools'&&<>{(['fill','eyedropper','line','rectangle','ellipse','text'] as DrawingTool[]).map(toolButton)}<button type="button" onClick={()=>{finishStroke();setClearConfirm(true);setMore(null);}}>Clear</button></>}
   {more==='colour'&&<>{colours.map(value=><button type="button" key={value} aria-label={'Use colour '+value} aria-pressed={colour===value} style={{background:value}} onClick={()=>chooseColour(value)}/>)}<label className="drawing-custom-colour">Custom<input aria-label="Custom drawing colour" type="color" value={colour} onChange={e=>chooseColour(e.target.value)}/></label></>}
   {more==='size'&&thicknesses.map((size,index)=><button type="button" key={size} aria-label={'Brush '+size+' pixels'} aria-pressed={thickness===index} onClick={()=>{finishStroke();setThickness(index);setMore(null);}}><i className="drawing-brush-dot" style={{width:Math.min(24,size),height:Math.min(24,size)}}/>{size} px</button>)}
  </div>}
  <nav className="drawing-dock" aria-label="Drawing tools">{toolButton('pen')}{toolButton('eraser')}<button type="button" aria-label="Colour" aria-expanded={more==='colour'} onClick={()=>toggle('colour')} disabled={busy}><i className="drawing-colour-indicator" style={{background:colour}}/><small>Colour</small></button><button type="button" aria-label="Brush size" aria-expanded={more==='size'} onClick={()=>toggle('size')} disabled={busy}><b>{thicknesses[thickness]}</b><small>Size</small></button><button type="button" aria-label="Undo" onClick={undo} disabled={!history.canUndo||busy}>↶<small>Undo</small></button><button type="button" aria-label="Redo" onClick={redo} disabled={!history.canRedo||busy}>↷<small>Redo</small></button></nav>
  <button type="button" className="drawing-more-button" aria-label="More tools" aria-expanded={more==='tools'} onClick={()=>toggle('tools')} disabled={busy}>More tools · shapes, fill &amp; text</button>
 </section>,document.body);
}
