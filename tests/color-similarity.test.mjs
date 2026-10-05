import assert from 'node:assert/strict';
import {rgbToLab,deltaE2000,similarityFromDeltaE,compareUploadedColors} from '../color-similarity.js';
// Published CIEDE2000 supplementary test pairs (Sharma et al., 2005).
for(const [a,b,d] of [[[50,2.6772,-79.7751],[50,0,-82.7485],2.0425],[[50,3.1571,-77.2803],[50,0,-82.7485],2.8615],[[50,2.8361,-74.0200],[50,0,-82.7485],3.4412]])assert.ok(Math.abs(deltaE2000(a,b)-d)<.0001);
assert.equal(similarityFromDeltaE(0),100);assert.equal(similarityFromDeltaE(30),0);
assert.equal(similarityFromDeltaE(15),50);assert.equal(similarityFromDeltaE(null),null);
const warm=rgbToLab([160,80,80]),blue=rgbToLab([20,35,200]);
const ref={pipeline:'auto-lips-v2',center:{lab:warm},samples:[{}]};
const image=lab=>({metrics:{roiDetected:true,lab}});
assert.equal(compareUploadedColors([image(warm)],ref).score,100);
assert.equal(compareUploadedColors([image(blue)],ref).score,0);
assert.equal(compareUploadedColors([image(warm),image(blue)],ref).score,0);
assert.equal(compareUploadedColors([{metrics:{roiDetected:false,lab:null}}],ref).score,null);
assert.equal(compareUploadedColors([image(blue)],{center:{lab:warm},samples:[{}]}).score,null);
assert.equal(compareUploadedColors([image(blue)],{pipeline:'auto-lips-v2',center:{lab:warm},samples:[]}).score,null);
assert.equal(compareUploadedColors([image([NaN,0,0])],ref).score,null);
console.log('PASS CIEDE2000 standard pairs, similarity endpoints, blue/warm mismatch, missing ROI/reference and legacy baseline rejection');
