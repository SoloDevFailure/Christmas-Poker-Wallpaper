import {MAX_IMAGE_WIDTH,MAX_IMAGE_HEIGHT,validCustomAsset,type CustomAsset} from '../customStamp';
export function alphaBounds(data:Uint8ClampedArray,width:number,height:number,padding=8){
 let left=width,top=height,right=-1,bottom=-1;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]>0){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
 if(right<0)return null;
 left=Math.max(0,left-padding);top=Math.max(0,top-padding);right=Math.min(width-1,right+padding);bottom=Math.min(height-1,bottom+padding);
 return {x:left,y:top,width:right-left+1,height:bottom-top+1};
}
export function exportSize(width:number,height:number,attempt=0){const factor=Math.min(1,MAX_IMAGE_WIDTH/width,MAX_IMAGE_HEIGHT/height)*.8**attempt;return {width:Math.max(1,Math.round(width*factor)),height:Math.max(1,Math.round(height*factor))};}
export async function exportDrawing(canvas:HTMLCanvasElement):Promise<CustomAsset>{
 const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw Error('Drawing export is unavailable.');
 const bounds=alphaBounds(context.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height);
 if(!bounds)throw Error('Draw something before choosing Finish.');
 // Yield once so Finish displays its busy state before the bounded PNG work.
 await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
 for(let attempt=0;attempt<12;attempt++){
  const output=document.createElement('canvas'),size=exportSize(bounds.width,bounds.height,attempt);output.width=size.width;output.height=size.height;
  const ctx=output.getContext('2d');if(!ctx)throw Error('Drawing export is unavailable.');
  ctx.drawImage(canvas,bounds.x,bounds.y,bounds.width,bounds.height,0,0,size.width,size.height);
  const asset={image_data:output.toDataURL('image/png'),image_width:size.width,image_height:size.height};if(validCustomAsset(asset))return asset;
 }
 throw Error('This drawing is too detailed to export. Simplify it and try again.');
}
