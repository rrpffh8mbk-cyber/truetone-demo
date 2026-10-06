// Retained from the concurrent upstream cross-modal work.
// Coarse consistency cues do not prove the illuminant, editing history or truth.
import {deltaE2000} from './color-similarity.js';
const clampScore=v=>Math.round(Math.max(0,Math.min(100,Number(v)||0)));

export function visualCorpusAgreement(p,analyses){
 const ref=p.colorReference,samples=(ref?.samples||[]).filter(s=>{
  if(!Array.isArray(s.metrics?.lab)||s.metrics.lab.length!==3||!s.metrics.lab.every(Number.isFinite))return false;
  const v=ref?.selectedVariant;
  return !v||v==='unknown'||p.key!=='lancome-274'||s.variant===v;
 });
 if(!samples.length||!analyses.length)return null;
 const scores=[];
 for(const a of analyses){
  const lab=a.metrics?.lab;
  if(!Array.isArray(lab)||lab.length!==3||!lab.every(Number.isFinite))continue;
  const ds=samples.map(s=>deltaE2000(lab,s.metrics.lab)).filter(Number.isFinite).sort((x,y)=>x-y);
  if(!ds.length)continue;
  const nearest=ds.slice(0,Math.min(7,ds.length));
  const median=nearest[Math.floor(nearest.length/2)];
  scores.push(clampScore(100*Math.max(0,1-median/30)));
 }
 return scores.length?Math.round(scores.reduce((s,x)=>s+x,0)/scores.length):null;
}

function imageToneDirection(analyses){
 const hues=analyses.map(a=>a.metrics?.hue).filter(Number.isFinite);
 if(!hues.length)return {label:'无法判断',confidence:'low'};
 let x=0,y=0;
 hues.forEach(h=>{const r=h*Math.PI/180;x+=Math.cos(r);y+=Math.sin(r)});
 const hue=(Math.atan2(y,x)*180/Math.PI+360)%360;
 if(hue>=5&&hue<=42)return {label:'偏暖',hue,confidence:'medium'};
 if(hue>=315||hue<5)return {label:'偏冷/偏粉紫',hue,confidence:'medium'};
 return {label:'中性或混合',hue,confidence:'low'};
}
export function crossModalAssessment(textReport,analyses){
 if(!textReport||!analyses.length)return {score:null,notes:[],tested:0,status:'missing'};
 const notes=[];let score=100,tested=0;
 const raw=String(textReport.rawText||'');
 const metrics=analyses.map(a=>a.metrics||{}).filter(Boolean);
 const actualLights=[...new Set(metrics.map(m=>m.lighting).filter(Boolean))];

 // 1) Explicit warm/cool light claims can be checked against the image signal.
 const claimedLight=textReport.tags?.lighting;
 if(claimedLight==='室内暖光'||claimedLight==='室内冷光'){
  tested++;
  const expected=claimedLight==='室内暖光'?'暖光':'冷光';
  const ok=actualLights.length>0&&actualLights.every(x=>x===expected);
  if(ok)notes.push('文案中的“'+claimedLight+'”与图片显示的冷暖倾向基本一致。');
  else{score-=25;notes.push('文案写的是“'+claimedLight+'”，但画面冷暖更接近 '+(actualLights.join(' / ')||'无法稳定判断')+'。')}
 }else if(claimedLight==='自然光'){
  notes.push('文案提到“自然光”，但仅凭成片无法可靠证明光源类型；这里只能展示画面中的冷暖倾向，不自动加分。');
 }

 // 2) "Same lighting" across multiple images is directly testable at a coarse level.
 if(/同一天同光线|同一光线|同光线|同样光线/.test(raw)&&analyses.length>1){
  tested++;
  const br=metrics.map(m=>m.sceneBrightness).filter(Number.isFinite);
  const sat=metrics.map(m=>m.sceneSaturation).filter(Number.isFinite);
  const mismatch=actualLights.length>1
    ||(br.length>1&&Math.max(...br)-Math.min(...br)>20)
    ||(sat.length>1&&Math.max(...sat)-Math.min(...sat)>22);
  if(mismatch){score-=30;notes.push('文案声称多张图片处于同一光线，但图片之间的冷暖、明暗或饱和度差异较明显。')}
  else notes.push('多张图片的冷暖、明暗与饱和度基本支持“同光线”描述。');
 }

 // 3) Broad colour-direction claims: intentionally coarse, never treated as proof.
 const tone=imageToneDirection(analyses);
 const warmClaim=/偏橘|橘调|橙调|暖调|偏棕|棕调|奶茶调|裸茶|杏仁奶茶/.test(raw);
 const coolClaim=/偏粉|粉调|粉嫩|冷调|偏紫|紫调|玫红|梅子调/.test(raw);
 if(warmClaim!==coolClaim&&tone.confidence!=='low'){
  tested++;
  const expected=warmClaim?'偏暖':'偏冷/偏粉紫';
  const ok=tone.label===expected;
  if(ok)notes.push('文案描述的综合色调方向（'+expected+'）与图片中的唇色方向基本一致。');
  else{score-=18;notes.push('文案把颜色描述为“'+expected+'”，但图片中的唇色方向更接近“'+tone.label+'”。这可能来自光线、后期或个体唇色差异。')}
 }

 // 4) "Sheer/soft" vs "rich/vivid" can be checked only as a coarse saturation cue.
 const lipSats=metrics.map(m=>m.saturation).filter(Number.isFinite);
 const medSat=lipSats.length?[...lipSats].sort((a,b)=>a-b)[Math.floor(lipSats.length/2)]:null;
 const sheerClaim=/清透|低饱和|淡淡|很淡|柔和|薄透|粉嫩清透/.test(raw);
 const richClaim=/高饱和|浓郁|很浓|鲜艳|浓烈/.test(raw);
 if(Number.isFinite(medSat)&&sheerClaim!==richClaim){
  tested++;
  const ok=sheerClaim?medSat<=48:medSat>=45;
  if(ok)notes.push('文案对颜色浓淡的描述与图片唇部饱和度方向基本一致。');
  else{score-=15;notes.push('文案对“'+(sheerClaim?'清透/低饱和':'浓郁/高饱和')+'”的描述，与图片唇部饱和度方向不完全一致。')}
 }

 // 5) Absolute claims are not validated merely because a photo exists.
 if(/完全没色差|和图片一模一样|实物和图一样/.test(raw)){
  tested++;
  score-=10;
  notes.push('“完全没色差 / 和实物一模一样”无法由上传图片单独证明，属于需要额外实物证据的绝对说法。');
 }
 if(/原相机|无滤镜|没滤镜|零修图|没修图/.test(raw)){
  notes.push('“原相机 / 无滤镜 / 零修图”无法仅凭最终成片被可靠验证，因此不会自动增加图文一致性分。');
 }

 const finalScore=tested?clampScore(score):null;
 return {
  score:finalScore,notes,tested,
  status:tested?'tested':'no_direct_claim',
  tone
 };
}
