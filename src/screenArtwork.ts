import {stampDimensions,type Placement} from './types';
// Pure screen-space artwork: no pose, camera frame, tracking status or network.
export function screenArtworkStyle(asset:Placement,controls:{size:number;rotation:number},reference:number){
 const {width,height}=stampDimensions({...asset,scale:100});
 return {width:width+'px',height:height+'px',transform:'translate(-50%, -50%) rotate('+controls.rotation+'deg) scale('+(controls.size*reference/100)+')'};
}
