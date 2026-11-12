export const WIDTH=1280,HEIGHT=720,HISTORY_LIMIT=12;
export type Point={x:number;y:number};
export type DrawingTool='pen'|'eraser'|'fill'|'eyedropper'|'line'|'rectangle'|'ellipse'|'text'|'hand';
export function viewScale(width:number,height:number,fit:boolean){return (fit?Math.min:Math.max)(width/WIDTH,height/HEIGHT);}
export function canvasPoint(x:number,y:number,view:{left:number;top:number;width:number;height:number;scale:number},centre:Point){return {x:centre.x+(x-view.left-view.width/2)/view.scale,y:centre.y+(y-view.top-view.height/2)/view.scale};}
export function clampCentre(point:Point,width:number,height:number,scale:number){const halfX=Math.min(WIDTH/2,width/scale/2),halfY=Math.min(HEIGHT/2,height/scale/2);return {x:Math.max(halfX,Math.min(WIDTH-halfX,point.x)),y:Math.max(halfY,Math.min(HEIGHT-halfY,point.y))};}
export class DrawingPointer {id:number|null=null;begin(id:number){if(this.id!==null)return false;this.id=id;return true;}has(id:number){return this.id===id;}end(id:number){if(!this.has(id))return false;this.id=null;return true;}}
// Scribbledicks' tolerance-based raster fill, bounded to the canvas and alpha.
export function floodPixels(pixels:Uint8ClampedArray,width:number,height:number,point:Point,colour:string){
 const x=Math.max(0,Math.min(width-1,Math.floor(point.x))),y=Math.max(0,Math.min(height-1,Math.floor(point.y))),offset=(y*width+x)*4;
 const hex=parseInt(colour.slice(1),16),replacement=[hex>>16&255,hex>>8&255,hex&255,255],target=Array.from(pixels.slice(offset,offset+4));
 if(target.every((v,i)=>v===replacement[i]))return false;
 const visited=new Uint8Array(width*height),stack=[y*width+x];visited[y*width+x]=1;
 while(stack.length){const index=stack.pop()!,i=index*4;if(!target.every((v,k)=>Math.abs(pixels[i+k]-v)<=24))continue;pixels.set(replacement,i);
 const px=index%width,py=Math.floor(index/width);for(const next of [px>0?index-1:-1,px<width-1?index+1:-1,py>0?index-width:-1,py<height-1?index+width:-1])if(next>=0&&!visited[next]){visited[next]=1;stack.push(next);}}
 return true;
}

export class SnapshotHistory<T>{private items:T[]=[];private index=-1;constructor(private limit=HISTORY_LIMIT){}get canUndo(){return this.index>0;}get canRedo(){return this.index>=0&&this.index<this.items.length-1;}get length(){return this.items.length;}push(value:T){this.items=this.items.slice(0,this.index+1);this.items.push(value);if(this.items.length>this.limit)this.items.shift();this.index=this.items.length-1;}undo(){return this.canUndo?this.items[--this.index]:null;}redo(){return this.canRedo?this.items[++this.index]:null;}clear(){this.items=[];this.index=-1;}}
