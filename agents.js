import {detectLipLandmarks,createLipMask} from './lips.js?v=20261006-official-v3';
import {createSelectedLipMask} from './lip-selection.js?v=20261006-official-v3';
import {automaticLipMask} from './semantic-lips.js?v=20261006-official-v3';
import {rgbToLab,compareUploadedColors,COLOR_PIPELINE_VERSION} from './color-similarity.js?v=20261006-official-v3';
export const ANALYSIS_KEYWORDS = ['偏暗','偏亮','偏粉','偏紫','偏红','偏橘','偏棕','色差','滤镜','原图','自然光','暖光','冷光','氧化','深唇','浅唇','薄涂','厚涂','显白','荧光','不一样','差距','假货','批次','素颜','无滤镜'];

export function circularHueDistance(a,b){const d=Math.abs(a-b)%360;return Math.min(d,360-d)}
export function rgbToHsv(r,g,b){r/=255;g/=255;b/=255;const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;let h=0;if(d){if(max===r)h=60*(((g-b)/d)%6);else if(max===g)h=60*((b-r)/d+2);else h=60*((r-g)/d+4)}if(h<0)h+=360;return [h,max?d/max*100:0,max*100]}
export function hsvToRgb(h,s,v){s/=100;v/=100;const c=v*s,x=c*(1-Math.abs((h/60)%2-1)),m=v-c;let r=0,g=0,b=0;if(h<60)[r,g,b]=[c,x,0];else if(h<120)[r,g,b]=[x,c,0];else if(h<180)[r,g,b]=[0,c,x];else if(h<240)[r,g,b]=[0,x,c];else if(h<300)[r,g,b]=[x,0,c];else[r,g,b]=[c,0,x];return [Math.round((r+m)*255),Math.round((g+m)*255),Math.round((b+m)*255)]}
export function hsvToHex(h,s,v){const [r,g,b]=hsvToRgb(h,s,v);return '#'+[r,g,b].map(x=>x.toString(16).padStart(2,'0')).join('')}

function loadImage(file){return new Promise((resolve,reject)=>{const img=new Image();const url=URL.createObjectURL(file);img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};img.onerror=reject;img.src=url})}
function canvasURL(c,q=.82){return c.toDataURL('image/jpeg',q)}

export async function analyzeImageFile(file,{lipSelection=null}={}){
 const img=await loadImage(file);const scale=Math.min(1,720/Math.max(img.naturalWidth,img.naturalHeight));const w=Math.max(1,Math.round(img.naturalWidth*scale)),h=Math.max(1,Math.round(img.naturalHeight*scale));
 const base=document.createElement('canvas');base.width=w;base.height=h;const ctx=base.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,w,h);const data=ctx.getImageData(0,0,w,h);const px=data.data;
 let detection,roiReason='',mask=null,roiSource='unavailable',segmentationConfidence=null,roiAugmentation='none';
 if(lipSelection){mask=createSelectedLipMask(lipSelection,w,h);roiSource='selected-lips'}
 else{
  try{const result=await automaticLipMask(base);mask=result.mask;roiAugmentation=result.augmentation||'none';roiReason=result.reason||'';segmentationConfidence=result.confidence??null;if(mask)roiSource='semantic-lips'}catch(e){roiReason='自动唇部分割暂不可用'}
  if(!mask||segmentationConfidence<.65)try{detection=await detectLipLandmarks(base);if(detection.landmarks){mask=createLipMask(detection.landmarks,w,h);roiSource='mediapipe-lips';roiAugmentation='geometry-fallback';segmentationConfidence=null;roiReason=''}}catch{}
 }
 const maskPixels=mask?.getContext('2d').getImageData(0,0,w,h).data;
 if(!mask&&!roiReason)roiReason='未自动识别到可靠唇部，无法计算颜色相似度。';
 const isLip=i=>Boolean(maskPixels&&maskPixels[i+3]>=128&&px[i+3]>0);
 let sr=0,sg=0,sb=0,sv=0,ss=0,highSat=0,bright=0,dark=0;const hues=[];const cand=[];
 for(let i=0;i<px.length;i+=4){const r=px[i],g=px[i+1],b=px[i+2];sr+=r;sg+=g;sb+=b;const [H,S,V]=rgbToHsv(r,g,b);sv+=V;ss+=S;if(S>75)highSat++;if(V>80)bright++;if(V<30)dark++;if(isLip(i)){hues.push(H);cand.push([i,H,S,V])}}
 const n=px.length/4,sceneBrightness=sv/n,sceneSaturation=ss/n;let hue=0,sat=0,val=0;if(cand.length){let sx=0,sy=0;cand.forEach(x=>{sx+=Math.cos(x[1]*Math.PI/180);sy+=Math.sin(x[1]*Math.PI/180)});hue=(Math.atan2(sy,sx)*180/Math.PI+360)%360;const ss2=cand.map(x=>x[2]).sort((a,b)=>a-b),vv=cand.map(x=>x[3]).sort((a,b)=>a-b);sat=ss2[Math.floor(ss2.length/2)];val=vv[Math.floor(vv.length/2)]}else{hue=null;sat=null;val=null;roiReason=roiReason||'唇部区域过小，无法稳定分析。'}
 const warm=(sr/n)-(sb/n);let lighting='中性光';if(sceneBrightness>82)lighting='过曝';else if(sceneBrightness<28)lighting='偏暗';else if(warm>18)lighting='暖光';else if(warm<-12)lighting='冷光';
 let R=0;if(hues.length){let x=0,y=0;hues.forEach(v=>{x+=Math.cos(v*Math.PI/180);y+=Math.sin(v*Math.PI/180)});R=Math.sqrt(x*x+y*y)/hues.length}const hueStd=R>0?Math.sqrt(Math.max(0,-2*Math.log(R)))*180/Math.PI:180;
 const median=a=>a.sort((x,y)=>x-y)[Math.floor(a.length/2)];
 const rgb=cand.length?[0,1,2].map(channel=>median(cand.map(x=>px[x[0]+channel]))):null;
 const lab=rgb?rgbToLab(rgb):null;
 const metrics={width:w,height:h,rgb,lab,roiDetected:cand.length>0,roiSource:cand.length?roiSource:'unavailable',colorPipeline:COLOR_PIPELINE_VERSION,segmentationConfidence,roiAugmentation,roiReason,faces:detection?.faces||0,hue:hue===null?null:+hue.toFixed(1),saturation:sat===null?null:+sat.toFixed(1),brightness:val===null?null:+val.toFixed(1),sceneBrightness:+sceneBrightness.toFixed(1),sceneSaturation:+sceneSaturation.toFixed(1),highSaturationRatio:+(highSat/n*100).toFixed(1),brightRatio:+(bright/n*100).toFixed(1),darkRatio:+(dark/n*100).toFixed(1),hueStd:+hueStd.toFixed(1),candidateRatio:+(cand.length/n*100).toFixed(1),lighting};
 const roi=document.createElement('canvas'),satC=document.createElement('canvas'),briC=document.createElement('canvas'),combo=document.createElement('canvas');[roi,satC,briC,combo].forEach(c=>{c.width=w;c.height=h});
 const roiD=roi.getContext('2d').createImageData(w,h),satD=satC.getContext('2d').createImageData(w,h),briD=briC.getContext('2d').createImageData(w,h),comD=combo.getContext('2d').createImageData(w,h);
 for(let i=0;i<px.length;i+=4){const r=px[i],g=px[i+1],b=px[i+2];const [H,S,V]=rgbToHsv(r,g,b);const isCand=isLip(i);for(const d of [roiD,satD,briD,comD])d.data[i+3]=255;roiD.data[i]=isCand?r:Math.round(r*.18);roiD.data[i+1]=isCand?g:Math.round(g*.18);roiD.data[i+2]=isCand?b:Math.round(b*.18);const heatS=Math.round(S/100*255);satD.data[i]=heatS;satD.data[i+1]=Math.round(55*(1-S/100));satD.data[i+2]=255-heatS;const heatB=Math.round(V/100*255);briD.data[i]=heatB;briD.data[i+1]=heatB;briD.data[i+2]=heatB;comD.data[i]=isCand?Math.min(255,r+35):Math.round(r*.35);comD.data[i+1]=isCand?Math.round(g*.85):Math.round(g*.35);comD.data[i+2]=isCand?Math.round(b*.85):Math.round(b*.35)}
 roi.getContext('2d').putImageData(roiD,0,0);satC.getContext('2d').putImageData(satD,0,0);briC.getContext('2d').putImageData(briD,0,0);combo.getContext('2d').putImageData(comD,0,0);
 return {fileName:file.name,metrics,views:{original:canvasURL(base),roi:canvasURL(roi),saturation:canvasURL(satC),brightness:canvasURL(briC),composite:canvasURL(combo)}};
}

export function runFourAgents(analyses,product=null){
 const comparison=compareUploadedColors(analyses,product?.colorReference),findings=[];
 analyses.forEach((a,imageIndex)=>{
  const m=a.metrics;
  if(!m.roiDetected)findings.push({type:'唇部区域未识别',severity:'low',imageIndex,evidence:m.roiReason,impact:'未计算这张图片的颜色相似度'});
  if(m.sceneBrightness>80)findings.push({type:'画面过曝/提亮',severity:'medium',imageIndex,evidence:`整体亮度 ${m.sceneBrightness}%`,impact:'曝光可能改变照片中的颜色观感'});
  if(m.sceneBrightness<30)findings.push({type:'画面偏暗',severity:'low',imageIndex,evidence:`整体亮度 ${m.sceneBrightness}%`,impact:'曝光可能改变照片中的颜色观感'});
  const match=comparison.perImage[imageIndex];
  if(match&&match.score<50)findings.push({type:'与官方标准色偏离',severity:match.score===0?'high':'medium',imageIndex,evidence:`感知色差 ΔE00 ${match.deltaE}；颜色相似度 ${match.score}/100`,impact:'唇部颜色与该色号官方标准图不同'});
 });
 let summary=comparison.score===null?'没有可用的唇部选区或自动重算的参考样本，无法计算颜色相似度。':comparison.score===0?'唇部颜色与官方标准图明显不同，颜色相似度为 0；不能用它代表该色号的颜色。':comparison.score<50?'唇部颜色与官方标准图差异较大，作为该色号颜色参考需要谨慎。':'唇部颜色与官方标准图较接近；这不等于图片或文案真实。';
 if(comparison.compared<comparison.total&&comparison.compared)summary+=' 部分图片未成功选区，未纳入相似度计算。';
 return {score:comparison.score,comparison,findings,summary,suggestions:[{title:'在相同光照下核对实物',why:'这里比较的是照片中的颜色，不是实物色度或真实性概率',impact:'减少光照、曝光和个体唇色的影响'}],confidence:null};
}

export function buildProductConsumerSummary(product,lipProfile='all'){
 const a=product.analysis||{};const media=product.media||[];const allReviews=product.reviews||[];
 const top=media.filter(m=>(a.topMediaIds||[]).includes(m.id)).sort((x,y)=>(y.referenceScore||0)-(x.referenceScore||0));
 const reviews=allReviews.filter(r=>(a.representativeReviewIds||[]).includes(r.id));
 const filtered=lipProfile==='all'?reviews:reviews.filter(r=>(r.text||'').includes(lipProfile));
 const chosen=(filtered.length?filtered:reviews).slice(0,8);
 const diff=a.platformDiff||{hue:0,saturation:0,brightness:0},kw=a.keywordCounts||{},normal=[];
 if(kw['深唇']||kw['浅唇'])normal.push('不同原生唇色会改变显色，深唇与浅唇反馈应分开看');
 if(kw['薄涂']||kw['厚涂'])normal.push('薄涂与厚涂会改变明度、饱和度和覆盖力');
 if(kw['氧化'])normal.push('部分用户提到氧化/成膜后的颜色变化');
 if(kw['自然光']||kw['暖光'])normal.push('光照条件会改变照片中的冷暖与明暗');
 let conclusion='当前多来源视觉样本整体较接近，可作为辅助参考。';
 if(diff.hue>35)conclusion='不同平台间存在明显色相差异，建议优先看高参考分的真实返图。';
 else if(Math.abs(diff.brightness)>15)conclusion='两类来源的亮度存在一定差异，颜色本身较接近，但不要把曝光差异当成色号差异。';
 if(product.key==='lancome-274'&&(product.skuLines||[]).length>1)conclusion+=' 同为 274 的不同产品线需要分开比较。';
 if(product._summaryOnly&&!product._textCatalogLoaded)conclusion+=' 当前结果基于已载入的聚合证据；没有足够原文支持的细节不会被强行补全。';
 return {conclusion,top:top.slice(0,3),reviews:chosen,normal};
}
