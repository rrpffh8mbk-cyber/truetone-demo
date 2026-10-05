// Normalized brush strokes keep the selected region aligned at any image size.
export function createSelectedLipMask(strokes,w,h){
 const mask=document.createElement('canvas');mask.width=w;mask.height=h;
 const ctx=mask.getContext('2d');ctx.strokeStyle=ctx.fillStyle='#fff';ctx.lineCap=ctx.lineJoin='round';
 for(const stroke of strokes){
  if(!stroke.points?.length)continue;
  const r=stroke.radius*Math.min(w,h);ctx.lineWidth=r*2;
  const first=stroke.points[0];ctx.beginPath();ctx.arc(first.x*w,first.y*h,r,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.moveTo(first.x*w,first.y*h);
  for(const p of stroke.points.slice(1))ctx.lineTo(p.x*w,p.y*h);
  ctx.stroke();
 }
 return mask;
}

const automaticResults=new WeakMap();
export async function analyzeEvidenceFile(file){
 const {analyzeImageFile}=await import('./agents.js?v=20261006-auto-v2');
 if(automaticResults.has(file))return automaticResults.get(file);
 const result=await analyzeImageFile(file);
 if(result.metrics.roiDetected)automaticResults.set(file,result);
 return result;
}
