import {rankReferenceMedia} from './library-tags.js?v=20261006-personal-color-v5';

export const PERSONAL_COLOR_SAMPLE_LIMIT=5;
export const PREVIEW_VARIANTS=[
  {id:'intimatte',label:'粉金管 274 · 柔雾哑光'},
  {id:'cream',label:'黑管 274 · 哑光'},
  {id:'cream_gift',label:'声色限定 274 · 柔雾／轻缎光'}
];
export const defaultPreviewVariant=key=>key==='lancome-274'?'intimatte':null;
const reliable=l=>l&&l.value!=='不确定'&&['high','medium'].includes(l.confidence);
const validLab=lab=>Array.isArray(lab)&&lab.length===3&&lab.every(Number.isFinite);

export function labToRgb(lab){
  const y=(lab[0]+16)/116,xyz=[y+lab[1]/500,y,y-lab[2]/200];
  const inverse=f=>f*f*f>216/24389?f*f*f:(116*f-16)/(24389/27);
  const [x,Y,z]=xyz.map(inverse).map((v,i)=>v*[.95047,1,1.08883][i]);
  const linear=[3.2404542*x-1.5371385*Y-.4985314*z,-.969266*x+1.8760108*Y+.041556*z,.0556434*x-.2040259*Y+1.0572252*z];
  return linear.map(v=>Math.round(255*Math.max(0,Math.min(1,v<=.0031308?12.92*v:1.055*Math.pow(v,1/2.4)-.055))));
}
function hsv([r,g,b]){
  r/=255;g/=255;b/=255;const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
  let h=0;if(d){if(max===r)h=60*((g-b)/d%6);else if(max===g)h=60*((b-r)/d+2);else h=60*((r-g)/d+4)}
  return {hue:(h+360)%360,saturation:max?d/max*100:0,brightness:max*100};
}
const median=values=>{const a=values.slice().sort((x,y)=>x-y),i=Math.floor(a.length/2);return a.length%2?a[i]:(a[i-1]+a[i])/2};
export function referenceGroupKey(media){
  const key=media.source_object_key||media.object_key||'',slash=key.lastIndexOf('/');
  return slash>0?'source-post:'+key.slice(0,slash):'image:'+(media.sourceImageHash||media.id);
}
function distinctReferences(candidates,excluded=[]){
  const hashes=new Set(excluded.map(m=>m.sourceImageHash||m.id)),groups=new Set(excluded.map(referenceGroupKey)),selected=[];
  for(const m of candidates){
    const hash=m.sourceImageHash||m.id,group=referenceGroupKey(m);
    if(hashes.has(hash)||groups.has(group))continue;
    hashes.add(hash);groups.add(group);selected.push(m);
    if(selected.length===PERSONAL_COLOR_SAMPLE_LIMIT)break;
  }
  return selected;
}

export function buildPersonalColor(product,profile,variant=defaultPreviewVariant(product.key)){
  const requested=['lip','skin'].filter(k=>profile?.[k]);
  const ranked=rankReferenceMedia((product.media||[]).filter(m=>
    (!m.product_key||m.product_key===product.key)&&
    (product.key!=='lancome-274'||m.variant===variant)&&validLab(m.metrics?.lab)),
    profile?{lip:profile.lip,skin:profile.skin}:null);
  const compatible=ranked.filter(m=>requested.every(k=>!reliable(m.labelFields?.[k])||m.labelFields[k].value===profile[k]));
  const matchedFields=m=>requested.filter(k=>reliable(m.labelFields?.[k])&&m.labelFields[k].value===profile[k]);
  compatible.sort((a,b)=>matchedFields(b).length-matchedFields(a).length||
    b.recommendation.combinedScore-a.recommendation.combinedScore||
    b.recommendation.qualityScore-a.recommendation.qualityScore);
  const matched=compatible.filter(m=>matchedFields(m).length>0),unknown=compatible.filter(m=>matchedFields(m).length===0);
  const personal=distinctReferences(matched),scope=personal.length?'personal':'general';
  const selected=personal.length?personal:distinctReferences(unknown);
  const general=personal.length?distinctReferences(unknown,personal):[];
  const sample=m=>({id:m.id,source_object_key:m.source_object_key||m.object_key,
    source_group:referenceGroupKey(m),
    source_image_sha256:m.sourceImageHash,variant:m.variant,lab:m.metrics.lab.slice(),
    thumbnail:m.thumb||m.thumbnail||m.url,matchedFields:matchedFields(m),
    conditionLabels:Object.fromEntries(['lip','skin'].map(k=>[k,{
      value:m.labelFields?.[k]?.value||'不确定',confidence:m.labelFields?.[k]?.confidence||'unknown'}])),
    qualityScore:m.recommendation.qualityScore,combinedScore:m.recommendation.combinedScore,
    roiSource:m.metrics.roiSource,segmentationConfidence:m.metrics.segmentationConfidence});
  const samples=selected.map(sample),generalSamples=general.map(sample);
  let color=null;
  if(samples.length){const lab=[0,1,2].map(i=>median(samples.map(s=>s.lab[i]))),rgb=labToRgb(lab);
    color={lab,rgb,hex:'#'+rgb.map(v=>v.toString(16).padStart(2,'0')).join(''),...hsv(rgb),source:scope==='personal'?'matched-real-lip-samples-v2':'general-real-lip-samples-v2'};
  }
  const counts={full:0,partial:0,unknown:0};
  for(const s of samples){if(requested.length&&s.matchedFields.length===requested.length)counts.full++;
    else if(s.matchedFields.length)counts.partial++;else counts.unknown++}
  return {version:'2026-10-06-personal-color-v3',scope,variant,profile:requested.length?{lip:profile.lip,skin:profile.skin}:null,
    requestedFields:requested,targetCount:PERSONAL_COLOR_SAMPLE_LIMIT,usedCount:samples.length,eligibleCount:ranked.length,
    compatibleCount:compatible.length,counts,samples,generalSamples,color,shortfall:samples.length<PERSONAL_COLOR_SAMPLE_LIMIT,
    method:'Up to five distinct source posts/reviews, prioritizing confirmed lip/skin matches and combined quality; component-wise median of premeasured lip-region CIELAB. Unknown conditions never pad personal color. With no confirmed match or no profile, a separately declared general color is shown. No declared mismatch, official graphic, excluded image, duplicate bytes or cross-variant image.'};
}

export function personalSampleCopy(sample){
  return ['skin','lip'].map(field=>{
    const label=sample.conditionLabels?.[field],name=field==='skin'?'肤色':'原生唇色';
    if(!label||label.value==='不确定')return field==='lip'?'原生唇色未说明':'肤色缺少可靠依据';
    if(!reliable(label))return field==='skin'?'肤色判断把握较低':'原生唇色依据不足';
    if(sample.matchedFields.includes(field))return `${name}相近（${label.value}）`;
    return `${name}：${label.value}`;
  });
}

export function personalColorCopy(selection){
  if(!selection?.usedCount)return {headline:'相近条件的样本还不够，暂不生成参考色',detail:'当前没有通过筛选且与你已确认条件相容的试色图。可以先查看真实图片，或调整产品版本。',method:'试色有谱从数据库里真实涂过这支口红的唇部取色，并保留取色依据。'};
  const n=selection.usedCount,c=selection.counts,profile=selection.profile;
  const hasMatch=c.full+c.partial>0;
  const headline=profile?(hasMatch?`为你从 ${n} 张真实试色里取色`:`暂无已确认匹配 · 以下 ${n} 张为通用参考`):`从 ${n} 张参考质量较高的真实试色里取色`;
  const facts=[];
  const names=(selection.requestedFields||['skin','lip']).map(k=>k==='skin'?'肤色':'唇色').join('、');
  if(profile){if(c.full)facts.push(`${c.full} 张已确认的${names}与你相近`);
    if(c.partial)facts.push(`${c.partial} 张确认了其中一项，另一项尚未确认`);
    if(c.unknown)facts.push(`${c.unknown} 张未能确认${names}，只作通用补充参考`)}
  const context=profile?(!hasMatch?'目前没有已确认与你条件相近的可用图片，以下只能提供这个色号的一般颜色方向。':''):
    '你尚未填写肤色或原生唇色，此处按图片参考质量取色；填写后会优先匹配你的条件。';
  const detail=context+(facts.length?facts.join('；')+'。':'')+(selection.shortfall?`目前只找到 ${n} 张可用图，未凑满 5 张。`:
    hasMatch?'优先选取相近条件、参考质量较高的前 5 张。':'选取参考质量较高的前 5 张，条件未知的图片不代表已经与你匹配。')+
    '同一条评价或帖子只取一张；条件都未知的图片不用于补足个人取色。';
  const method=profile&&hasMatch?'试色有谱先找真实涂过这支口红、与你条件相近的人，再从她们的唇部提取颜色。你看到的预览有真实试色图片作依据。':
    '试色有谱从真实上唇照片提取参考色，并保留取色依据；没有已确认匹配时，会明确展示通用参考。';
  return {headline,detail,method};
}
