import assert from 'node:assert/strict';
import {rgbToLab,assessReferenceSample,compareLipColor,MAX_OFFICIAL_DELTA_E} from '../color-similarity.js';
import {retainPrimaryLipRegion} from '../semantic-lips.js';
const warm=rgbToLab([186,93,87]),blue=rgbToLab([20,35,200]);
const metrics=lab=>({roiDetected:true,roiSource:'semantic-lips',segmentationConfidence:.9,lab});
const standards=[{id:'warm',variant:'cream',label:'Cream',metrics:metrics(warm)},{id:'blue',variant:'intimatte',label:'Intimatte',metrics:metrics(blue)}];
const reference={pipeline:'auto-lips-v3',officials:standards,samples:[]};
assert.equal(MAX_OFFICIAL_DELTA_E,20);
assert.equal(assessReferenceSample(metrics(warm),standards,'cream').use,true);
const rejected=assessReferenceSample(metrics(blue),standards,'cream');
assert.equal(rejected.use,false);assert.equal(rejected.code,'official_color_outlier');assert.ok(rejected.deltaE>20);assert.equal(rejected.officialId,'warm');
assert.equal(assessReferenceSample({...metrics(warm),segmentationConfidence:.64},standards,'cream').code,'low_segmentation_confidence');
assert.equal(assessReferenceSample({roiDetected:false},standards).code,'no_reliable_lips');
assert.equal(assessReferenceSample(metrics(warm),standards,'legacy').code,'missing_official');
assert.equal(assessReferenceSample(metrics(blue),standards,'unknown').use,true);
assert.equal(compareLipColor(metrics(blue),{...reference,selectedVariant:'cream'}).score,0,'Known SKU must not match another standard');
assert.equal(compareLipColor(metrics(blue),reference).score,100,'Official standard works without accepted user samples');
assert.equal(compareLipColor(metrics(blue),reference).variantUnspecified,true);
assert.equal(compareLipColor(metrics(blue),{...reference,selectedVariant:'legacy'}),null);
assert.equal(compareLipColor({roiDetected:false},reference),null);
// One mouth has separated upper/lower lips; an isolated applicator and caption
// must not contaminate its colors. Test topology independently of the model.
const w=80,h=100,pixels=new Uint8ClampedArray(w*h*4);
function rect(x,y,width,height){for(let j=y;j<y+height;j++)for(let i=x;i<x+width;i++)pixels[(j*w+i)*4+3]=255}
rect(15,30,45,8);rect(15,42,45,8);rect(35,80,8,12);rect(3,3,10,2);
const retained=retainPrimaryLipRegion(pixels,w,h);
assert.equal(retained.count,720);assert.equal(pixels[(85*w+38)*4+3],0);assert.equal(pixels[(3*w+4)*4+3],0);assert.equal(pixels[(46*w+30)*4+3],255);
console.log('PASS official outliers, correct SKU, unknown version, missing/weak ROI, official-only comparison and disconnected-mask cleanup');
