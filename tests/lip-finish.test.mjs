import assert from 'node:assert/strict';
import {renderLipFinish} from '../lip-finish.js';
const w=160,h=100,pixels=new Uint8ClampedArray(w*h*4),mask=new Uint8ClampedArray(w*h*4);
for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4;pixels.set([140+(x%13),105+(x%13),100+(x%13),255],i);
  // The opening between the lips must remain untouched, like the face outside.
  if(x>30&&x<130&&y>25&&y<75&&!(y>45&&y<54))mask.set([255,255,255,255],i);
}
const target={hue:8,saturation:60,brightness:65},matte=pixels.slice(),gloss=pixels.slice();
renderLipFinish(matte,mask,w,h,target,{glossStrength:0});
renderLipFinish(gloss,mask,w,h,target,{glossStrength:.24});
let changed=0,extraLight=0;
for(let i=0;i<pixels.length;i+=4){
  assert.equal(matte[i+3],pixels[i+3]);assert.equal(gloss[i+3],pixels[i+3]);
  if(!mask[i+3]){assert.deepEqual(matte.slice(i,i+4),pixels.slice(i,i+4));assert.deepEqual(gloss.slice(i,i+4),pixels.slice(i,i+4));}
  else{if(matte[i]!==pixels[i])changed++;if(gloss[i]>matte[i])extraLight++;}
}
assert.ok(changed>2000);assert.ok(extraLight>200&&extraLight<changed,'Gloss must be localized, not a blanket white lip');
const dark=(30*w+40)*4,light=(30*w+50)*4;
assert.ok(matte[light]>matte[dark],'Matte coloring must retain local contrast');
const noMask=pixels.slice();renderLipFinish(noMask,new Uint8ClampedArray(mask.length),w,h,target,{glossStrength:.24});assert.deepEqual(noMask,pixels);
const tilted=pixels.slice();renderLipFinish(tilted,mask,w,h,target,{glossStrength:.24},{center:{x:80,y:50},axis:{x:.8,y:.6},width:100,height:50});
for(let i=0;i<pixels.length;i+=4)if(!mask[i+3])assert.deepEqual(tilted.slice(i,i+4),pixels.slice(i,i+4));
console.log('PASS gloss/matte visual differences, preserved lip texture, face/teeth protection and empty mask');
