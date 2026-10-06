// Photo appearance similarity, not a calibrated probability of authenticity.
export const COLOR_PIPELINE_VERSION='auto-lips-v3';
export const ZERO_SIMILARITY_DELTA_E=30;
export const MAX_OFFICIAL_DELTA_E=20;
export function rgbToLab(rgb){
 const c=rgb.map(v=>{v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4)});
 const xyz=[(c[0]*.4124564+c[1]*.3575761+c[2]*.1804375)/.95047,c[0]*.2126729+c[1]*.7151522+c[2]*.0721750,(c[0]*.0193339+c[1]*.1191920+c[2]*.9503041)/1.08883];
 const f=xyz.map(v=>v>216/24389?Math.cbrt(v):(24389/27*v+16)/116);
 return [116*f[1]-16,500*(f[0]-f[1]),200*(f[1]-f[2])];
}
export function deltaE2000(a,b){
 const rad=Math.PI/180,deg=180/Math.PI,meanL=(a[0]+b[0])/2,c1=Math.hypot(a[1],a[2]),c2=Math.hypot(b[1],b[2]),meanC=(c1+c2)/2;
 const g=.5*(1-Math.sqrt(Math.pow(meanC,7)/(Math.pow(meanC,7)+Math.pow(25,7))));
 const a1=(1+g)*a[1],a2=(1+g)*b[1],cp1=Math.hypot(a1,a[2]),cp2=Math.hypot(a2,b[2]);
 const hue=(x,y)=>Math.hypot(x,y)===0?0:(Math.atan2(y,x)*deg+360)%360;
 const h1=hue(a1,a[2]),h2=hue(a2,b[2]);let dh=h2-h1;
 if(cp1*cp2===0)dh=0;else if(dh>180)dh-=360;else if(dh< -180)dh+=360;
 const dl=b[0]-a[0],dc=cp2-cp1,dH=2*Math.sqrt(cp1*cp2)*Math.sin(dh/2*rad),mc=(cp1+cp2)/2;
 let mh;if(cp1*cp2===0)mh=h1+h2;else if(Math.abs(h1-h2)<=180)mh=(h1+h2)/2;else mh=(h1+h2+(h1+h2<360?360:-360))/2;
 const t=1-.17*Math.cos((mh-30)*rad)+.24*Math.cos(2*mh*rad)+.32*Math.cos((3*mh+6)*rad)-.20*Math.cos((4*mh-63)*rad);
 const sl=1+.015*Math.pow(meanL-50,2)/Math.sqrt(20+Math.pow(meanL-50,2)),sc=1+.045*mc,sh=1+.015*mc*t;
 const rt=-2*Math.sqrt(Math.pow(mc,7)/(Math.pow(mc,7)+Math.pow(25,7)))*Math.sin(60*Math.exp(-Math.pow((mh-275)/25,2))*rad);
 return Math.sqrt(Math.pow(dl/sl,2)+Math.pow(dc/sc,2)+Math.pow(dH/sh,2)+rt*(dc/sc)*(dH/sh));
}
export function similarityFromDeltaE(d){
 return Number.isFinite(d)?Math.round(100*Math.max(0,1-d/ZERO_SIMILARITY_DELTA_E)):null;
}
export function nearestOfficialColor(metrics,officials,variant='unknown'){
 if(!Array.isArray(metrics?.lab)||metrics.lab.length!==3||!metrics.lab.every(Number.isFinite))return null;
 const candidates=(officials||[]).filter(o=>o.metrics?.roiDetected===true&&Array.isArray(o.metrics.lab)&&o.metrics.lab.length===3&&o.metrics.lab.every(Number.isFinite)&&(variant==='unknown'||!variant||o.variant===variant));
 let best=null;
 for(const official of candidates){const distance=deltaE2000(metrics.lab,official.metrics.lab);if(!best||distance<best.distance)best={official,distance}}
 return best;
}
export function assessReferenceSample(metrics,officials,variant='unknown'){
 if(metrics?.roiDetected!==true)return {use:false,code:'no_reliable_lips',reason:metrics?.roiReason||'未识别到可靠唇部'};
 if(metrics.roiSource==='semantic-lips'&&(!Number.isFinite(metrics.segmentationConfidence)||metrics.segmentationConfidence<.65))return {use:false,code:'low_segmentation_confidence',reason:'唇部自动选区置信度不足'};
 const match=nearestOfficialColor(metrics,officials,variant);
 if(!match)return {use:false,code:'missing_official',reason:'缺少对应产品线的可靠标准图'};
 const deltaE=+match.distance.toFixed(2),use=match.distance<=MAX_OFFICIAL_DELTA_E;
 return {use,code:use?'accepted':'official_color_outlier',reason:use?'自动唇部选区通过，颜色在标准图允许范围内':`与对应标准图色差 ΔE00 ${deltaE}，超过 ${MAX_OFFICIAL_DELTA_E}；不用于颜色参考`,deltaE,officialId:match.official.id,officialVariant:match.official.variant};
}
export function compareLipColor(metrics,reference){
 const validLab=lab=>Array.isArray(lab)&&lab.length===3&&lab.every(Number.isFinite);
 if(metrics?.roiDetected!==true||!validLab(metrics.lab)||reference?.pipeline!==COLOR_PIPELINE_VERSION)return null;
 if(reference.officials?.length){
  const match=nearestOfficialColor(metrics,reference.officials,reference.selectedVariant||'unknown');if(!match)return null;
  return {score:similarityFromDeltaE(match.distance),deltaE:+match.distance.toFixed(2),referenceKind:'official',officialId:match.official.id,officialLabel:match.official.label,officialVariant:match.official.variant,referenceCount:reference.samples?.length||0,officialCount:reference.officials.length,variantUnspecified:reference.officials.length>1&&(!reference.selectedVariant||reference.selectedVariant==='unknown')};
 }
 if(!validLab(reference?.center?.lab)||!reference.samples?.length)return null;
 const distance=deltaE2000(metrics.lab,reference.center.lab);
 return {score:similarityFromDeltaE(distance),deltaE:+distance.toFixed(2),referenceCount:reference.samples.length};
}
export function compareUploadedColors(analyses,reference){
 const perImage=analyses.map(a=>compareLipColor(a.metrics,reference));
 const valid=perImage.filter(x=>x&&Number.isFinite(x.score));
 // A mismatching image must not be hidden by another image or by text scores.
 return {score:valid.length?Math.min(...valid.map(x=>x.score)):null,perImage,compared:valid.length,total:analyses.length};
}
