import {coordinateEvidence} from './trust-agent.js?v=20261007-acceptance-v12';
import {analyzeVisualForensics} from './visual-forensics.js?v=20261007-acceptance-v12';
import {forensicHtml,bindGenerationChecks} from './forensic-ui.js?v=20261007-acceptance-v12';
import {crossModalAssessment,visualCorpusAgreement} from './cross-modal.js?v=20261007-acceptance-v12';
import {assessEvidenceText,evidenceDecision,detectProductVariant} from './evidence-assessment.js?v=20261007-acceptance-v12';
import {DEMO_CASES} from './demo-cases.js?v=20261007-acceptance-v12';
import {buildBrandActionPlan} from './brand-actions.js?v=20261007-acceptance-v12';
import {buildPersonalColor,personalColorCopy,personalSampleCopy,defaultPreviewVariant,PREVIEW_VARIANTS} from './personal-color.js?v=20261007-acceptance-v12';
import {attachLibraryLabels,profileTagAssessment,rankReferenceMedia} from './library-tags.js?v=20261007-acceptance-v12';
import {compareUploadedColors,compareLipColor} from './color-similarity.js?v=20261006-official-v3';
import {analyzeEvidenceFile} from './lip-selection.js?v=20261006-official-v3';
import {runFourAgents,buildProductConsumerSummary,hsvToHex,ANALYSIS_KEYWORDS,circularHueDistance} from './agents.js?v=20261007-acceptance-v12';
import {createVirtualTryOn} from './tryon.js?v=20261006-natural-gloss-v6';

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const app=$('#app'),toast=$('#toast'),modal=$('#modal-backdrop'),modalContent=$('#modal-content');
// Defensive initial state: never allow the modal overlay to block the app on first paint.
modal.style.display='none';modal.style.pointerEvents='none';modal.hidden=true;modal.setAttribute('aria-hidden','true');
let manifest, evidenceCatalog, referenceDistributions, cache=new Map(), cloudCache=new Map(), verifyFiles=[], verifyAnalyses=[], selfieFile=null, selfieResult=null, purchaseTargetKey=null, seededFiles=[];
const USER_TAG_SCHEMA={lip:['浅唇','中唇','深唇'],skin:['白皙','黄皮','黑皮'],makeup:['素颜','淡妆','浓妆'],lighting:['自然光','室内暖光','室内冷光','混合光','不确定'],application:['薄涂','正常涂','厚涂','不确定'],source_platform:['小红书','淘宝','官方','其他']};
const PARTS={'ysl-610':4,'ysl-1936':4,'lancome-274':0,'lancome-275':0};
const fmt=n=>new Intl.NumberFormat('zh-CN').format(n||0);
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const shadeTarget=p=>p.personalColor?.color||p.analysis.center; const color=p=>{const c=shadeTarget(p);return hsvToHex(c.hue,c.saturation,c.brightness)};
function toastMsg(s){toast.textContent=s;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),1900)}
async function ungzipB64(parts){const txt=(await Promise.all(parts.map(u=>fetch(u).then(r=>{if(!r.ok)throw Error('数据文件未部署完整');return r.text()})))).join('').trim();const bin=Uint8Array.from(atob(txt),c=>c.charCodeAt(0));if(!('DecompressionStream'in window))throw Error('当前浏览器不支持数据解压，请使用最新版 Chrome / Edge / Safari');const stream=new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'));return JSON.parse(await new Response(stream).text())}
async function getManifest(){
 if(manifest)return manifest;
 manifest=await fetch('./data/manifest.json').then(r=>r.json());
 const [references,textCatalog]=await Promise.all([getReferenceDistributions(),getReviewCatalog()]);
 for(const p of manifest.products){delete p.tryOnColor;const r=references?.products?.[p.key];if(r?.center){
  p.colorReference=r;p.analysis={...p.analysis,center:{...r.center}};
  const scores=r.samples.map(sample=>compareLipColor(sample.metrics,r)?.score).filter(Number.isFinite).sort((x,y)=>x-y);
  p.analysis.score=scores.length?scores[Math.floor(scores.length/2)]:null;
 }else p.analysis={...p.analysis,score:null};
  const entry=textCatalog?.products?.[p.key];if(entry)p.analysis={...p.analysis,counts:{...p.analysis.counts,text:entry.review_count},keywordCounts:entry.keywordCounts,reviewQuality:entry.reviewQuality,consumerDifferenceMentions:entry.consumerDifferenceMentions};
 }
 return manifest;
}
async function getEvidenceCatalog(){if(evidenceCatalog)return evidenceCatalog;try{evidenceCatalog=await fetch('./data/catalog/evidence_claims_v2.json',{cache:'no-store'}).then(r=>r.ok?r.json():null)}catch(_){evidenceCatalog=null}return evidenceCatalog}
let reviewCatalogPromise;
async function getReviewCatalog(){
 if(!reviewCatalogPromise)reviewCatalogPromise=fetch('./data/catalog/review_catalog_v2.json',{cache:'no-store'})
  .then(r=>{if(!r.ok)throw Error('文字评价未加载');return r.json()})
  .catch(e=>{console.warn(e.message);reviewCatalogPromise=null;return null});
 return reviewCatalogPromise;
}
let libraryLabelsPromise;
async function getLibraryLabels(){
 if(!libraryLabelsPromise)libraryLabelsPromise=fetch('./data/catalog/sample_tags_v1.json',{cache:'no-store'})
  .then(r=>{if(!r.ok)throw Error('样本标签未加载');return r.json()})
  .then(c=>new Map(c.images.map(row=>[row.source_object_key,row])))
  .catch(e=>{console.warn(e.message);libraryLabelsPromise=null;return new Map()});
 return libraryLabelsPromise;
}
async function getReferenceDistributions(){if(referenceDistributions)return referenceDistributions;try{referenceDistributions=await fetch('./data/catalog/lip_color_reference_v3.json',{cache:'no-store'}).then(r=>r.ok?r.json():null)}catch(_){referenceDistributions=null}return referenceDistributions}
function summaryFallback(k){
 const m=manifest.products.find(x=>x.key===k);
 if(!m)throw Error('未找到该色号数据');
 return {...m,media:[],reviews:[],asks:[],_summaryOnly:true};
}
async function getProduct(k){
 if(cache.has(k))return cache.get(k);
 const n=PARTS[k]||0,urls=Array.from({length:n},(_,i)=>`./data/full/${k}.${i+1}.b64`);
 const p=n?await ungzipB64(urls):summaryFallback(k);
 const [references,labels,textCatalog]=await Promise.all([getReferenceDistributions(),getLibraryLabels(),getReviewCatalog()]);p.colorReference=references?.products?.[k]||null;
 if(p.colorReference?.center){
  const r=p.colorReference,a={...p.analysis};a.center={...r.center};
  a.platform=Object.fromEntries(Object.entries(r.platforms).map(([name,d])=>[name,{n:d.n,hue:d.hue.circular_center,saturation:d.saturation.median,brightness:d.brightness.median}]));
  const x=a.platform['小红书'],t=a.platform['淘宝'];
  if(x&&t)a.platformDiff={hue:circularHueDistance(x.hue,t.hue),saturation:x.saturation-t.saturation,brightness:x.brightness-t.brightness};
  const scores=r.samples.map(sample=>compareLipColor(sample.metrics,r)?.score).filter(Number.isFinite).sort((x,y)=>x-y);
  a.score=scores.length?scores[Math.floor(scores.length/2)]:null;p.analysis=a;
  const outlierCount=r.excluded.filter(s=>s.assessment.code==='official_color_outlier').length;
  a.findings=outlierCount?[{type:'与对应官方标准色差距过大，已标记不使用',count:outlierCount,severity:'medium'}]:[];
  p.media=r.samples.map(s=>attachLibraryLabels({product_key:k,id:s.id,platform:s.platform,type:'image',filename:s.source_filename,source_object_key:s.source_object_key,variant:s.variant,thumb:s.thumbnail,metrics:s.metrics,referenceScore:compareLipColor(s.metrics,{...r,selectedVariant:s.variant})?.score??0,reasons:['自动唇部选区通过，与对应官方标准图的色差在允许范围内。']},labels)).sort((x,y)=>y.referenceScore-x.referenceScore);
  p.analysis.topMediaIds=p.media.slice(0,6).map(m=>m.id);
 }
 else{p.analysis={...p.analysis,score:null};p.media=[]}
 const textEntry=textCatalog?.products?.[k];
 if(textEntry){
  p.reviews=textEntry.reviews;p.asks=[];p._textCatalogLoaded=true;
  p.analysis={...p.analysis,counts:{...p.analysis.counts,text:textEntry.review_count},keywordCounts:textEntry.keywordCounts,
   reviewQuality:textEntry.reviewQuality,consumerDifferenceMentions:textEntry.consumerDifferenceMentions};
  p.analysis.representativeReviewIds=personalizedReviews(p,getUserProfile()).map(r=>r.id);
 }
 cache.set(k,p);return p;
}

let finishCatalogPromise;
async function getPreviewProduct(key,variant=defaultPreviewVariant(key)){
 const base=await getProduct(key);
 if(!finishCatalogPromise)finishCatalogPromise=fetch('./data/catalog/product_finishes_v1.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('质地参考暂时无法加载');return r.json()}).catch(e=>{finishCatalogPromise=null;throw e});
 const finishes=await finishCatalogPromise;
 variant=key==='lancome-274'?(PREVIEW_VARIANTS.some(v=>v.id===variant)?variant:defaultPreviewVariant(key)):null;
 const media=base.media.filter(m=>key!=='lancome-274'||m.variant===variant);
 const personalColor=buildPersonalColor({...base,media},getUserProfileDraft(),variant);
 const finish=key==='lancome-274'?finishes.products[key].variants[variant]:finishes.products[key];
 return {...base,media,reviews:base.reviews.filter(r=>key!=='lancome-274'||r.variant===variant||r.variant==='unknown'),
  personalColor,finish,selectedPreviewVariant:variant,
  colorReference:base.colorReference?{...base.colorReference,selectedVariant:variant}:null};
}
function previewVariantOptions(selected='intimatte'){
 return PREVIEW_VARIANTS.map(v=>`<option value="${v.id}" ${v.id===selected?'selected':''}>${esc(v.label)}</option>`).join('');
}
function variantPicker(p,id){return p.key==='lancome-274'?`<label class="preview-variant-picker" for="${id}"><span>你看的 274 版本</span><select class="select" id="${id}">${previewVariantOptions(p.selectedPreviewVariant)}</select><small>不同版本分别取色；此处显示所选版本。</small></label>`:''}
function previewSwatch(p,cls='direction-swatch'){
 const c=p.personalColor?.color;
 return c?`<span class="${cls} finish-swatch" data-finish="${esc(p.finish?.kind||'matte')}" data-color="${c.hex}" style="--personal-color:${c.hex};background-color:${c.hex}"></span>`:'';
}
function colorSourceDetails(selection){
 if(!selection?.samples.length)return '';
 return `<details class="color-evidence"><summary>看看这 ${selection.usedCount} 张${selection.scope==='general'?'通用':''}取色参考图</summary><div class="personal-color-samples">${selection.samples.map((m,i)=>`<figure data-color-sample="${esc(m.id)}"><img src="${esc(m.thumbnail)}" alt="取色参考 ${i+1}" loading="lazy"><figcaption>参考 ${i+1}<br>${personalSampleCopy(m).map(esc).join('<br>')}</figcaption></figure>`).join('')}</div><p>只从嘴唇取色，排除皮肤、牙齿和口腔；综合多张图，减少单张照片过亮、过暗的影响。图片里未说明的条件不会补猜。</p></details>`;
}
function generalReferenceDetails(selection){
 if(!selection?.generalSamples?.length)return '';
 return `<details class="color-evidence general-color-evidence"><summary>另外 ${selection.generalSamples.length} 张通用参考 · 不参与本次取色</summary><p>这些图片的条件尚未确认，仅供你另外查看，不会混入上面的个人参考色。</p><div class="personal-color-samples">${selection.generalSamples.map((m,i)=>`<figure data-general-sample="${esc(m.id)}"><img src="${esc(m.thumbnail)}" alt="通用参考 ${i+1}" loading="lazy"><figcaption>通用参考 ${i+1}<br>${personalSampleCopy(m).map(esc).join('<br>')}</figcaption></figure>`).join('')}</div></details>`;
}
function colorDirectionHtml(p,controls=false){
 const copy=personalColorCopy(p.personalColor);
 return `<div class="panel personal-color-section" data-personal-color="${p.personalColor?.color?.hex||''}" data-sample-count="${p.personalColor?.usedCount||0}" data-color-scope="${p.personalColor?.scope||'general'}"><h3>${p.personalColor?.counts.full+p.personalColor?.counts.partial>0?'这个颜色在相近条件下是什么方向':'这个色号的通用颜色参考'}</h3>${controls?variantPicker(p,'shade-preview-variant'):''}<div class="direction-swatch-wrap">${previewSwatch(p)}<div><b>#${p.shade} · ${esc(p.name)}</b><p class="finish-label">${esc(p.finish?.label||'质地待确认')}</p><p class="personal-color-headline">${esc(copy.headline)}</p></div></div><p class="personal-color-copy">${esc(copy.detail)}</p><p class="personal-color-method">${esc(copy.method)}</p><p class="finish-copy">${esc(p.finish?.note||'')}</p>${colorSourceDetails(p.personalColor)}${generalReferenceDetails(p.personalColor)}<p class="disclaimer">真实样本中的参考方向，实物仍会受光线、原生唇色和涂抹厚度影响。</p></div>`;
}

function meta(k){return manifest.products.find(x=>x.key===k)}
function page(x){app.innerHTML=`<div class="page">${x}</div>`;window.scrollTo(0,0)}
function go(h){location.hash=h}
function shadeCard(p){return `<a class="shade-card" href="#/shade/${p.key}"><div><div class="shade-brand">${esc(p.brand)}</div><div class="shade-code">#${p.shade}</div><div class="shade-name">${esc(p.name)} · ${esc(p.product)}</div><div class="shade-meta"><span class="mini-chip">${p.analysis.counts.visual} 份视觉素材</span><span class="mini-chip">${p.analysis.counts.text} 条文字证据</span></div></div><div class="shade-swatch" style="background:radial-gradient(circle at 38% 35%,${color(p)} 0,#6b352e 48%,#271715 100%)"></div></a>`}
function opts(sel){return manifest.products.map(p=>`<option value="${p.key}" ${p.key===sel?'selected':''}>${esc(p.brand)} #${p.shade} ${esc(p.name)}</option>`).join('')}
function highlight(t){let s=esc(t);for(const k of ANALYSIS_KEYWORDS)s=s.replaceAll(k,`<mark class="highlight">${k}</mark>`);return s}
function reviewCard(r){return `<article class="review"><p>${highlight(r.text)}</p><small><span>${r.platform}</span><span>${r.type||'评论'}</span>${r.sku?`<span>${esc(r.sku)}</span>`:''}${r.question?`<span>问题：${esc(r.question)}</span>`:''}${r.repeatBuyer?'<span>复购线索</span>':''}${r.negativeEvidence?'<span>含负向体验</span>':''}</small></article>`}
async function fetchCloudReferenceMedia(productKey,variant=null,profile=getUserProfile()){
 const reference=(await getReferenceDistributions())?.products?.[productKey];
 if(!reference)return [];
 const labels=await getLibraryLabels();
 const scopedSamples=reference.samples.filter(s=>!variant||s.variant===variant);
 const accepted=new Map(scopedSamples.map(s=>[s.source_object_key,s]));
 const fallbackAll=scopedSamples.map(s=>attachLibraryLabels({id:s.id,platform:s.platform,label:s.source_filename,url:s.thumbnail,object_key:s.source_object_key,metrics:s.metrics,referenceScore:compareLipColor(s.metrics,{...reference,selectedVariant:s.variant})?.score,colorDistance:s.assessment.deltaE,reason:'已通过自动唇部选区与官方标准色筛选。'},labels));
 const filtered=media=>media.filter(m=>accepted.has(m.object_key)).map(m=>attachLibraryLabels({...m,metrics:accepted.get(m.object_key).metrics,referenceScore:compareLipColor(accepted.get(m.object_key).metrics,{...reference,selectedVariant:accepted.get(m.object_key).variant})?.score,colorDistance:accepted.get(m.object_key).assessment.deltaE},labels));
 const fallback=()=>rankReferenceMedia(fallbackAll,profile).slice(0,3);
 const select=media=>{
  const byKey=new Map(fallbackAll.map(m=>[m.object_key,m]));
  for(const m of filtered(media))byKey.set(m.object_key,m);
  return rankReferenceMedia([...byKey.values()],profile).slice(0,3);
 };
 const api=(window.TRUETONE_CONFIG?.apiBase||'').replace(/\/$/,'');if(!api)return fallback();
 const cacheKey='truetone-media-v5:'+productKey+':'+(variant||'all');
 try{
   const saved=sessionStorage.getItem(cacheKey),parsed=saved&&JSON.parse(saved);
   if(parsed?.savedAt&&Date.now()-parsed.savedAt<5*60*1000&&Array.isArray(parsed.value)&&parsed.value.length){return select(parsed.value)}
 }catch(_){}
 for(let attempt=0;attempt<2;attempt++){
   try{
     const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7000);
     const r=await fetch(api+'/api/media?product_key='+encodeURIComponent(productKey),{cache:'no-store',signal:controller.signal});
     clearTimeout(timer);
     if(!r.ok)throw Error('HTTP '+r.status);
     const out=await r.json(),media=Array.isArray(out?.media)?out.media.filter(x=>x&&x.url).slice(0,3):[];
     if(media.length){try{sessionStorage.setItem(cacheKey,JSON.stringify({savedAt:Date.now(),value:media}))}catch(_){};return select(media)}
   }catch(e){
     console.warn('Reference image attempt '+(attempt+1)+' unavailable',e);
     if(attempt===0)await wait(300);
   }
 }
 return fallback();
}
function cloudReferenceCard(m,i){
 const platform=esc(m.platform||'真实来源'),label=esc(m.label||'真实试色参考'),reason='已通过自动唇部选区与官方标准色筛选。';
 return `<article class="media-card cloud-media-card" data-cloud-url="${esc(m.url)}">
   <div class="cloud-thumb-wrap"><img src="${esc(m.url)}" alt="${platform}真实试色参考 ${i+1}" loading="lazy" referrerpolicy="no-referrer"><span class="media-source-badge">${platform} · 已筛选样本</span></div>
   <div class="media-card-body"><div class="rank">#${i+1} · 真实样本</div><div class="source-line">${label}</div><div class="reason">${reason}</div>${recommendationCopy(m)}</div>
 </article>`;
}

function mediaCard(m,i){const score=Number.isFinite(m.referenceScore)?Math.round(m.referenceScore)+'/100':'优先参考';return `<article class="media-card" data-media="${m.id}">${m.thumb?`<img src="${m.thumb}" alt="真实试色参考图 ${i+1}">`:'<div class="skeleton media-placeholder" style="height:210px"><span>真实媒体记录<br><small>图片暂时没有加载出来</small></span></div>'}<div class="media-card-body"><div class="rank">#${i+1} · ${score}</div><div class="source-line">${m.platform} · ${m.metrics?.lighting||m.type}</div><div class="reason">${esc((m.reasons||[])[0]||'接近多来源参考色域')}</div>${recommendationCopy(m)}</div></article>`}
function metric(label,v,max=100,u='%'){return `<div class="metric-row"><label>${label}</label><div class="bar"><i style="width:${Math.min(100,Math.abs(v)/max*100)}%"></i></div><span>${Number(v).toFixed(1)}${u}</span></div>`}
function evidenceScoreText(a){return `视觉 ${a.counts.images} 图 + ${a.counts.videos} 视频元数据 · 文字 ${fmt(a.counts.text)} 条 · ${a.counts.sources} 类来源`}

function reviewPersonalScore(r,profile){
 const match=profileTagAssessment({wearerProfileEvidence:true,labelFields:r.authorTags||{}},profile);
 return .7*(r.informationScore??0)+.3*(profile?match.score:50);
}
function personalizedReviews(p,profile){
 const ranked=(p.reviews||[]).filter(r=>r.text&&!r.genericTemplate&&!r.futureOnly&&r.product_scope==='target_context'&&r.variant_scope!=='cross_variant')
  .map(r=>({r,s:reviewPersonalScore(r,profile)})).sort((a,b)=>b.s-a.s);
 const selected=ranked.slice(0,3);
 const negative=ranked.find(x=>x.r.negativeEvidence&&x.r.informationScore>=50&&x.s>=(selected[0]?.s??0)-15);
 if(negative&&selected.length===3&&!selected.some(x=>x.r.negativeEvidence))selected[2]=negative;
 return selected.map(x=>x.r);
}
function personalizedMedia(p,selfie){
 return rankReferenceMedia(p.media||[],getUserProfile()).slice(0,3);
}
function recommendationCopy(m){
 const r=m.recommendation;if(!r)return '';
 return `<p class="source-line">综合推荐 ${Math.round(r.combinedScore)}/100 · 图片参考 ${Math.round(r.qualityScore)}/100${r.match.coverage?' · 条件匹配 '+Math.round(r.match.score)+'/100':''}</p><p class="reason">${esc(r.reason)}</p>`;
}
function personalMatchScore(p,selfie,profile,reviews){
 let s=66;const a=p.analysis||{},kw=a.keywordCounts||{};
 if(a.evidenceSufficiency==='高')s+=7;
 if((a.platformDiff?.hue??99)<12)s+=5;
 if(selfie?.light?.label==='中性光')s+=4;
 if(profile.lip&&kw[profile.lip])s+=6;
 if(profile.makeup==='素颜'&&kw['素颜'])s+=5;
 if(profile.makeup==='淡妆'&&(kw['薄涂']||kw['素颜']))s+=3;
 if(profile.makeup==='浓妆'&&kw['厚涂'])s+=4;
 if(reviews.length>=3)s+=4;
 return Math.round(Math.max(45,Math.min(94,s)));
}
function expectedAppearance(p,selfie){
 const c=shadeTarget(p),light=selfie.light||{label:'中性光',brightness:60};
 const b=Math.max(5,Math.min(95,c.brightness+(light.brightness-60)*.12));
 let tone='接近多来源参考色域';if(light.label==='暖光')tone='在当前暖光下可能更偏橘/棕';if(light.label==='冷光')tone='在当前冷光下可能更偏冷/紫';if(light.label==='偏暗')tone='当前照片偏暗，实际上嘴可能比预览更亮';
 return {h:c.hue,s:c.saturation,b:+b.toFixed(1),tone};
}
async function callCloudAgent(p,profile,selfie,reviews,match){
 const api=(window.TRUETONE_CONFIG?.apiBase||'').replace(/\/$/,'');if(!api)return null;
 const evidence={
  product:{key:p.key,brand:p.brand,shade:p.shade,name:p.name,product:p.product,texture:p.finish?.label||p.texture,variant:p.selectedPreviewVariant,skuLines:p.skuLines||[]},
  trust_score:null,evidence_sufficiency:null,
  image_color_similarity_median:p.analysis.score,
  report_contract:'仅解释同产品可追溯证据；颜色、文字、匹配分开。禁止生成真假总分、真实性概率、独立模型置信度或未完成的准确率。自然光/无滤镜声明不作为加分依据。',
  counts:p.analysis.counts,platform_diff:p.analysis.platformDiff,keyword_counts:p.analysis.keywordCounts,
  representative_reviews:reviews.map(r=>({platform:r.platform,type:r.type,text:r.text,sku:r.sku||'',repeatBuyer:!!r.repeatBuyer,negativeEvidence:!!r.negativeEvidence})),
  deterministic_match_score:match,
  personal_color_reference:{scope:p.personalColor?.scope,variant:p.selectedPreviewVariant,color:p.personalColor?.color?.hex,sample_count:p.personalColor?.usedCount,match_counts:p.personalColor?.counts,source_ids:p.personalColor?.samples.map(m=>m.id),finish:p.finish?.label},
  top_reference_media:personalizedMedia(p,selfie).map(m=>({media_id:m.id,source_object_key:m.source_object_key,tags:m.semanticTags,recommendation:m.recommendation}))
 };
 const payload={product_key:p.key,profile,selfie_features:{light:selfie.light,faceRef:selfie.faceRef},evidence};
 const cacheKey='truetone-cloud-v10:'+JSON.stringify([p.key,p.selectedPreviewVariant,p.personalColor?.color?.hex,profile,selfie.light?.label,Math.round(selfie.light?.brightness||0),match]);
 if(cloudCache.has(cacheKey))return cloudCache.get(cacheKey);
 try{
   const saved=sessionStorage.getItem(cacheKey);
   if(saved){const parsed=JSON.parse(saved);if(parsed?.savedAt&&Date.now()-parsed.savedAt<30*60*1000){cloudCache.set(cacheKey,parsed.value);return parsed.value}}
 }catch(_){}
 try{
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18000);
   const r=await fetch(api+'/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:controller.signal,cache:'no-store'});
   clearTimeout(timer);
   if(!r.ok)throw Error('HTTP '+r.status);
   const out=await r.json();
   if(!out||out.error)throw Error(out?.error||'incomplete cloud result');
   cloudCache.set(cacheKey,out);
   try{sessionStorage.setItem(cacheKey,JSON.stringify({savedAt:Date.now(),value:out}))}catch(_){}
   return out;
 }catch(e){
   console.warn('Cloud Agent unavailable; stable local result will be used.',e);
   return null;
 }
}

function normalizeTargetInput(s){
 return String(s||'')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'')
  .toLowerCase()
  .replace(/[＃#\s·._\-\/\\()（）【】\[\],，:：'"“”‘’]/g,'');
}
function brandAliasesForProduct(p){
 if(p.key.startsWith('ysl-'))return ['ysl','圣罗兰','saintlaurent','yvessaintlaurent','yslbeauty'];
 if(p.key.startsWith('lancome-'))return ['lancome','兰蔻'];
 return [p.brand||''];
}
function shadeAliasesForProduct(p){
 return [p.shade,p.name,...(p.shadeAliases||[]),...(p.skuLines||[])]
  .map(normalizeTargetInput)
  .filter(Boolean);
}
function tokenMatches(input,tokens){
 if(!input)return false;
 return tokens.some(t=>t&&(input===t||input.includes(t)||t.includes(input)));
}
function resolveDemoProduct(brandRaw,shadeRaw){
 const brandInput=normalizeTargetInput(brandRaw);
 const shadeInput=normalizeTargetInput(shadeRaw);
 const combined=normalizeTargetInput(String(brandRaw||'')+' '+String(shadeRaw||''));

 const scored=manifest.products.map(p=>{
   const brandAliases=brandAliasesForProduct(p).map(normalizeTargetInput);
   const shadeAliases=shadeAliasesForProduct(p);

   const brandHit=tokenMatches(brandInput,brandAliases);
   const shadeHit=tokenMatches(shadeInput,shadeAliases);
   const combinedBrandHit=tokenMatches(combined,brandAliases);
   const combinedShadeHit=tokenMatches(combined,shadeAliases);

   let score=0;
   if(brandHit)score+=4;
   if(shadeHit)score+=6;
   if(combinedBrandHit)score+=2;
   if(combinedShadeHit)score+=3;

   // Exact shade number is the strongest signal in this 4-product Demo.
   const exactShade=normalizeTargetInput(p.shade);
   if(shadeInput===exactShade||combined.includes(exactShade))score+=8;

   return {p,score,brandHit:brandHit||combinedBrandHit,shadeHit:shadeHit||combinedShadeHit};
 }).filter(x=>x.shadeHit&&x.score>0).sort((a,b)=>b.score-a.score);

 if(!scored.length)return null;

 // If the user entered a brand, require that it resolves to the same product family.
 if(brandInput){
   const branded=scored.filter(x=>x.brandHit);
   if(branded.length===1)return branded[0].p;
   if(branded.length>1&&branded[0].score>branded[1].score)return branded[0].p;
   return null;
 }

 // Shade-only input is allowed when it uniquely identifies one Demo product (e.g. 274).
 const uniqueKeys=[...new Set(scored.map(x=>x.p.key))];
 if(uniqueKeys.length===1)return scored[0].p;

 // Combined free text such as "ysl610" / "圣罗兰610" is also accepted.
 const combinedBranded=scored.filter(x=>x.brandHit);
 if(combinedBranded.length===1)return combinedBranded[0].p;

 return null;
}
function detectBrandOnly(brandRaw){
 const b=normalizeTargetInput(brandRaw);
 if(!b)return null;
 const groups=[
  {id:'ysl',label:'圣罗兰 YSL',aliases:['ysl','圣罗兰','saintlaurent','yvessaintlaurent','yslbeauty']},
  {id:'lancome',label:'兰蔻 Lancôme',aliases:['lancome','兰蔻']}
 ];
 return groups.find(g=>tokenMatches(b,g.aliases.map(normalizeTargetInput)))||null;
}

function getUserProfileDraft(){
 try{
  const x=JSON.parse(sessionStorage.getItem('truetone-user-profile')||'null');
  if(!x||typeof x!=='object'||Array.isArray(x))return null;
  const legacySkin={'白皙偏冷':'白皙','白皙偏暖':'白皙','自然黄调':'黄皮','健康深肤':'黑皮'};
  const normalized={...x,
   lip:USER_TAG_SCHEMA.lip.includes(x.lip)?x.lip:'',
   skin:USER_TAG_SCHEMA.skin.includes(x.skin)?x.skin:(legacySkin[x.skin]||''),
   makeup:USER_TAG_SCHEMA.makeup.includes(x.makeup)?x.makeup:''};
  if(normalized.lip!==x.lip||normalized.skin!==x.skin||normalized.makeup!==x.makeup)saveUserProfile(normalized);
  return normalized;
 }catch(_){}
 return null;
}
function getUserProfile(){const x=getUserProfileDraft();return x?.lip&&x?.skin&&x?.makeup?x:null}
function saveUserProfile(p){sessionStorage.setItem('truetone-user-profile',JSON.stringify(p))}
function profileSummary(p){
 if(!p)return '尚未填写';
 return [p.lip,p.skin,p.makeup].filter(Boolean).join(' · ');
}
function profileOption(values,selected=''){return '<option value="">请选择</option>'+values.map(v=>'<option '+(v===selected?'selected':'')+'>'+esc(v)+'</option>').join('')}
function renderProfileChips(p){if(!p)return '<a href="#/">填写我的条件</a>';return '<span>'+esc(p.lip)+'</span><span>'+esc(p.skin)+'</span><span>'+esc(p.makeup)+'</span>'}

function demoCaseCards(){return `<div class="benchmark-grid">${DEMO_CASES.map((c,i)=>`<a class="benchmark-card" href="#/seeded?case=${c.id}"><span class="eyebrow">案例 0${i+1}</span><b>${esc(c.title)}</b><p>${esc(c.description)}</p><span>一键体验 →</span></a>`).join('')}</div>`}
function currentDemoCase(){const id=new URLSearchParams(location.hash.split('?')[1]||'').get('case');return DEMO_CASES.find(c=>c.id===id)||null}
function evidenceProfile(){return currentDemoCase()?.profile||getUserProfile()}
async function home(){
 await getManifest();selfieFile=null;selfieResult=null;purchaseTargetKey=null;seededFiles=[];
 const saved=getUserProfile(),draft=getUserProfileDraft();
 page(`
 <section class="consumer-hero gateway-hero evidence-hero">
   <div class="eyebrow">试色有谱 · TrueTone</div>
   <h1>同一支口红，<br>哪条试色值得参考？</h1>
   <p>一张照片好看，不代表它适合做购买依据。把你看到的图片和文案拿来：先查图片处理线索，再核对颜色与说法，最后找和你条件接近的真实体验。</p>
   <div class="evidence-primary-actions"><a class="primary-btn big-action" id="gateway-seeded" href="#/seeded">检查一条种草</a><a class="secondary-btn" href="#/search">看已收录的真实证据</a></div>
   <div class="proof-steps"><span><b>01</b> 图像有哪些处理线索</span><span><b>02</b> 哪些证据值得参考</span><span><b>03</b> 哪些证据更接近你</span></div>
 </section>
 <section class="forensic-entry panel-soft"><div class="eyebrow">新增 · 可复现的图像取证</div><h2>改色、抹平纹理、拼接，能发现多少？</h2><p>用有编辑记录和区域标签的受控图片测试，公开正常处理的误报和漏检。新增编辑对照不等于已证明照片真实。</p><a class="primary-btn" href="./forensics.html">打开篡改风险测试台</a></section>
 <section class="benchmark-section"><div class="section-head"><div><div class="eyebrow">不用上传，先体验一次</div><h2>三条内容，三种需要核对的问题</h2></div></div>${demoCaseCards()}<p class="scope-note">案例来自团队评估文档，点击后会实际分析图片和文字。它们是已知的演示压力测试，不是独立盲测或准确率证明。</p></section>
 <section class="scope-strip"><b>当前深入覆盖 4 个色号</b><span>YSL 610 / 1936 · 兰蔻 274 / 275</span><p>169 张原始图片中，151 张用于颜色参考；1,913 条去重文字记录。四个色号上的原型，尚未验证能推广到其他口红。</p></section>
 <section class="profile-onboarding panel-soft" id="my-conditions">
   <div class="step-copy"><div class="eyebrow">想看哪些证据更适合你？</div><h2>补充你的使用条件</h2><p>不填也能检查内容；填写后才比较与你相近的唇色、肤色和妆面。原生唇色没有明确自述的样本不会被算成完全匹配。</p></div>
   <div class="profile-fields profile-first">
     <label>原生唇色<select id="profile-lip" class="select">${profileOption(USER_TAG_SCHEMA.lip,draft?.lip||'')}</select></label>
     <label>肤色<select id="profile-skin" class="select">${profileOption(USER_TAG_SCHEMA.skin,draft?.skin||'')}</select></label>
     <label>平时妆面<select id="profile-makeup" class="select">${profileOption(USER_TAG_SCHEMA.makeup,draft?.makeup||'')}</select></label>
   </div>
   <button class="primary-btn profile-save" id="profile-save" disabled>${saved?'更新我的信息':'保存我的条件'}</button>
   <div id="gateway-question" class="${saved?'':'hidden'}"><p class="profile-ready">已填写条件，检查内容和浏览色号时会优先展示相近证据。</p><a href="#/seeded" class="secondary-btn">检查我看到的内容 →</a></div>
 </section>
 <details class="auxiliary-entry"><summary>辅助体验：看看颜色在自拍上的大致方向</summary><p>先看证据，再使用视觉预览。预览参考最多 5 张条件相近的真实上唇图，不是精准 AR 试妆。</p><button class="secondary-btn" id="gateway-selfie">打开自拍颜色预览</button></details>
 `);
 const lip=$('#profile-lip'),skin=$('#profile-skin'),makeup=$('#profile-makeup'),save=$('#profile-save'),question=$('#gateway-question');
 const update=()=>save.disabled=!(lip.value&&skin.value&&makeup.value);
 [lip,skin,makeup].forEach(x=>x.onchange=update);update();
 save.onclick=()=>{saveUserProfile({lip:lip.value,skin:skin.value,makeup:makeup.value});save.textContent='已保存';question.classList.remove('hidden');toastMsg('已保存，之后会优先展示条件相近的证据')};
 $('#gateway-selfie').onclick=()=>{if(!getUserProfile()){toastMsg('先补充你的使用条件，再看个人颜色预览');$('#my-conditions').scrollIntoView({behavior:'smooth'});return}go('/selfie')};
}

async function selfieHome(){
 await getManifest();selfieFile=null;selfieResult=null;
 const profile=getUserProfile();if(!profile){go('/');return}
 page(`
 <section class="route-head consumer-route-head"><div><div class="eyebrow">从自己开始选</div><h1>看看这支口红对你有多大参考价值</h1><p>先上传自拍，再告诉试色有谱你正在考虑的色号。我们会先筛选可信内容，再找与你条件更接近的真实参考。</p></div><a href="#/" class="ghost-btn">修改我的信息</a></section>
 <div class="profile-summary-bar"><b>你的条件</b>${renderProfileChips(profile)}</div>
 <section class="consumer-builder">
   <div class="builder-step">
     <div class="step-num">01</div>
     <div class="step-copy"><div class="eyebrow">上传当前自拍</div><h2>让我们看到当前光线下的你</h2><p>优先使用自然光、无滤镜、正脸、嘴唇清晰的照片。自拍只在当前浏览器内用于本次预览。</p></div>
     <label class="selfie-uploader" id="consumer-selfie-zone" for="consumer-selfie-input">
       <input id="consumer-selfie-input" class="native-image-input" type="file" accept="image/*">
       <div id="consumer-selfie-empty"><div class="upload-icon">＋</div><b>点击上传自拍</b><span>手机相册 / JPG / PNG / WEBP（其他格式取决于浏览器）</span></div>
       <img id="consumer-selfie-preview" class="hidden" alt="自拍预览">
       <span class="replace-photo hidden" id="consumer-replace-photo">更换照片</span>
     </label>
   </div>

   <div class="builder-step">
     <div class="step-num">02</div>
     <div class="step-copy"><div class="eyebrow">告诉我们你想买什么</div><h2>输入品牌和目标色号</h2><p>当前 Demo 会在团队已收录的小红书 + 淘宝真实样本库中匹配。</p></div>
     <div class="target-entry">
       <div class="target-fields">
         <label><span>品牌名</span><input id="consumer-brand" class="target-input" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="直接输入，如 ysl / 圣罗兰 / 兰蔻"></label>
         <label><span>色号 / 色号名</span><input id="consumer-shade" class="target-input" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="直接输入，如 610 / 274 / 冰乌龙"></label>
       </div>
       <div id="consumer-variant-wrap" class="hidden"><label class="preview-variant-picker" for="consumer-variant"><span>选择你购买的 274 版本</span><select id="consumer-variant" class="select">${previewVariantOptions()}</select><small>只使用同一版本的图片取色。</small></label></div><div class="target-match empty-state" id="target-match">输入品牌和色号后，试色有谱会确认是否已收录该产品。</div>
       <p class="demo-support">支持直接输入中英文品牌名和色号：YSL / 圣罗兰 610、1936；Lancôme / 兰蔻 274、275。</p>
     </div>
   </div>

   <div class="consumer-start">
     <button class="primary-btn big-action" id="consumer-run" disabled>上传自拍后开始分析</button>
     <p>我们会把“网络内容是否值得参考”和“这些内容与你是否接近”分开判断。</p>
   </div>
 </section>
 <section id="consumer-analysis"></section>
 `);

 const input=$('#consumer-selfie-input'),zone=$('#consumer-selfie-zone'),preview=$('#consumer-selfie-preview'),empty=$('#consumer-selfie-empty'),replace=$('#consumer-replace-photo'),run=$('#consumer-run'),brandInput=$('#consumer-brand'),shadeInput=$('#consumer-shade'),matchBox=$('#target-match');
 function updateRunState(){
   const ok=!!selfieFile&&!!purchaseTargetKey;run.disabled=!ok;
   run.textContent=!selfieFile?'上传自拍后开始分析':!purchaseTargetKey?'请输入已收录的品牌与色号':'开始分析';
 }
 function updateTargetMatch(){
   const p=resolveDemoProduct(brandInput.value,shadeInput.value);purchaseTargetKey=p?.key||null;$('#consumer-variant-wrap').classList.toggle('hidden',p?.key!=='lancome-274');
   if(p){
     matchBox.className='target-match matched';
     matchBox.innerHTML=`<span class="shade-dot" style="background:${color(p)}"></span><div><b>已找到：${esc(p.brand)} #${p.shade} · ${esc(p.name)}</b><small>${fmt(p.analysis.counts.visual)} 份视觉素材 · ${fmt(p.analysis.counts.text)} 条文字证据</small></div><em>可分析</em>`;
   }else if(brandInput.value||shadeInput.value){
     const brandOnly=detectBrandOnly(brandInput.value);
     matchBox.className='target-match no-match';
     matchBox.textContent=brandOnly&&!shadeInput.value.trim()
       ? '已识别品牌：'+brandOnly.label+'。请继续直接输入色号或色号名。'
       : '还没有匹配到完整产品。可以直接输入 ysl / 圣罗兰 / 兰蔻，以及 610 / 1936 / 274 / 275 或已收录别称。';
   }else{matchBox.className='target-match empty-state';matchBox.textContent='直接输入品牌和色号；不需要从下拉列表选择。'}
   updateRunState();
 }
 function chooseFile(file){
   if(!file)return;const name=String(file.name||'').toLowerCase();
   const looksLikeImage=(file.type||'').startsWith('image/')||/\.(jpe?g|png|webp|heic|heif)$/i.test(name);
   if(!looksLikeImage){toastMsg('请选择照片文件');return}
   selfieFile=file;const objectUrl=URL.createObjectURL(file);
   preview.onload=()=>URL.revokeObjectURL(objectUrl);preview.onerror=()=>{URL.revokeObjectURL(objectUrl);toastMsg('这张照片当前浏览器无法预览，请尝试 JPG / PNG 或重新选择。')};
   preview.src=objectUrl;preview.classList.remove('hidden');empty.classList.add('hidden');replace.classList.remove('hidden');updateRunState();
 }
 input.onchange=()=>chooseFile(input.files&&input.files[0]);
 zone.ondragover=e=>{e.preventDefault();zone.classList.add('drag')};zone.ondragleave=()=>zone.classList.remove('drag');zone.ondrop=e=>{e.preventDefault();zone.classList.remove('drag');chooseFile(e.dataTransfer.files&&e.dataTransfer.files[0])};
 brandInput.oninput=updateTargetMatch;shadeInput.oninput=updateTargetMatch;
 const params=new URLSearchParams(location.hash.split('?')[1]||''),initial=meta(params.get('p')||purchaseTargetKey);
 if(initial){brandInput.value=initial.brand;shadeInput.value=initial.shade;const v=params.get('v');if(PREVIEW_VARIANTS.some(x=>x.id===v))$('#consumer-variant').value=v;updateTargetMatch()}
 updateRunState();run.onclick=runConsumerJourney;
}

function extractSeedTextSignals(text,p){return assessEvidenceText(text,p)}


function seededVisualAgreement(p,analyses){return compareUploadedColors(analyses,p.colorReference).score}

function lightingMeaning(label){
 return {
  '暖光':'画面偏暖，可能影响橘、棕调观感；不能仅凭像素确认真实光源。',
  '冷光':'画面偏冷，可能影响紫、粉调观感；不能仅凭像素确认真实光源。',
  '过曝':'画面偏亮，深色和灰调会被冲淡，实物通常可能更深。',
  '偏暗':'画面偏暗，颜色容易显得更深、更土。',
  '中性光':'画面整体冷暖倾向不明显；仅凭成片无法证明是自然光或无滤镜。'
 }[label]||'当前光线没有足够信息做进一步判断。';
}
function nearestPlatform(m,distEntry){
 const ps=distEntry?.platforms||{};let best=null;
 Object.entries(ps).forEach(([name,d])=>{
  const v=circularHueDistance(m.hue,d.hue.circular_center)*.55+Math.abs(m.saturation-d.saturation.median)*.2+Math.abs(m.brightness-d.brightness.median)*.25;
  if(!best||v<best.v)best={name,v};
 });
 return best?.name||'全库';
}
function sampleUsageHtml(p){
 const r=p.colorReference;if(!r)return '';
 const c=r.coverage,excluded=r.excluded||[];
 const variantName=v=>({cream:'黑管哑光',cream_gift:'声色限定',intimatte:'粉金管',unknown:'版本未确认'}[v]||v);
 const rows=excluded.map(s=>`<tr><td>${esc(s.source_object_key)}</td><td>${esc(variantName(s.variant))}</td><td>不用于颜色参考</td><td>${esc(s.assessment.reason)}</td></tr>`).join('');
 return `<section class="panel report-section sample-usage"><div class="section-head"><div><div class="eyebrow">样本使用记录</div><h2>已检查 ${c.available_inputs} 张：使用 ${c.accepted} 张，不使用 ${c.excluded} 张</h2></div><p>与对应官方标准图色差 ΔE00 超过 20、未识别到可靠唇部、无法读取或重复的图片，均不参与参考颜色和排序。原始记录保留；“不使用”不代表图片造假。</p></div><p>标准图：${r.officials.map(o=>esc(o.label)).join('；')}。274 版本明确时只对照对应产品线，版本不明时只做家族范围筛选。</p><details><summary>查看 ${excluded.length} 张不使用的图片及原因</summary>${rows?`<div class="usage-table-wrap"><table class="usage-table"><thead><tr><th>原始图片</th><th>产品线</th><th>标记</th><th>原因</th></tr></thead><tbody>${rows}</tbody></table></div>`:'<p>本色号没有被排除的图片。</p>'}</details><p><a href="./data/catalog/sample_usage_v3.csv" download="truetone-sample-usage.csv">下载全部 169 张图片的使用标记（CSV）</a></p></section>`;
}
function imageDetailEvidence(p,analyses,distEntry){
 const d=distEntry?.all;
 return analyses.map((x,i)=>{
  const m=x.metrics,notes=[lightingMeaning(m.lighting)];
  if(m.roiDetected===false)notes.push(m.roiReason);
  if(m.roiDetected!==false)notes.push(m.roiSource==='selected-lips'?'按你标记的唇部像素分析。':m.roiSource==='semantic-lips'?'已自动分割上唇和下唇，排除皮肤、牙齿与口腔。':'已自动定位唇部，排除口腔内部。');
  if(m.roiSource==='semantic-lips'&&m.segmentationConfidence<.65)notes.push('特写选区置信度较低，可查看自动选区核对；颜色结果仅代表选中的像素。');
  const match=compareLipColor(m,p.colorReference);
  if(match){
   notes.push(`与 ${match.officialLabel||'官方标准图'} 的唇部颜色比较：感知色差 ΔE00 ${match.deltaE}，颜色相似度 ${match.score}/100。`);
   if(match.variantUnspecified)notes.push('274 产品线未确认：这里只显示与三个官方标准图中最接近者的颜色相似度，不据此判断产品版本。');
   notes.push(match.score===0?'唇部颜色与官方标准图明显不同，不能用它代表该色号的颜色。':match.score<50?'唇部颜色与官方标准图差异较大。':'唇部颜色与官方标准图较接近，但这不是真实性结论。');
  }else notes.push('缺少可靠唇部选区或自动重算的样本基准，未计算相似度。');
  return {index:i+1,view:x.views?.original,roi:x.views?.roi,lighting:m.lighting,notes};
 });
}
function detect274Variant(text=''){return detectProductVariant(text)}

function relevantEvidenceClaims(profile,rawText,evidenceEntry){
 const claims=evidenceEntry?.claims||{},wanted=[];
 const add=k=>{if(claims[k]&&!wanted.includes(k))wanted.push(k)};
 if(profile?.skin==='黄皮'||/黄皮|黄黑皮/.test(rawText))add('yellow_skin');
 if(profile?.lip==='深唇'||/深唇/.test(rawText))add('deep_lip');
 if(profile?.lip==='浅唇'||/浅唇/.test(rawText))add('light_lip');
 if(profile?.makeup==='素颜'||/素颜/.test(rawText))add('bare_face');
 return wanted.map(k=>({key:k,...claims[k]}));
}
function claimEvidenceHtml(items){
 if(!items.length)return '<div class="plain-note">当前数据库没有足够明确、可稳定归类到你这些标签的支持/反对文本，因此这里不硬凑结论。</div>';
 return items.map(c=>{
  const total=(c.support_count||0)+(c.oppose_count||0);
  const supports=(c.support_examples||[]).slice(0,2).map(x=>`<blockquote class="evidence-quote support"><b>支持 · ${esc(x.platform)}${x.variant&&x.variant!=='default'?' · '+esc(x.variant):''}</b><span>${esc(x.text)}</span></blockquote>`).join('');
  const opposes=(c.oppose_examples||[]).slice(0,2).map(x=>`<blockquote class="evidence-quote oppose"><b>相悖 · ${esc(x.platform)}${x.variant&&x.variant!=='default'?' · '+esc(x.variant):''}</b><span>${esc(x.text)}</span></blockquote>`).join('');
  return `<div class="claim-evidence"><div class="claim-head"><b>${esc(c.label)}</b><span>可明确判断的 ${total} 条中：${c.support_count||0} 条支持 · ${c.oppose_count||0} 条相悖</span></div><div class="quote-grid">${supports}${opposes}</div></div>`;
 }).join('');
}
function variant274Html(entry,rawText){
 const vm=entry?.variant_model;if(!vm)return '';
 const detected=detect274Variant(rawText),x=vm.xiaohongshu;
 return `<section class="variant-insight-card">
  <div class="eyebrow">274 的特殊问题：同号不同版本</div>
  <h2>版本混淆不是噪音，本身就是消费者风险。</h2>
  <p>淘宝数据能明确拆成 3 个版本：${vm.taobao_variants.map(v=>esc(v.label)).join('、')}。但小红书的 ${x.main_posts} 篇主帖并没有统一的版本字段：其中 ${x.explicit_lipglaze_or_mirror_posts} 篇明确提到唇釉/镜面，${x.explicit_xiaomanyao_posts} 篇提到“小蛮腰”，还有 ${x.no_clear_variant_posts} 篇仅写“274”而无法确认。</p>
  <div class="variant-detection"><span>这次上传文字的版本识别</span><b>${esc(detected.label)}</b><em>文字依据：${detected.confidence==='高'?'明确':detected.confidence==='中'?'间接':'不足'}</em></div>
  <p>因此试色有谱不会强行把所有小红书 274 内容塞进淘宝的三个版本。版本明确时做版本内比较；版本不明确时只用于“274 色号家族”层面的证据，并降低版本判断的确定性，而不是直接把它判成假。</p>
  <div class="plain-note"><b>真实混淆案例：</b>${esc(vm.cross_variant_example.text)}</div>
 </section>`;
}
function databaseComparisonDetails(p,profile,rawText,evidenceEntry,distEntry,visualAgreement){
 const kw=p.analysis?.keywordCounts||{},items=[];
 if(Number.isFinite(visualAgreement))items.push('图片与对应官方标准图的唇部颜色比较，颜色相似度为 '+visualAgreement+'/100；全部原始图片已检查，其中 '+(p.colorReference?.samples?.length||0)+' 张通过选区和标准色筛选。这不是真实性概率。');
 const riskPairs=[['色差','色差'],['拔干','拔干'],['沾杯','沾杯'],['氧化','氧化/成膜变化']].filter(([k])=>kw[k]);
 if(riskPairs.length)items.push('真实消费者反复提到的风险里，'+riskPairs.map(([k,l])=>l+' '+kw[k]+' 次').join('、')+'。这些会作为文案核对依据，而不是只看好评数量。');
 if((p.analysis?.consumerDifferenceMentions||0)>0)items.push('共有 '+p.analysis.consumerDifferenceMentions+' 条文本明确提到偏色、色差或“和图片不一样”，所以系统会特别检查上传内容是否把个体差异说成绝对结论。');
 const claims=relevantEvidenceClaims(profile,rawText,evidenceEntry);
 return {items,claims};
}
function seededPersonalRelevance(profile,textSignals,p){
 const tags=textSignals?.authorTags||{},fields=['lip','skin','makeup'];
 const matched=fields.filter(k=>tags[k]?.value&&tags[k].value===profile?.[k]).map(k=>({lip:'唇色',skin:'肤色',makeup:'妆面'}[k]+'相近'));
 const missing=fields.filter(k=>!tags[k]?.value).map(k=>({lip:'唇色',skin:'肤色',makeup:'妆面'}[k]));
 const comparison=profileTagAssessment({wearerProfileEvidence:true,labelFields:tags},profile);
 return {score:profile&&comparison.coverage?Math.round(comparison.score):null,matched,missing,coverage:comparison.coverage,reviews:personalizedReviews(p,profile)};
}

function seedFindingText(f){
 const map={
  '试色区域高饱和':'图片颜色偏艳，实际颜色可能没有这么饱和。',
  '画面过曝/提亮':'图片偏亮，实际颜色可能比画面里更深。',
  '画面偏暗':'图片偏暗，实际颜色可能比画面里更亮。',
  '色相异常分散':'这张图片的颜色信息比较混杂，不适合单独判断口红颜色。',
  '大面积高饱和':'画面整体偏艳，可能放大了颜色冲击感。',
  '明显色温影响':'拍摄光线会明显改变口红的冷暖观感。',
  '跨图饱和度差异':'你上传的几张图片之间浓淡差异较明显。',
  '跨图亮度差异':'你上传的几张图片之间明暗差异较明显。',
  '跨图色相差异':'你上传的几张图片颜色方向差异较明显。',
  '与官方标准色偏离':'唇部颜色与对应官方标准图不同，不能用它代表该色号的颜色。'
 };
 return map[f.type]||f.impact||f.type;
}
async function seeded(){
 await getManifest();const demo=currentDemoCase(),profile=evidenceProfile();
 purchaseTargetKey=null;seededFiles=[];
 page(`
 <section class="route-head consumer-route-head"><div><div class="eyebrow">被种草之后，先别急着下单</div><h1>这条试色，值得作为购买参考吗？</h1><p>图片和文字可以分别上传，也可以一起上传。我们只分析你实际提供的证据，不会因为缺少另一部分就扣分。</p></div><a href="#/" class="ghost-btn">修改我的信息</a></section>
 <div class="profile-summary-bar"><b>${demo?'示例条件（不改你的设置）':'你的条件'}</b>${renderProfileChips(profile)}</div>
 ${demo?`<div class="demo-case-notice"><b>演示案例：${esc(demo.title)}</b><p>使用团队提供的原文和图片，仍由当前算法实际分析。不是预设答案，也不是独立验证集。</p><a href="#/seeded">换成自己的内容</a></div>`:''}

 <section class="seeded-form panel-soft">
  <div class="seeded-product">
   <div><div class="eyebrow">01 · 先确认是哪支口红</div><h2>品牌与色号</h2><p>当前仅支持 YSL 610 / 1936、兰蔻 274 / 275。确认产品后，才能与对应色号的真实证据比较。</p></div>
   <div class="target-fields">
    <label><span>品牌名</span><input id="seed-brand" class="target-input" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="直接输入，如 ysl / 圣罗兰 / 兰蔻"></label>
    <label><span>色号 / 别称</span><input id="seed-shade" class="target-input" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="直接输入，如 610 / 274 / 冰乌龙"></label>
   </div>
   <div class="target-match empty-state" id="seed-target-match">输入品牌和色号后，我们会确认当前数据库是否已收录。</div>
  </div>

  <div class="seeded-input-grid">
   <div class="seeded-upload-card">
    <div class="eyebrow">02A · 图片证据</div><h3>上传种草图</h3><p>可以 1 张，也可以多张。先核对可比源图的局部变化，再找唇部比较颜色；没有源图时明确保留无法判定。</p>
    <label class="seeded-drop" for="seed-images"><input class="native-image-input" id="seed-images" type="file" accept="image/*" multiple><b>＋ 选择一张或多张图片</b><span>JPG / PNG / WEBP（其他格式取决于浏览器）</span></label>
    <div class="seed-preview-grid" id="seed-preview-grid"></div>
   </div>
   <div class="seeded-text-card">
    <div class="eyebrow">02B · 文字证据</div><h3>粘贴正文、评论或种草文案</h3><p>没有图片也可以单独分析文字。我们会和现有消费者评论库交叉核对。</p>
    <textarea id="seed-text" class="seed-textarea" placeholder="例如：薄涂很自然，深唇也完全不显脏，黄皮闭眼冲……"></textarea>
    <small>只上传图片 / 只上传文字 / 两者一起上传都可以。</small>
   </div>
  </div>
  <button class="primary-btn big-action seed-run" id="seed-run" disabled>至少上传一种内容后开始分析</button>
 </section>
 <section id="seed-result"></section>
 `);
 const brand=$('#seed-brand'),shade=$('#seed-shade'),match=$('#seed-target-match'),input=$('#seed-images'),preview=$('#seed-preview-grid'),textInput=$('#seed-text'),run=$('#seed-run');
 function updateState(){
  const p=resolveDemoProduct(brand.value,shade.value);purchaseTargetKey=p?.key||null;
  if(p){match.className='target-match matched';match.innerHTML=`<span class="shade-dot" style="background:${color(p)}"></span><div><b>已找到：${esc(p.brand)} #${p.shade} · ${esc(p.name)}</b><small>${fmt(p.analysis.counts.visual)} 份视觉素材 · ${fmt(p.analysis.counts.text)} 条文字证据${p.key==='lancome-274'?' · 检测到同号多版本，分析时会先处理版本不确定性':''}</small></div><em>可分析</em>`}
  else if(brand.value||shade.value){
   const brandOnly=detectBrandOnly(brand.value);
   match.className='target-match no-match';
   match.textContent=brandOnly&&!shade.value.trim()
    ? '已识别品牌：'+brandOnly.label+'。请继续直接输入色号或别称。'
    : '还没有匹配到完整产品。可以直接输入 ysl / 圣罗兰 / 兰蔻，以及 610 / 1936 / 274 / 275 或已收录别称。';
  }
  else{match.className='target-match empty-state';match.textContent='直接输入品牌和色号；不需要从下拉列表选择。'}
  const hasEvidence=seededFiles.length>0||textInput.value.trim().length>0;run.disabled=!(purchaseTargetKey&&hasEvidence);
  run.textContent=!purchaseTargetKey?'请先确认品牌与色号':!hasEvidence?'至少上传一种内容后开始分析':'开始检查这条种草';
 }
 function renderPreviews(){
  preview.innerHTML=seededFiles.map((f,i)=>{const u=URL.createObjectURL(f);return `<div class="seed-preview"><img src="${u}" onload="window.URL.revokeObjectURL(this.src)"><span>图片 ${i+1}</span></div>`}).join('');
 }
 input.onchange=()=>{seededFiles=[...(input.files||[])].slice(0,6);renderPreviews();updateState()};
 brand.oninput=shade.oninput=textInput.oninput=updateState;updateState();
 run.onclick=runSeededAnalysis;
 if(demo){
  const product=meta(demo.productKey);brand.value=product.brand;shade.value=product.shade;textInput.value=demo.text;
  try{const response=await fetch(demo.image);if(!response.ok)throw Error('示例图片加载失败');const blob=await response.blob();seededFiles=[new File([blob],demo.id+'.jpg',{type:'image/jpeg'})];renderPreviews();updateState();await runSeededAnalysis()}
  catch(e){updateState();toastMsg(e.message+'，可先分析示例文字')}
 }
}

async function runSeededAnalysis(){
 const result=$('#seed-result'),run=$('#seed-run'),profile=evidenceProfile();
 if(!purchaseTargetKey)return;
 const rawText=($('#seed-text')?.value||'').trim(),routeAtStart=location.hash,productKey=purchaseTargetKey,files=[...seededFiles];
 run.disabled=true;run.textContent=seededFiles.length&&rawText?'正在核对图片与文案…':seededFiles.length?'正在检查图片颜色…':'正在核对文字证据…';

 result.innerHTML=`<section class="consumer-progress">
   <div class="eyebrow">试色有谱正在检查</div>
   <h2>先核对相近源图的局部差异，再识别唇部并核对图片与文案。</h2>
   <div class="human-progress">
     <div class="hp active">读取上传内容</div>
     <div class="hp">核对源图差异与唇部（首次加载稍慢）</div>
     <div class="hp">核对文字与真实消费者反馈</div>
     <div class="hp">与对应官方标准色比较</div>
     <div class="hp">计算与你的参考相关性</div>
   </div>
   <div class="progress"><i id="seed-progress-bar"></i></div>
 </section>`;
 result.scrollIntoView({behavior:'smooth',block:'start'});

 const steps=()=>$$('.hp');
 const bar=()=>$('#seed-progress-bar');
 const mark=(index,className)=>{
   const list=steps();
   if(list[index])list[index].classList.add(className);
 };
 const setBar=width=>{
   const el=bar();
   if(el)el.style.width=width;
 };

 try{
  const baseProduct=await getProduct(productKey);
  const variant=baseProduct.key==='lancome-274'?detect274Variant(rawText).id:null;
  const p={...baseProduct,colorReference:baseProduct.colorReference?{...baseProduct.colorReference,selectedVariant:variant}:null};
  const [evCatalog,distCatalog]=await Promise.all([getEvidenceCatalog(),getReferenceDistributions()]);
  const evidenceEntry=evCatalog?.products?.[p.key]||null;
  const distEntry=distCatalog?.products?.[p.key]||null;

  mark(0,'done');mark(1,'active');setBar('20%');

  const forensics=[];
  for(const file of files)forensics.push(await analyzeVisualForensics(file));
  const analyses=[];
  for(const file of files)analyses.push(await analyzeEvidenceFile(file));
  const visual=analyses.length?runFourAgents(analyses,p):null;

  mark(1,'done');mark(2,'active');setBar('42%');

  const textReport=rawText?extractSeedTextSignals(rawText,p):null;
  const crossModal=crossModalAssessment(textReport,analyses),corpusColor=visualCorpusAgreement(p,analyses);

  mark(2,'done');mark(3,'active');setBar('64%');

  const visualAgreement=seededVisualAgreement(p,analyses,distEntry);
  mark(3,'done');mark(4,'active');setBar('84%');
  const personal=seededPersonalRelevance(profile,textReport,p);
  const cloudMedia=await fetchCloudReferenceMedia(p.key,['cream','cream_gift','intimatte'].includes(variant)?variant:null,profile);

  mark(4,'done');setBar('100%');

  if(location.hash!==routeAtStart)return;
  renderSeededResult({
   p,profile,rawText,analyses,visual,textReport,forensics,forensicFiles:files,
   personal,cloudMedia,crossModal,corpusColor,
   evidenceEntry,distEntry,visualAgreement
  });
 }catch(e){
   console.error('runSeededAnalysis failed',e);
   result.innerHTML=`<section class="sku-warning"><b>这次没有稳定完成分析。</b><br>${esc(e?.message||String(e))}</section>`;
 }finally{
   run.disabled=false;
   run.textContent='重新分析这条种草';
 }
}

function textAssessmentHtml(report){
 if(!report)return '<p>未提供文字，本次不评价文案。</p>';
 const reasons=report.criteria.map(c=>`<div class="rubric-row"><span>${esc(c.label)}</span><b>${c.earned}/${c.max}</b></div>`).join('');
 return `<div class="text-risk-label ${report.riskLevel}">${report.riskLevel==='high'?'有绝对承诺需要核对':report.riskLevel==='medium'?'有泛化说法或版本信息待补充':'未触发当前规则中的绝对承诺'}</div><ul>${report.flags.map(x=>`<li>${esc(x)}</li>`).join('')||'<li>具体使用条件和负面体验都可作为参考，不因出现“沾杯、氧化、唇纹”就扣分。</li>'}</ul>${report.uncertainties.map(x=>`<p class="uncertainty-note">${esc(x)}</p>`).join('')}<details class="text-rubric"><summary>文字参考分 ${report.score}/100 · 查看依据</summary><p>用于比较文案的信息量和表达边界；规则分，不是真实概率，也不是人工标注准确率。没有固定起算分。</p>${reasons}<p>信息合计 ${report.informationScore}；风险扣分 ${report.penalty}；绝对承诺上限 ${report.cap}。最终为 ${report.score}。</p></details>`;
}
function counterEvidenceHtml(report){
 const rows=report?.counterEvidence||[];
 if(!rows.length)return '<p class="scope-note">没有找到可直接对应这条绝对性能承诺的同产品评价时，保留“待核对”，不会编造反例。</p>';
 return `<div class="quote-grid">${rows.map(r=>`<blockquote class="evidence-quote oppose" data-counter-review="${esc(r.reviewId)}"><b>不同体验 · ${esc(r.platform)} · ${esc(r.variant==='unknown'?'版本未明确':r.variant||'当前产品')}</b><span>${esc(r.text)}</span><small>记录 ${esc(r.reviewId)}。个体反馈不能单独证伪作者，只说明不能泛化成所有人。</small></blockquote>`).join('')}</div>`;
}
function renderSeededResult({p,profile,rawText,analyses,visual,textReport,forensics=[],forensicFiles=[],personal,cloudMedia,evidenceEntry,distEntry,visualAgreement,crossModal,corpusColor}){
 const hasImage=analyses.length>0,coordinated=coordinateEvidence({textReport,visual,forensics,hasImage,crossModal}),decision=coordinated.decision;
 const details=imageDetailEvidence(p,analyses,distEntry);
 const imageDetailsHtml=details.map(d=>`<article class="image-evidence-detail">${d.view?`<img src="${d.view}" alt="上传图片 ${d.index}">`:''}<div><button type="button" class="ghost-btn" data-show-roi="${d.index-1}">查看自动选区</button><div class="image-detail-head"><b>图片 ${d.index}</b><span>${esc(d.lighting)}（画面表现）</span></div><ul>${d.notes.map(n=>`<li>${esc(n)}</li>`).join('')}</ul></div></article>`).join('');
 const mediaHtml=cloudMedia?.length?cloudMedia.map((m,i)=>cloudReferenceCard(m,i)).join(''):'<div class="empty">当前没有足够可靠的真人参考图，不补造样本。</div>';
 const reviewHtml=(personal.reviews||[]).map((r,i)=>`<article class="matched-review"><div class="match-rank">0${i+1}</div><div><div class="review-source">${esc(r.platform)} · ${esc(r.type||'消费者反馈')}</div><p>“${highlight(r.text)}”</p><small>记录 ${esc(r.id)} · 优先具体使用体验${profile?'及已确认的条件匹配':''}；保留负面反馈。</small></div></article>`).join('')||'<div class="empty">没有足够可对应的评价，不补造原文。</div>';
 const dbDetail=databaseComparisonDetails(p,profile,rawText,evidenceEntry,distEntry,visualAgreement);
 $('#seed-result').innerHTML=`
 <section class="seed-report" data-assessment-version="${esc(textReport?.version||'image-only')}" data-decision="${decision.level}" data-text-score="${textReport?.score??''}" data-image-score="${visual?.score??''}">
  ${forensicHtml(forensics)}
  <div class="seed-report-hero evidence-result-hero"><div><div class="eyebrow">02 · 再核对内容的依据</div><h2>${esc(decision.title)}</h2><p>${esc(decision.detail)}</p><p class="scope-note">本次检查 ${hasImage?analyses.length+' 张图片':''}${hasImage&&textReport?'和':''}${textReport?'文字':''}。图片、文字、个人条件分开解释，不合成“真假总分”。</p></div></div>
  <div class="seed-two-col evidence-dimensions">
   <section class="seed-card text-assessment"><div class="eyebrow">文案有没有把话说满</div><h3>${textReport?'先看承诺与使用条件':'未提供文案'}</h3>${textAssessmentHtml(textReport)}</section>
   <section class="seed-card color-assessment"><div class="eyebrow">照片里的颜色有多接近</div><h3>颜色相似度</h3><div class="big-score">${visual?.score??'—'}<small>${Number.isFinite(visual?.score)?'/100':''}</small></div><p>${esc(visual?.summary||'未提供图片，本次不推断图像颜色。')}</p><p class="scope-note">只比较唇部与对应标准图的颜色；不能证明无滤镜、真伪或人人适配。色差 0 对应 100，色差 30 及以上对应 0。</p></section>
  </div>
  ${hasImage&&textReport?`<section class="cross-modal-notes"><h3>图文有没有说同一件事？</h3><p>只核对能从画面粗略比较的冷暖、浓淡与多图表现，不证明光源、滤镜或作者真实性。</p><ul>${crossModal.notes.map(n=>`<li>${esc(n)}</li>`).join('')||'<li>这段文案没有足够可直接对照画面的颜色或浓淡描述，暂不判断图文一致性。</li>'}</ul></section>`:''}
  ${hasImage?`<details class="tech-details upload-diagnostics"><summary>查看上传图片的自动选区与颜色依据</summary><section class="deep-explain-card"><div class="section-head"><div><h2>逐张查看自动选区和颜色差异</h2></div><p>全部原图已检查，${p.colorReference?.samples?.length||0} 张通过筛选；旧红色筛选统计不参与评分。</p></div><div class="image-evidence-list">${imageDetailsHtml}</div><p class="scope-note">${Number.isFinite(corpusColor)?'与已筛选样本中最相近的最多 7 张图比较，颜色相似度约 '+corpusColor+'/100；这只回答与近邻照片像不像，筛选后的分布不能代表所有网络内容。':'没有足够可靠选区或可比样本，未计算样本近邻颜色相似度。'}</p></section></details>`:''}
  <section class="evidence-stage"><div class="eyebrow">03 · 对照同产品的真实反馈</div><h2>好评和不同体验都保留</h2><p>优先核对文案的承诺，不能用一条个人评价判定另一条是假话。</p>${counterEvidenceHtml(textReport)}</section>
  ${p.key==='lancome-274'?variant274Html(evidenceEntry,rawText):''}
  <section class="claim-evidence-panel"><div class="section-head"><div><h2>关于肤色和唇色，评价一致吗？</h2></div><p>模糊或不对应当前产品的内容不计为支持。274 未确认版本时，只展示明确标注的家族级意见。</p></div>${claimEvidenceHtml(dbDetail.claims)}</section>
  <section class="personal-relevance-card"><div class="section-head"><div><div class="eyebrow">04 · 再看哪些证据更接近你</div><h2>${profile?'这条内容说明了和你相近的条件吗？':'填上条件后，再比较哪些体验更接近你'}</h2></div><div class="profile-chips">${renderProfileChips(profile)}</div></div><p>${personal.matched.length?'本人自述中已对应：'+esc(personal.matched.join('、'))+'。':''}${personal.missing.length?'原文未明确说明：'+esc(personal.missing.join('、'))+'，不会算作已经匹配。':''}</p></section>
  <section class="panel report-section"><div class="section-head"><div><h2>最值得先看的 3 张真实参考</h2></div><p>先排除不可靠图片，再综合图片质量和已确认的标签匹配。缺少标签的图片会说明原因，未确认版本不被默认成某一版。</p></div><div class="top-media">${mediaHtml}</div></section>
  <section class="matched-reviews-block"><div class="section-head"><div><h2>再看具体的使用体验</h2></div><p>${profile?'当前比较条件：'+esc(profileSummary(profile)):'尚未填写个人条件，按评价信息量展示。'}</p></div>${reviewHtml}</section>
  <details class="tech-details"><summary>查看样本范围与筛选记录</summary>${sampleUsageHtml(p)}<ul>${dbDetail.items.map(x=>'<li>'+esc(x)+'</li>').join('')}</ul><p>当前覆盖 4 个色号，未完成独立人工盲评；规则分不是校准后的可信概率。</p></details>
  <section class="forensic-actions"><div class="eyebrow">05 · 下一步建议</div><h2>根据已完成的检查，先做什么？</h2><ul>${coordinated.actions.map(a=>`<li>${esc(a.text)}</li>`).join('')}</ul><p class="scope-note">Evidence / Trust Agent 负责汇总专项模块与待核验项；当前是可复现的规则编排，不是四个独立大模型投票。</p></section>
  <section class="seed-cta"><div><h2>继续对照这个色号的证据</h2><p>先看平台差异、产品版本和真实使用反馈，再决定参考哪些内容。</p></div><a class="primary-btn" href="#/shade/${p.key}">看完整证据报告</a></section>
  <details class="auxiliary-entry"><summary>辅助体验：在自拍上预览颜色方向</summary><p>视觉预览不参与上面的判断，不是精准 AR 试色。</p><button class="secondary-btn" id="seed-to-selfie">打开自拍颜色预览</button></details>
 </section>`;
 bindGenerationChecks($('#seed-result'),forensicFiles);
 $('#seed-to-selfie').onclick=()=>{if(!getUserProfile()){go('/');toastMsg('先填写你的使用条件');return}go('/selfie?p='+p.key)};
 $('#seed-result').querySelectorAll('[data-show-roi]').forEach(button=>{let showing=false;button.onclick=()=>{showing=!showing;button.closest('.image-evidence-detail').querySelector('img').src=showing?analyses[Number(button.dataset.showRoi)].views.roi:analyses[Number(button.dataset.showRoi)].views.original;button.textContent=showing?'查看原图':'查看自动选区'}});
}

async function runConsumerJourney(){
 if(!selfieFile||!purchaseTargetKey)return;
 const result=$('#consumer-analysis'),run=$('#consumer-run'),key=purchaseTargetKey;
 const profile=getUserProfile();if(!profile){go('/');return;}
 run.disabled=true;run.textContent='正在分析…';
 result.innerHTML=`<section class="consumer-progress"><div class="eyebrow">正在整理最值得你看的内容</div><h2>先判断网上什么值得信，再找什么最像你。</h2><div class="human-progress">
  <div class="hp active">读取这个色号的真实试色与评价</div><div class="hp">比较不同平台与不同拍摄条件</div><div class="hp">先排除不稳定、信息量低的内容</div><div class="hp">寻找与你条件更接近的评论与试色</div><div class="hp">整理成你能直接使用的购买参考</div>
 </div><div class="progress"><i id="consumer-progress-bar"></i></div></section>`;
 result.scrollIntoView({behavior:'smooth',block:'start'});
 try{
   const p=await getPreviewProduct(key,$('#consumer-variant')?.value),steps=$$('.hp'),bar=$('#consumer-progress-bar');
   steps[0].classList.add('done');steps[1].classList.add('active');bar.style.width='22%';await wait(180);
   selfieResult=await createVirtualTryOn(selfieFile,p,false);
   steps[1].classList.add('done');steps[2].classList.add('active');bar.style.width='48%';await wait(180);
   const reviews=personalizedReviews(p,profile),media=personalizedMedia(p,selfieResult);
   steps[2].classList.add('done');steps[3].classList.add('active');bar.style.width='72%';await wait(180);
   const match=personalMatchScore(p,selfieResult,profile,reviews),expected=expectedAppearance(p,selfieResult);
   steps[3].classList.add('done');steps[4].classList.add('active');bar.style.width='90%';
   const [cloudNarrative,cloudMedia]=await Promise.all([
     callCloudAgent(p,profile,selfieResult,reviews,match),
     fetchCloudReferenceMedia(p.key,p.selectedPreviewVariant)
   ]);
   await wait(80);
   steps[4].classList.add('done');bar.style.width='100%';
   const stableCloud=cloudNarrative?{...cloudNarrative,reference_media:cloudMedia}:{reference_media:cloudMedia};
   renderConsumerResult(p,profile,reviews,media,match,expected,stableCloud);
 }catch(e){
   result.innerHTML=`<section class="sku-warning"><b>这次没有稳定完成自拍分析。</b><br>${esc(e.message)}<br>建议换一张自然光、正脸、嘴唇无遮挡的照片再试。</section>`;
 }finally{run.disabled=false;run.textContent='重新分析'}
}

function cloudArray(v){return Array.isArray(v)?v.filter(Boolean):[]}
function cloudText(x){if(typeof x==='string')return x;if(!x||typeof x!=='object')return '';const a=x.finding||x.title||x.label||x.type||'',b=x.explanation||x.reason||x.note||x.text||x.suggestion||x.why||'';return [a,b].filter(Boolean).join(a&&b?'：':'')}
function cloudEvidenceLabel(v){const s=String(v||'').toLowerCase();return s==='high'||s==='高'?'高':s==='medium'||s==='中'?'中':s==='low'||s==='低'?'低':(v||'—')}
function cloudMediaHtml(cloudNarrative,localMedia){
 const remote=cloudArray(cloudNarrative&&cloudNarrative.reference_media).filter(m=>m&&m.url);
 if(remote.length)return remote.slice(0,3).map((m,i)=>{
  const platform=esc(m.platform||'真实来源'),label=esc(m.label||'真实试色参考'),reason=esc(m.reason||'来自已筛选真实样本，用于辅助判断不同环境下的综合查看色调。'),sku=m.sku?'<small>'+esc(m.sku)+'</small>':'';
  return '<article class="matched-media real-reference"><div class="real-media-frame"><img src="'+esc(m.url)+'" alt="'+platform+'试色参考 '+(i+1)+'" loading="lazy"><span class="media-source-badge">'+platform+' · 已筛选样本</span></div><div class="media-card-copy"><div class="media-rank-line"><b>0'+(i+1)+'</b><span>'+label+'</span></div><p>'+reason+'</p>'+sku+recommendationCopy(m)+'</div></article>';
 }).join('');
 if(localMedia&&localMedia.length)return localMedia.slice(0,3).map((m,i)=>{
  const pic=m.thumb?'<img src="'+esc(m.thumb)+'" alt="试色参考 '+(i+1)+'" loading="lazy">':'<div class="media-placeholder"><span>图片暂不可显示<br><small>该条证据仍参与分析</small></span></div>';
  return '<article class="matched-media">'+pic+'<div class="media-card-copy"><div class="media-rank-line"><b>0'+(i+1)+'</b><span>'+esc(m.platform||'真实来源')+'</span></div><p>'+esc((m.reasons||[])[0]||'在可信度与当前使用条件之间综合查看排序。')+'</p>'+recommendationCopy(m)+'</div></article>';
 }).join('');
 return '<div class="empty">当前没有可稳定展示的真实试色图片。</div>';
}

function consumerPlatformSummary(a){
 const d=a.platformDiff||{},h=Math.abs(Number(d.hue)||0),s=Math.abs(Number(d.saturation)||0),b=Math.abs(Number(d.brightness)||0);
 const xhs=a.platform?.['小红书'],tb=a.platform?.['淘宝'];
 const tone=h<5?'综合查看色相基本一致':h<12?'色相有轻微差别':'色相差别比较明显';
 let bright='明暗差异不大';
 if(xhs&&tb&&b>=4)bright=xhs.brightness<tb.brightness?'小红书样本整体比淘宝偏暗一些':'小红书样本整体比淘宝偏亮一些';
 return tone+'；'+bright+'。因此更建议把两边的自然光/无滤镜内容放在一起看，而不是只相信单个平台的一张图。';
}
function consumerRiskItems(p){
 const a=p.analysis||{},kw=a.keywordCounts||{},out=[];
 const dark=(a.findings||[]).find(f=>/偏暗/.test(f.type));
 if(dark)out.push('有 '+(dark.count||'部分')+' 份样本明显偏暗，这类图片不适合单独作为颜色依据。');
 if((a.consumerDifferenceMentions||0)>0)out.push('有 '+a.consumerDifferenceMentions+' 条反馈明确提到偏色、色差或“和图片不一样”，说明购买前需要交叉看多条内容。');
 const texture=['拔干','沾杯'].filter(k=>kw[k]).sort((x,y)=>kw[y]-kw[x]);
 if(texture.length)out.push('使用体验里较常被提到的是'+texture.map(k=>k+'（'+kw[k]+'）').join('、')+'，这是质地体验风险，不等于颜色造假。');
 if(!out.length)out.push('目前没有强烈的视觉异常信号，但单张种草图仍不足以代表所有人的上唇效果。');
 return out.slice(0,3);
}
function consumerNormalItems(p){
 const kw=p.analysis?.keywordCounts||{},out=[];
 if(kw['深唇']||kw['浅唇'])out.push('原生唇色不同，同一支口红上嘴会有明显深浅差异。');
 if(kw['薄涂']||kw['厚涂'])out.push('薄涂和厚涂会改变浓淡、覆盖力和红/棕感。');
 if(kw['氧化'])out.push('部分消费者提到成膜或氧化后会变深/变色，刚上嘴和过一会儿不一定一样。');
 if(kw['自然光']||kw['滤镜']||kw['无滤镜'])out.push('自然光、室内灯和滤镜会改变照片观感，光线差异应先于“P图”判断。');
 return out.length?out:['同一个色号在不同唇色、光线和涂法下出现差异，本身并不等于内容失真。'];
}
function stableConsumerDecision(p,profile,match){
 const a=p.analysis||{},score=Math.round(a.score||0),risk=consumerRiskItems(p)[0]||'单张种草图不足以代表所有人的上唇效果。';
 const fit=match>=84?'你的当前条件和现有参考比较接近':match>=72?'有一定参考价值，但建议多看几种光线和涂法':'与你当前条件真正接近的参考还不算多';
 let lead=score>=80?'这支可以继续看，现有网络内容整体有参考价值。':score>=65?'这支可以参考，但别只看一条种草或一张试色图。':'这支建议谨慎参考，先把不同来源放在一起比较。';
 let action='优先看和你原生唇色、肤色表现与日常妆面更接近的真实反馈。';
 if(profile.makeup==='素颜')action='你平时更常素颜，优先看素颜、自然光和较薄涂的真实反馈。';
 if(profile.makeup==='淡妆')action='你平时更常淡妆，优先看日常妆、自然光和常规涂法的真实反馈。';
 if(profile.makeup==='浓妆')action='你平时更常浓妆，可以多看完整妆面与较高覆盖度的真实反馈。';
 return {lead,detail:fit+'。'+risk,action};
}
function cleanAgentCopy(s,max=150){
 let x=String(s||'').replace(/(?:TrueTone|试色有谱)\s*Score\s*\d+/gi,'').replace(/Match\s*Score\s*\d+/gi,'').replace(/[（(]\s*[，,;；:\s]*[）)]/g,'').replace(/\s+/g,' ').trim();
 return x.length>max?x.slice(0,max).replace(/[，,;；。]\s*$/,'')+'。':x;
}

function renderConsumerResult(p,profile,reviews,media,match,expected,cloudNarrative=null){
 const colorCopy=personalColorCopy(p.personalColor);const a=p.analysis,trust=Math.round(a.score),evidenceLevel=cloudEvidenceLabel(a.evidenceSufficiency),trustLabel=trust>=80?'整体较值得参考':trust>=65?'可以参考，但要注意内容差异':'建议谨慎参考，不依赖单一内容';
 const fitLabel=match>=84?'与你当前条件的参考匹配度较高':match>=72?'有一定参考价值，但个体差异仍明显':'与你当前条件相近的证据还不够充分';
 const normalItems=consumerNormalItems(p),riskItems=consumerRiskItems(p),platformSummary=consumerPlatformSummary(a),stableDecision=stableConsumerDecision(p,profile,match);
 const mediaHtml=cloudMediaHtml(cloudNarrative,media);
 const reviewsHtml=reviews.length?reviews.map((r,i)=>`<article class="matched-review"><div class="match-rank">0${i+1}</div><div><div class="review-source">${r.platform} · ${r.type||'评论'}${r.repeatBuyer?' · 复购/已购高信息量线索':''}</div><p>“${highlight(r.text)}”</p><small>匹配原因：${profile.lip!=='不确定'&&r.text.includes(profile.lip)?'与你主动填写的唇色情况一致；':''}${r.negativeEvidence?'包含具体负向/差异体验，信息量高；':''}与你填写的使用条件相关。</small></div></article>`).join(''):'<div class="empty">当前没有足够的可匹配原文评论。</div>';
 $('#consumer-analysis').innerHTML=`
 <section class="personal-result">
   <div class="result-title"><div><div class="eyebrow">你的试色有谱购买参考</div><h2>${esc(p.brand)} #${p.shade} · ${esc(p.name)}</h2><p>不是替你宣布“适合 / 不适合”，而是根据这张自拍的拍摄情况和可信消费者证据告诉你：这个方向对你有多大参考价值。</p></div><button class="ghost-btn" id="back-to-form">重新选择</button></div>
   ${cloudNarrative?.runtime==="aliyun-model-studio"?`<div class="cloud-connected-badge"><span>本次分析</span><b>✓ 已完成多来源交叉分析</b></div>`:``}
   <div class="personal-hero-grid">
    <div class="tryon-card"><div class="tryon-image"><img id="consumer-result-photo" src="${selfieResult.tryon}"><div class="toggle result-toggle"><button class="active" data-view="tryon">颜色预览</button><button data-view="original">原自拍</button></div></div><div class="tryon-caption"><div class="preview-color-row">${previewSwatch(p,'preview-swatch')}<div><b>#${p.shade} · ${esc(p.name)}</b><p class="finish-label">${esc(p.finish.label)} · ${expected.tone}</p><p class="personal-color-headline">${esc(colorCopy.headline)}</p><p class="personal-color-copy">${esc(colorCopy.detail)}</p><p class="personal-color-method">${esc(colorCopy.method)}</p><p>${esc(p.finish.note)}</p></div></div>${colorSourceDetails(p.personalColor)}${generalReferenceDetails(p.personalColor)}<small>颜色预览是视觉模拟，不是品牌官方色卡或精准 AR 试色；实物仍会受原生唇色、光线与涂抹厚度影响。</small></div></div>
    <div class="decision-card">
      <div class="decision-block"><span>网上关于这个色号，可信吗？</span><div class="big-score">${trust}<small>/100</small></div><b>${trustLabel}</b><p>${a.counts.visual} 份视觉素材 + ${fmt(a.counts.text)} 条文字证据；可参考信息：${evidenceLevel==='高'?'比较充足':evidenceLevel==='中'?'基本够用':'还不够多'}。</p></div>
      <div class="decision-block accent"><span>和你当前情况，匹配吗？</span><div class="big-score">${match}<small>% MATCH</small></div><b>${fitLabel}</b><p>结合这张自拍的拍摄情况光照、你主动选择的“${profile.lip} / ${profile.makeup} / ${profile.goal}”以及可信内容匹配。</p></div>
    </div>
   </div>

   <section class="agent-narrative"><div class="eyebrow">给你的购买参考</div><h3>${esc(stableDecision.lead)}</h3><p>${esc(stableDecision.detail)}</p><small>${esc(stableDecision.action)}</small></section>
   <section class="consumer-section"><div class="section-head"><div><div class="eyebrow">先看这些</div><h2>最值得你参考的 3 张试色</h2></div><p>先通过内容可信度筛选，再按与你这张自拍的拍摄情况光照和使用情况的接近程度重新排序。</p></div><div class="matched-media-grid">${mediaHtml}</div></section>

   <section class="consumer-section"><div class="section-head"><div><div class="eyebrow">她们怎么说</div><h2>和你更相关的 3 条消费者反馈</h2></div><p>我们会优先展示写清楚使用条件、复购体验或具体缺点的反馈；单纯夸“好看”不会自动排在前面。</p></div><div class="matched-review-list">${reviewsHtml}</div></section>

   <section class="consumer-section trust-explain"><div class="section-head"><div><div class="eyebrow">为什么我们相信 / 不完全相信这些内容</div><h2>这些内容为什么值得看</h2></div></div>
    <div class="trust-grid">
      <div class="panel trust-story-card platform-card"><h3>不同平台看起来一样吗？</h3><p>${esc(platformSummary)}</p></div>
      <div class="panel trust-story-card risk-card"><h3>购买前最值得注意</h3><ul class="consumer-bullets">${riskItems.slice(0,4).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>
      <div class="panel trust-story-card"><h3>这些差异不一定是修图</h3><ul class="consumer-bullets">${(normalItems.length?normalItems:['当前证据不足以细分更多正常变化。']).slice(0,4).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>
      <div class="panel"><h3>同色号也可能有版本差异</h3><p>${p.skuLines?.length>1?`当前样本里同一色号出现 ${p.skuLines.length} 个产品线 / 包装或版本标签。试色有谱会分开看，避免把版本差异误当成“修图”。`:'当前样本里没有明显的同色号版本混淆。'}</p></div>
    </div>
    <details class="tech-details"><summary>想看更详细的分析依据？</summary><div class="details-grid"><div class="panel"><h3>这张自拍的拍摄情况</h3><p>光照：${selfieResult.light.label}<br>画面明暗：${selfieResult.light.brightness}%<br>当前照片可见面部颜色：${selfieResult.faceRef.hex} · ${selfieResult.faceRef.tone}</p></div><div class="panel"><h3>网络样本的综合查看色调</h3><p>本次从 ${p.personalColor.usedCount} 张试色图的唇部提取。<br>参考值：H ${p.personalColor.color.hue.toFixed(1)}° · S ${p.personalColor.color.saturation.toFixed(1)}% · B ${p.personalColor.color.brightness.toFixed(1)}%</p></div></div></details>
   </section>

   <section class="purchase-loop"><div><div class="eyebrow">最后一步</div><h2>你喜欢这个方向吗？</h2><p>喜欢就继续看相似色号 / 不同质地；不喜欢就告诉我们想往哪个方向调整。</p></div><div class="purchase-actions"><button class="primary-btn" id="result-like">喜欢，看看相似色</button><button class="secondary-btn" id="result-warmer">想更橘一点</button><button class="secondary-btn" id="result-brighter">想更清透一点</button><a class="ghost-btn" href="#/compare">我在纠结两个色号</a></div></section>
 </section>`;
 $$('.result-toggle button').forEach(b=>b.onclick=()=>{$$('.result-toggle button').forEach(x=>x.classList.remove('active'));b.classList.add('active');$('#consumer-result-photo').src=b.dataset.view==='tryon'?selfieResult.tryon:selfieResult.original});
 $('#back-to-form').onclick=()=>window.scrollTo({top:0,behavior:'smooth'});
 $('#result-like').onclick=()=>recommend(p,false);$('#result-warmer').onclick=()=>recommend(p,true);$('#result-brighter').onclick=()=>recommend(p,false);
}

function quick(q){q=(q||'').toLowerCase().replace('#','').trim();const p=manifest.products.find(x=>x.shade===q||x.brand.toLowerCase().includes(q)||x.name.toLowerCase().includes(q));p?go('/shade/'+p.key):go('/search')}

async function search(){
 await getManifest();page(`<div class="route-head"><a class="backlink" href="#/">← 首页</a><div class="eyebrow" style="margin-top:22px">搜索已有色号</div><h1>先找一个你正在纠结的颜色</h1><p>当前深入覆盖 YSL 610 / 1936、兰蔻 274 / 275。先看真实证据，再比较与你的条件；不支持的色号不生成报告。</p></div><div class="searchbox" style="max-width:720px"><span class="search-icon">⌕</span><input id="catalog-q" placeholder="YSL / Lancôme / 610 / 274…"></div><div class="shade-grid" id="catalog" style="margin-top:18px">${manifest.products.map(shadeCard).join('')}</div>`);
 $('#catalog-q').oninput=e=>{$('#catalog').innerHTML=manifest.products.filter(p=>(p.brand+p.name+p.product+p.shade).toLowerCase().includes(e.target.value.toLowerCase())).map(shadeCard).join('')||'<div class="empty">当前 Demo 数据库里暂时没有这个色号。</div>'}
}

async function shade(k){
 const m=meta(k);
 if(!m)return home();
 page(`<div class="route-head"><a class="backlink" href="#/search">← 返回色号库</a><div class="eyebrow" style="margin-top:22px">${esc(m.brand)} · ${esc(m.product)}</div><h1>#${m.shade} ${esc(m.name)}</h1><p>先别急着看分数。试色有谱会把不同平台的试色、评价和使用体验放在一起，告诉你哪些更值得参考、哪些要谨慎看。</p></div>
 <section class="analysis-start">
  <div class="panel analysis-intro">
   <div class="eyebrow">我们会看这些内容</div>
   <h2>先看真实内容，再告诉你结论。</h2>
   <div class="source-counts"><span><b>${m.analysis.counts.visual}</b> 份视觉素材</span><span><b>${fmt(m.analysis.counts.text)}</b> 条文字证据</span><span><b>${m.analysis.counts.sources}</b> 类来源</span><span><b>${m.analysis.counts.skus}</b> 个同色号版本</span></div>
   ${m.skuLines?.length>1?`<div class="sku-warning">同一色号包含多个 版本 / 产品线：${m.skuLines.map(esc).join('、')}。系统会保留这些边界，避免把产品差异误判成内容失真。</div>`:''}
   <div class="plain-note" style="margin-top:14px">好评不等于更可信。我们会更看重具体使用条件、负向体验和不同来源之间是否互相印证。</div>
  </div>
  <div class="panel">
   <div class="eyebrow">正在怎么判断</div>
   <div class="agent-steps" id="product-agent-steps">
    <div class="agent-step" data-a="1">颜色与拍摄环境</div>
    <div class="agent-step" data-a="2">版本与来源是否可比较</div>
    <div class="agent-step" data-a="3">挑出最值得先看的内容</div>
    <div class="agent-step" data-a="4">怎样让试色更容易比较</div>
   </div>
   <button class="primary-btn" id="start-product-analysis" style="width:100%;margin-top:16px">开始分析</button>
   <div class="progress" style="margin-top:12px"><i id="product-progress"></i></div>
  </div>
 </section>`);
 $('#start-product-analysis').onclick=async()=>{
   const btn=$('#start-product-analysis'),steps=$$('#product-agent-steps .agent-step'),bar=$('#product-progress');
   btn.disabled=true;btn.textContent='正在读取证据集…';
   try{
     await getProduct(k);
     const labels=['正在读取已筛选的唇部颜色…','正在核对版本与来源…','正在按当前条件整理图片和评价…','正在整理证据报告…'];
     for(let i=0;i<steps.length;i++){
       steps.forEach((s,j)=>{if(j<i)s.className='agent-step done';else if(j===i)s.className='agent-step active';else s.className='agent-step'});
       btn.textContent=labels[i];bar.style.width=((i+1)/steps.length*100)+'%';await wait(i===0?360:260);
     }
     steps.forEach(s=>s.className='agent-step done');
     await shadeReport(k);
   }catch(e){
     btn.disabled=false;btn.textContent='重新尝试';
     toastMsg('数据读取失败：'+e.message);
   }
 }
}

function shade274FamilyAnalysisHtml(evidenceEntry,distEntry){
 const vm=evidenceEntry?.variant_model,claims=evidenceEntry?.claims||{},vars=distEntry?.variants||{};
 if(!vm)return '';
 const variantCards=vm.taobao_variants.map(v=>{
   const d=vars[v.id];
   if(!d)return '';
   const med=`色彩中位：浓淡 ${d.saturation.median}% · 明暗 ${d.brightness.median}%`;
   const light=Object.entries(d.lighting_counts||{}).sort((a,b)=>b[1]-a[1])[0];
   return `<article class="variant-card">
     <div class="variant-name">${esc(v.label)}</div>
     <p>${esc(med)}</p>
     <small>${d.n} 张可解析图片${light?' · 常见拍摄判断：'+esc(light[0]):''}</small>
   </article>`;
 }).join('');
 const x=vm.xiaohongshu;
 const claimKeys=['yellow_skin','deep_lip','bare_face'];
 const claimBlocks=claimKeys.filter(k=>claims[k]).map(k=>{
   const z=claims[k],total=(z.support_count||0)+(z.oppose_count||0);
   const support=(z.support_examples||[])[0],oppose=(z.oppose_examples||[])[0];
   return `<article class="family-claim">
     <div class="claim-head"><b>${esc(z.label)}</b><span>${total} 条可明确判断：${z.support_count||0} 支持 · ${z.oppose_count||0} 相悖</span></div>
     <div class="quote-grid">
      ${support?`<blockquote class="evidence-quote support"><b>支持 · ${esc(support.platform)}</b><span>${esc(support.text)}</span></blockquote>`:''}
      ${oppose?`<blockquote class="evidence-quote oppose"><b>相悖 · ${esc(oppose.platform)}</b><span>${esc(oppose.text)}</span></blockquote>`:''}
     </div>
   </article>`;
 }).join('');
 return `
 <section class="variant-insight-card family-overview">
   <div class="eyebrow">274 不应被当成一个完全统一的产品</div>
   <h2>同一个“274”，至少包含 3 个明确版本；小红书还混有版本不明和旧款内容。</h2>
   <p>淘宝数据可以明确拆成 3 个产品版本，因此试色有谱会在版本内做颜色与评价比较。小红书没有统一版本字段，所以不会被强行映射到其中某一个版本。</p>
   <div class="variant-card-grid">${variantCards}</div>
   <div class="family-policy">
    <b>小红书怎么处理？</b>
    <p>${x.main_posts} 篇 274 主帖中，${x.explicit_lipglaze_or_mirror_posts} 篇明确提到唇釉/镜面，${x.explicit_xiaomanyao_posts} 篇提到“小蛮腰”，另有 ${x.no_clear_variant_posts} 篇无法确定版本。版本不明内容只作为“274 家族级证据”，不会参与某一个淘宝版本的精确色彩结论。</p>
   </div>
 </section>

 <section class="claim-evidence-panel">
   <div class="section-head"><div><div class="eyebrow">为什么网上对 274 的评价容易互相打架？</div><h2>把支持意见和相悖意见拆开看</h2></div><p>这里不是把所有 274 混成一个平均结论，而是先承认版本、唇色和妆面都会改变评价。</p></div>
   ${claimBlocks}
   <div class="plain-note"><b>一个真实的版本混淆案例：</b>${esc(vm.cross_variant_example.text)}</div>
 </section>`;
}
async function shadeReport(k,variant=defaultPreviewVariant(k)){
 const p=await getPreviewProduct(k,variant),variantScores=p.media.map(m=>m.referenceScore).filter(Number.isFinite).sort((x,y)=>x-y),a={...p.analysis,score:variantScores.length?variantScores[Math.floor(variantScores.length/2)]:null},c={...buildProductConsumerSummary(p),reviews:personalizedReviews(p,getUserProfile())},top=rankReferenceMedia(p.media||[],getUserProfile()).slice(0,3),sku=p.skuLines||[];
 const [cloudTop,evCatalog,distCatalog]=await Promise.all([
   fetchCloudReferenceMedia(k,p.selectedPreviewVariant),
   getEvidenceCatalog(),
   getReferenceDistributions()
 ]);
 const evidenceEntry=evCatalog?.products?.[k]||null;
 const distEntry=distCatalog?.products?.[k]||null;
 const is274=k==='lancome-274',brandPlan=buildBrandActionPlan(p);

 const familyNotice=is274
  ? `<div class="sku-warning"><b>274 家族提醒：</b>淘宝样本能明确拆分 Cream / Cream Gift / Intimatte 三个版本，但小红书存在版本不明与旧款 274。下面的分析会把“版本内证据”和“274 家族级证据”分开，不再把所有 274 混成一个统一平均值。</div>`
  : (sku.length>1?`<div class="sku-warning">版本提醒：当前样本同一色号包含 <b>${sku.length}</b> 个版本 / 产品线：${sku.map(esc).join('、')}。这些版本会分开比较，避免把产品本身差异误判成修图。</div>`:'');

 const colorSection=is274&&distEntry?.variants
  ? `${colorDirectionHtml(p,true)}<section class="panel report-section">
      <div class="section-head"><div><div class="eyebrow">综合色调不能只看一个平均值</div><h2 style="font-size:28px">三个版本分别是什么方向？</h2></div><p>以下是各版本真实图片的分布中位数，用来比较版本之间的细微差异。</p></div>
      <div class="variant-card-grid">
       ${[
         ['cream','黑管哑光 #274 奶茶裸'],
         ['cream_gift','「声色」限定 #274 原声裸茶'],
         ['intimatte','粉金管唇膏 #274']
       ].map(([id,label])=>{
         const d=distEntry.variants[id];if(!d)return '';
         return `<article class="variant-card"><div class="variant-name">${esc(label)}</div><p>浓淡中位 ${d.saturation.median}% · 明暗中位 ${d.brightness.median}%</p><small>${d.n} 张可解析图片 · 色彩中心约 ${d.hue.circular_center.toFixed(1)}°</small></article>`;
       }).join('')}
      </div>
      <div class="plain-note">这三个版本的综合色调接近，但浓淡、明暗和质地来源并不完全相同，因此试色有谱不再用一个综合色块代表全部“274”。</div>
     </section>`
  : `<section class="details-grid">${colorDirectionHtml(p)}<div class="panel"><h3>01 · 同一支口红，两个平台看起来差多少？</h3>${metric('颜色方向差异',a.platformDiff.hue,90,'°')}${metric('浓淡差异',Math.abs(a.platformDiff.saturation),35,'%')}${metric('明暗差异',Math.abs(a.platformDiff.brightness),35,'%')}<div class="plain-note">详细数值已收进分析依据，主页面只保留消费者能直接理解的差异。</div></div></section>`;

 page(`<div class="route-head"><a class="backlink" href="#/search">← 返回色号库</a><div class="eyebrow" style="margin-top:22px">${esc(p.brand)} · ${esc(p.product)}</div><h1>#${p.shade} ${esc(p.name)}</h1><p>${is274?'这页按“274 色号家族”来读：先区分版本，再看家族层面的消费者争议。':'先给你能直接使用的结论，再告诉你为什么。下面的结果来自当前已收录的真实试色与评价。'}</p>${familyNotice}</div>

 <section class="report-hero">
  <div class="panel">
   <div class="eyebrow">${is274?'274 家族结论':'一句话结论'}</div>
   <div class="conclusion">${is274?'网络上的“兰蔻 274”并不是完全同一个产品语境。版本混淆本身会放大色差与适配评价的矛盾，因此要先确认版本，再看“适不适合我”。':esc(c.conclusion)}</div>
   <div class="source-counts"><span><b>${a.counts.visual}</b> 份视觉素材</span><span><b>${fmt(a.counts.text)}</b> 条文字证据</span><span><b>${a.counts.sources}</b> 类来源</span></div>
   <div class="filter-row" style="margin-top:18px"><span style="font-size:11px;color:var(--muted);align-self:center">更像你的情况：</span><button class="filter-btn active" data-prof="all">全部</button><button class="filter-btn" data-prof="深唇">深唇</button><button class="filter-btn" data-prof="浅唇">浅唇</button><button class="filter-btn" data-prof="素颜">素颜</button></div>
  </div>
  <div class="panel score-panel"><div class="score-ring" style="--score:${a.score};--ring:${a.score>=80?'#82b996':a.score>=60?'#e2b16b':'#d46d60'}"><b>${a.score??'—'}</b></div><div class="score-label"><strong>${is274?'当前所选版本的颜色相似度中位数':'图像颜色相似度中位数'}</strong>已通过筛选的照片与对应标准图有多接近；不评价文字，不代表真人适配、真实性或整个色号的可信度。<div class="disclaimer">${p.media.length} 张当前范围内的已筛选图片；筛选后的相似度分布不能用来评价所有网络内容。</div></div></div>
 </section>

 ${is274?shade274FamilyAnalysisHtml(evidenceEntry,distEntry):''}

 <section class="panel report-section" id="top-ref"><div class="section-head"><div><div class="eyebrow">真实参考</div><h2 style="font-size:28px">你最值得先看的 3 张</h2></div><p>02 · 在已筛选的图片中，综合质量与已确认的个人条件排序。标签不足不会算作完全匹配。</p></div><div class="top-media" id="top-media">${cloudTop.length?cloudTop.map(cloudReferenceCard).join(''):top.map(mediaCard).join('')}</div></section>

 <section class="details-grid">
  <div class="panel"><h3>${is274?'274 家族里大家最常提到什么':'大家最常提到什么'}</h3><div class="keyword-cloud">${Object.entries(a.keywordCounts).sort((x,y)=>y[1]-x[1]).slice(0,18).map(([x,n])=>`<span class="kw">${x} <b>${n}</b></span>`).join('')}</div><div class="plain-note" style="margin-top:15px">${a.consumerDifferenceMentions} 条文本提到偏色、色差或“和图片不一样”等线索。${is274?' 对 274 来说，其中一部分矛盾可能来自版本混用，因此不能直接解释成修图或产品不稳定。':' '}复购或回头客 ${a.reviewQuality.repeatBuyer} 条；负向体验 ${a.reviewQuality.negativeEvidence} 条；信息量很低的泛评 ${a.reviewQuality.genericTemplate} 条会降低权重。</div></div>
  <div class="panel"><h3>03 · 更接近你的具体使用反馈</h3><div class="review-list" id="reviews">${c.reviews.slice(0,7).map(reviewCard).join('')}</div></div>
 </section>

 ${colorSection}

 <section class="details-grid">
  <div class="panel"><h3>${is274?'为什么 274 需要分版本看？':'颜色相似度该怎么理解？'}</h3>
   ${is274
    ? `<div class="plain-note">因为这个色号的风险不是单一的“图片异常”，还包括版本归属不清、旧款与新款混杂、回答者引用另一个 274 产品等证据归属问题。试色有谱会把这些不确定性单独说明，而不是全部折算成“内容造假”。</div>`
    : ((a.findings||[]).length?(a.findings||[]).map(f=>`<div class="finding"><span class="severity ${f.severity}">${f.severity==='high'?'高风险':f.severity==='medium'?'中风险':'低风险'}</span><div><strong>${esc(f.type)}</strong><p>在 ${f.count||1} 张原始图里出现，已排除出颜色参考；这不是对内容真假的判断。</p></div></div>`).join(''):'<div class="plain-note">目前没有看到特别强的异常信号，但这仍不代表每一张图都能完全还原实物。</div>')}
  </div>
  <div class="panel"><h3>哪些差异属于正常变化？</h3><div class="review-list">${c.normal.map(x=>`<div class="review"><p>${esc(x)}</p></div>`).join('')||'<div class="plain-note">当前文本证据不足以细分更多正常变化。</div>'}</div></div>
 </section>


 <details class="auxiliary-entry shade-selfie-preview"><summary>辅助体验：看看自拍上的颜色方向</summary><p>颜色依据来自所选版本、条件相近的真实样本。视觉模拟不参与证据评分，不是精准 AR 试妆。</p><a class="secondary-btn" href="#/selfie?p=${p.key}${p.selectedPreviewVariant?'&v='+p.selectedPreviewVariant:''}">打开自拍颜色预览</a></details>
 <details class="tech-details"><summary>查看本色号的样本筛选记录</summary>${sampleUsageHtml(p)}</details>
 <details class="brand-action-panel tech-details"><summary>给品牌与内容团队：把证据变成素材改进清单</summary><p>根据当前色号证据提出待执行动作；不代表已部署、已完成实物实验或已提高转化。</p><div class="brand-actions">${brandPlan.actions.map(action=>`<article><h3>${esc(action.issue)}</h3><p><b>改什么：</b>${esc(action.action)}</p><p><b>怎样验证：</b>${esc(action.check)}</p></article>`).join('')}</div><button class="secondary-btn" id="download-brand-brief">下载本色号清单与证据 ID（JSON）</button></details>
 <details class="auxiliary-entry"><summary>辅助选择：相似方向与色号对比</summary>
 <section class="cta-band"><div><h3>喜欢这个方向吗？</h3><p>不喜欢也没关系，可以换成更橘、更浅或不同质地，再看相似色号。</p></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="secondary-btn" id="like">喜欢，看看相似色</button><button class="ghost-btn" id="warmer">想更橘一点</button><a class="ghost-btn" href="#/compare">我在纠结两个色号</a></div></section></details>`);

 $('#download-brand-brief').onclick=()=>downloadJson(brandPlan,'truetone-'+p.key+'-content-brief.json');
 const variantSelect=$('#shade-preview-variant');
 if(variantSelect)variantSelect.onchange=async()=>{const y=window.scrollY,value=variantSelect.value;variantSelect.disabled=true;try{await shadeReport(k,value);window.scrollTo(0,y)}catch(e){variantSelect.disabled=false;toastMsg(e.message)}};
 $$('.filter-btn[data-prof]').forEach(b=>b.onclick=()=>{
   $$('.filter-btn[data-prof]').forEach(x=>x.classList.remove('active'));
   b.classList.add('active');
   const prof=b.dataset.prof,field=prof==='素颜'?'makeup':'lip';
   const reviews=prof==='all'?personalizedReviews(p,getUserProfile()):(p.reviews||[]).filter(r=>r.authorTags?.[field]?.value===prof&&!r.genericTemplate&&r.product_scope==='target_context'&&r.variant_scope!=='cross_variant').sort((a,b)=>b.informationScore-a.informationScore);
   $('#reviews').innerHTML=reviews.slice(0,7).map(reviewCard).join('')||'<div class="plain-note">当前数据中没有足够匹配评论。</div>';
 });
 $$('.media-card[data-media]').forEach(x=>x.onclick=()=>openMedia(p,x.dataset.media));
 $$('.cloud-media-card[data-cloud-url]').forEach(x=>x.onclick=()=>{
   modalContent.innerHTML=`<div class="eyebrow">真实试色参考</div><h2 id="modal-title">试色参考图</h2><img src="${esc(x.dataset.cloudUrl)}" style="width:100%;max-height:640px;object-fit:contain;background:#090807;border-radius:14px"><p style="color:var(--muted);line-height:1.7">该图已通过自动唇部选区和对应标准色筛选，用于比较真实试色。显示尺寸可能是缩略图。</p>`;
   openModal();
 });
 $('#like').onclick=()=>recommend(p,false);
 $('#warmer').onclick=()=>recommend(p,true);
}

function downloadJson(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function recommend(p,warm){const candidates=manifest.products.filter(x=>x.key!==p.key).map(x=>({p:x,d:circularHueDistance(p.analysis.center.hue,x.analysis.center.hue)+(warm?(x.analysis.center.hue<p.analysis.center.hue?18:0):0)})).sort((a,b)=>a.d-b.d).slice(0,3);modalContent.innerHTML=`<div class="eyebrow">相似色号</div><h2 id="modal-title">${warm?'更偏暖 / 橘一点的方向':'相似色号'}</h2><p>这里只比较当前 Demo 已收录的色号，帮你快速看看有没有更接近你想要的方向。</p><div class="shade-grid">${candidates.map(x=>shadeCard(x.p)).join('')}</div>`;openModal()}
function openMedia(p,id){const m=p.media.find(x=>x.id===id);if(!m)return;modalContent.innerHTML=`<div class="eyebrow">${m.platform} · 这张图的参考价值</div><h2 id="modal-title">颜色相似度 ${Math.round(m.referenceScore||0)}/100</h2>${m.thumb?`<img src="${m.thumb}" style="width:100%;max-height:520px;object-fit:contain;background:#090807;border-radius:14px">`:''}<div class="details-grid" style="margin-top:15px"><div class="panel"><h3>图片观感</h3><p>颜色方向 ${m.metrics?.hue??'—'}°<br>浓淡 ${m.metrics?.saturation??'—'}%<br>明暗 ${m.metrics?.brightness??'—'}%<br>光照：${m.metrics?.lighting||'—'}</p></div><div class="panel"><h3>为什么值得看 / 为什么要谨慎</h3><p>${esc((m.reasons||[]).join('；')||'当前样本未记录额外说明')}</p></div></div>`;openModal()}

async function verify(){
 await getManifest();page(`<div class="route-head"><a class="backlink" href="#/">← 首页</a><div class="eyebrow" style="margin-top:22px">上传试色核验</div><h1>这张试色，值得你参考吗？</h1><p>图片只在当前浏览器中读取像素。可一次上传多张；多图会分别取色、对照标准图并按颜色相似度排序。</p></div><section class="upload-shell"><label class="dropzone" id="drop"><input id="verify-input" type="file" accept="image/png,image/jpeg,image/webp" multiple hidden><div><div class="upload-icon">＋</div><h3>拖进来，或点这里选择图片</h3><p>JPG / PNG / WEBP · 支持多张 · 可删除、追加</p></div></label><div class="file-previews" id="previews"></div><div class="form-row"><select class="select" id="source"><option>小红书</option><option>淘宝/电商</option><option>用户实拍</option><option>其他</option></select><select class="select" id="match-product"><option value="">不与已有色号比较</option>${opts('')}</select><button class="primary-btn" id="run-verify" disabled>开始分析</button></div><div class="progress"><i id="vprogress"></i></div><div class="agent-run hidden" id="agent-run"><div class="agent-steps"><div class="agent-step" data-a="1">颜色与光线</div><div class="agent-step" data-a="2">对照对应标准图</div><div class="agent-step" data-a="3">购买参考</div><div class="agent-step" data-a="4">内容透明度建议</div></div></div></section><div id="verify-results"></div>`);
 const input=$('#verify-input'),drop=$('#drop');drop.ondragover=e=>{e.preventDefault();drop.classList.add('drag')};drop.ondragleave=()=>drop.classList.remove('drag');drop.ondrop=e=>{e.preventDefault();drop.classList.remove('drag');addVerify([...e.dataTransfer.files])};input.onchange=()=>addVerify([...input.files]);$('#run-verify').onclick=runVerify
}
function addVerify(fs){verifyFiles.push(...fs.filter(f=>f.type.startsWith('image/')));renderVerifyPreviews()}
function renderVerifyPreviews(){const el=$('#previews');el.innerHTML=verifyFiles.map((f,i)=>`<div class="preview-card"><button class="remove-file" data-i="${i}">×</button><img src="${URL.createObjectURL(f)}" onload="window.URL.revokeObjectURL(this.src)"><div class="meta">${esc(f.name)}</div></div>`).join('');$$('.remove-file').forEach(b=>b.onclick=e=>{e.preventDefault();verifyFiles.splice(+b.dataset.i,1);renderVerifyPreviews()});$('#run-verify').disabled=!verifyFiles.length}
async function runVerify(){const btn=$('#run-verify');btn.disabled=true;verifyAnalyses=[];$('#agent-run').classList.remove('hidden');const steps=$$('.agent-step');steps.forEach(x=>x.className='agent-step');steps[0].classList.add('active');for(let i=0;i<verifyFiles.length;i++){verifyAnalyses.push(await analyzeEvidenceFile(verifyFiles[i]));$('#vprogress').style.width=((i+1)/verifyFiles.length*55)+'%'}steps[0].className='agent-step done';steps[1].className='agent-step active';let p=null;if($('#match-product').value)p=await getProduct($('#match-product').value);await wait(220);const report=runFourAgents(verifyAnalyses,p);steps[1].className='agent-step done';steps[2].className='agent-step active';await wait(180);steps[2].className='agent-step done';steps[3].className='agent-step active';await wait(150);steps[3].className='agent-step done';$('#vprogress').style.width='100%';renderVerifyResults(report);btn.disabled=false;btn.textContent='重新分析'}
function renderVerifyResults(r){const ranked=verifyAnalyses.map((x,i)=>({x,i,score:r.comparison.perImage[i]?.score})).filter(q=>Number.isFinite(q.score)).sort((a,b)=>b.score-a.score);$('#verify-results').innerHTML=`<section class="report-hero"><div class="panel"><div class="eyebrow">分析完成</div><div class="conclusion">${esc(r.summary)}</div><div class="plain-note">已比较 ${r.comparison.compared}/${verifyAnalyses.length} 张图片；未识别到唇部的图片不参与评分</div></div><div class="panel score-panel"><div class="score-ring" style="--score:${r.score??0}"><b>${r.score??'—'}</b></div><div class="score-label"><strong>颜色相似度</strong>根据唇部感知色差计算，不是真实性概率。</div></div></section><section class="panel report-section"><h3>最值得参考的上传图片</h3><div class="top-media">${ranked.slice(0,3).map((q,n)=>`<article class="media-card"><img src="${q.x.views.original}"><div class="media-card-body"><div class="rank">#${n+1} · ${q.score}/100</div><div class="source-line">${q.x.metrics.lighting}</div><div class="reason">${q.x.metrics.lighting} · 点击下方“查看图片分析依据”可看详细数值</div></div></article>`).join('')}</div></section><section class="panel report-section"><h3>查看图片分析依据</h3><div class="filter-row" id="diag-tabs">${verifyAnalyses.map((x,i)=>`<button class="filter-btn ${i?'':'active'}" data-img="${i}">图 ${i+1}</button>`).join('')}</div><div id="diag"></div></section><section class="details-grid"><div class="panel"><h3>为什么是这个分数？</h3>${r.findings.map(f=>`<div class="finding"><span class="severity ${f.severity}">${f.severity}</span><div><strong>${esc(f.type)}</strong><p>${esc(f.evidence)} · ${esc(f.impact)}</p></div></div>`).join('')||'<div class="plain-note">未触发明显视觉风险；仍不代表“绝对真实”。</div>'}</div><div class="panel"><h3>给内容创作者的改进建议</h3>${r.suggestions.map(s=>`<div class="review"><p><b>${esc(s.title)}</b><br>${esc(s.why)}<br><span style="color:var(--gold)">预期改善：</span>${esc(s.impact)}</p></div>`).join('')}</div></section>`;$$('#diag-tabs .filter-btn').forEach(b=>b.onclick=()=>showDiag(+b.dataset.img));showDiag(0)}
function showDiag(i){const x=verifyAnalyses[i];$$('#diag-tabs .filter-btn').forEach((b,n)=>b.classList.toggle('active',n===i));$('#diag').innerHTML=`<div class="diagnostic-tabs"><button class="tab-btn active" data-v="original">原图</button><button class="tab-btn" data-v="roi">识别的唇部区域</button><button class="tab-btn" data-v="saturation">浓淡</button><button class="tab-btn" data-v="brightness">明暗</button><button class="tab-btn" data-v="composite">综合查看</button></div><div class="diag-view"><img id="diag-img" src="${x.views.original}"></div><div class="plain-note" style="margin-top:10px">拍摄环境：${x.metrics.lighting}。${x.metrics.roiDetected===false?esc(x.metrics.roiReason):(x.metrics.roiSource==='selected-lips'?'正在分析你标记的唇部。':'已识别唇部，排除口腔内部。')}详细颜色数值仅用于辅助比较，不代表实物的绝对颜色。</div>`;$$('[data-v]').forEach(b=>b.onclick=()=>{$$('[data-v]').forEach(z=>z.classList.remove('active'));b.classList.add('active');$('#diag-img').src=x.views[b.dataset.v]})}

async function tryon(){
 await getManifest();const param=new URLSearchParams((location.hash.split('?')[1]||''));const preset=param.get('p')||'ysl-610';page(`<div class="route-head"><a class="backlink" href="#/">← 首页</a><div class="eyebrow" style="margin-top:22px">自拍个性化试色</div><h1>别问“它适不适合所有人”。<br>先看它在这张自拍里可能怎么呈现。</h1><p>只分析当前照片中的颜色、光照与唇部位置；不推断种族、年龄、身份、健康或颜值。</p></div><section class="tryon-layout"><label class="photo-stage" id="selfie-stage"><input id="selfie-input" type="file" accept="image/png,image/jpeg,image/webp" hidden><div class="empty-stage" id="selfie-empty"><div class="upload-icon">＋</div><h3>上传自然光、无滤镜、嘴唇清晰的正脸自拍</h3><p>自拍仅用于本次浏览器内分析，不上传。</p></div><img id="selfie-img" class="hidden"><div class="toggle hidden" id="try-toggle" style="position:absolute;left:14px;bottom:14px"><button class="active" data-show="tryon">颜色预览</button><button data-show="original">原自拍</button></div></label><aside class="panel try-controls"><div><div class="eyebrow">Step 1</div><h3>选择色号</h3><div class="choice-grid" id="try-products">${manifest.products.map(p=>`<button class="choice ${p.key===preset?'active':''}" data-p="${p.key}"><b>#${p.shade}</b><br><small>${esc(p.brand)} · ${esc(p.name)}</small></button>`).join('')}</div></div><div><div class="eyebrow">Step 2 · 可选</div><h3>告诉我们你的使用情况</h3><div class="form-row"><select class="select" id="lip-prof"><option value="all">唇色：不确定</option><option>浅唇</option><option>深唇</option></select><select class="select" id="tone-prof"><option value="auto">冷暖：按照片</option><option value="warm">偏暖</option><option value="neutral">中性</option><option value="cool">偏冷</option></select></div><button class="primary-btn" id="run-try" disabled>分析这张自拍的拍摄情况</button><input id="debug" type="checkbox" hidden></div><div class="quality-list" id="quality"></div></aside></section><div id="try-results"></div>`);
 const input=$('#selfie-input'),stage=$('#selfie-stage');stage.onclick=e=>{if(e.target.closest('.toggle'))return;input.click()};input.onchange=()=>{selfieFile=input.files[0];if(!selfieFile)return;const u=URL.createObjectURL(selfieFile);$('#selfie-img').src=u;$('#selfie-img').classList.remove('hidden');$('#selfie-empty').classList.add('hidden');$('#run-try').disabled=false};$$('#try-products .choice').forEach(b=>b.onclick=e=>{e.preventDefault();$$('#try-products .choice').forEach(x=>x.classList.remove('active'));b.classList.add('active')});$('#run-try').onclick=runTry
}
async function runTry(){if(!selfieFile)return;const btn=$('#run-try');btn.disabled=true;btn.textContent='正在识别唇部…';const p=await getPreviewProduct($('#try-products .active').dataset.p);try{selfieResult=await createVirtualTryOn(selfieFile,p,$('#debug').checked);$('#selfie-img').src=selfieResult.tryon;$('#try-toggle').classList.remove('hidden');$$('#try-toggle button').forEach(b=>b.onclick=e=>{e.preventDefault();$$('#try-toggle button').forEach(x=>x.classList.remove('active'));b.classList.add('active');$('#selfie-img').src=selfieResult[b.dataset.show]});$('#quality').innerHTML=selfieResult.quality.map(x=>`<div class="quality"><span>${esc(x.label)}</span><b>${esc(x.value)}</b></div>`).join('');renderTryResult(p)}catch(e){$('#quality').innerHTML=`<div class="sku-warning">${esc(e.message)}</div>`}finally{btn.disabled=false;btn.textContent='重新分析'}}
function renderTryResult(p){const r=selfieResult,a=p.analysis,lip=$('#lip-prof').value,tone=$('#tone-prof').value;let reviews=p.reviews.filter(x=>a.representativeReviewIds.includes(x.id));if(lip!=='all'){const t=reviews.filter(x=>x.text.includes(lip));if(t.length)reviews=t}if(tone==='warm'){const t=reviews.filter(x=>/黄皮|暖调|偏暖/.test(x.text));if(t.length)reviews=t}if(tone==='cool'){const t=reviews.filter(x=>/冷白|冷调|偏冷/.test(x.text));if(t.length)reviews=t}reviews=reviews.slice(0,3);const top=personalizedMedia(p,r);const c=p.personalColor.color,expected={h:c.hue,s:Math.max(5,c.saturation+(r.faceRef.saturation-30)*.08),b:Math.max(5,Math.min(95,c.brightness+(r.light.brightness-60)*.12))};$('#try-results').innerHTML=`${colorDirectionHtml(p)}<section class="details-grid"><div class="panel"><div class="eyebrow">这张自拍的拍摄情况质量</div><h3>当前照片颜色参考</h3><div style="display:flex;gap:14px;align-items:center"><span class="swatch-dot" style="width:58px;height:58px;background:${r.faceRef.hex}"></span><div class="plain-note">${r.faceRef.tone}<br>${r.faceRef.hex} · 明度 ${r.faceRef.brightness}% · 浓淡 ${r.faceRef.saturation}%<br><small>仅代表当前照片。</small></div></div></div><div class="panel"><div class="eyebrow">预计呈现</div><h3>#${p.shade} 在这张自拍的拍摄情况中可能怎么呈现？</h3><div class="plain-note">当前为 <b style="color:#fff">${r.light.label}</b>。结合多来源参考色域，预计呈现 H ${expected.h.toFixed(1)}° · S ${expected.s.toFixed(1)}% · B ${expected.b.toFixed(1)}%。</div><div class="swatches" style="margin-top:12px"><span class="swatch-dot" title="试色有谱参考中心" style="background:${hsvToHex(c.hue,c.saturation,c.brightness)}"></span><span class="swatch-dot" title="这张自拍的拍摄情况预计" style="background:${hsvToHex(expected.h,expected.s,expected.b)}"></span></div><div class="disclaimer">颜色预览为视觉模拟，仅供参考，不代表实物最终效果。</div></div></section><section class="panel report-section"><div class="section-head"><div><div class="eyebrow">Personal reference</div><h2 style="font-size:28px">最值得你参考的 3 张真实试色</h2></div><p>综合图片参考质量与唇色、肤色、妆容标签匹配。</p></div><div class="top-media">${top.map((m,i)=>`<article class="media-card"><img src="${m.thumb}"><div class="media-card-body"><div class="rank">#${i+1} · ${Math.round(m.recommendation.combinedScore)}/100</div><div class="source-line">${m.platform} · ${m.metrics.lighting}</div><div class="reason">${esc((m.reasons||[])[0]||'接近参考色域')}</div>${recommendationCopy(m)}</div></article>`).join('')}</div></section><section class="panel report-section"><div class="section-head"><div><div class="eyebrow">Matched comments</div><h2 style="font-size:28px">最匹配的 3 条消费者反馈</h2></div></div><div class="review-list">${reviews.map(reviewCard).join('')||'<div class="plain-note">当前没有足够匹配文本。</div>'}</div></section><section class="cta-band"><div><h3>下一步：回到完整色号报告</h3><p>把自拍预览、真实 Top 3、消费者反馈和 SKU 信息放在一起做购买判断。</p></div><a class="secondary-btn" href="#/shade/${p.key}">查看 #${p.shade} 报告</a></section>`}

async function compare(){
 await getManifest();page(`<div class="route-head"><a class="backlink" href="#/">← 首页</a><div class="eyebrow" style="margin-top:22px">色号对比</div><h1>纠结两个颜色？放在同一把尺子上。</h1><p>比较多来源参考色域、证据充分度与消费者反馈，而不只比较官方商品图。</p></div><div class="compare-pickers"><div class="compare-col"><select id="ca" class="select" style="width:100%">${opts('ysl-610')}</select></div><div class="compare-col"><select id="cb" class="select" style="width:100%">${opts('lancome-274')}</select></div></div><div id="cmp"></div>`);$('#ca').onchange=renderCmp;$('#cb').onchange=renderCmp;renderCmp()
}
async function renderCmp(){const [a,b]=await Promise.all([getProduct($('#ca').value),getProduct($('#cb').value)]);const cp=p=>`<div class="shade-brand">${esc(p.brand)}</div><div class="shade-code">#${p.shade}</div><div class="shade-name">${esc(p.name)} · ${esc(p.texture)}</div><div class="shade-swatch" style="height:130px;margin:18px 0;background:radial-gradient(circle at 40% 35%,${color(p)},#61342e 55%,#251515 100%)"></div><div class="compare-stat"><div class="stat"><b>${p.analysis.score}</b><span>与标准图颜色相似度中位数</span></div><div class="stat"><b>${p.colorReference?.samples?.length||0}</b><span>用于颜色参考的图片</span></div><div class="stat"><b>${p.analysis.center.saturation}%</b><span>浓淡</span></div><div class="stat"><b>${p.analysis.center.brightness}%</b><span>明度</span></div></div><a class="secondary-btn" style="margin-top:14px" href="#/shade/${p.key}">看完整报告</a>`;$('#cmp').innerHTML=`<div class="comparison"><div class="panel">${cp(a)}</div><div class="panel">${cp(b)}</div></div><section class="panel report-section"><h3>一眼看懂差异</h3><div class="plain-note">参考色域中心的环形色相距离约 <b style="color:#fff">${circularHueDistance(a.analysis.center.hue,b.analysis.center.hue).toFixed(1)}°</b>；浓淡差 ${Math.abs(a.analysis.center.saturation-b.analysis.center.saturation).toFixed(1)}%，明度差 ${Math.abs(a.analysis.center.brightness-b.analysis.center.brightness).toFixed(1)}%。</div></section>`}

function openAbout(){modalContent.innerHTML=`<div class="eyebrow">试色有谱 · 分析依据</div><h2 id="modal-title">先核对证据，再比较与你的关系</h2><div class="method-flow"><div><b>图像有哪些处理线索</b>可比源图核对全局曝光后定位局部差异；无源图保留待核验。生成模型为实验性全图线索，已知生成测试检出 0/6。</div><div><b>颜色是否可比较</b>自动找唇部，排除皮肤和口腔；与对应版本标准图比较。</div><div><b>文案是否有依据</b>分别看本人条件、使用细节与绝对承诺，保留支持和不同体验的原文。</div><div><b>证据是否接近你</b>在可用图片和评价里，优先已经确认与你条件相近的证据。</div></div><p>核心机制是“先核验图像线索，再对照同产品、可追溯、相近条件”的证据流程。Evidence / Trust Agent 汇总专项模块与待核验项。图像分割、色差和文本规则服务于这个机制；四个分析角色不是四个独立模型投票。</p><p><b>分数是什么意思？</b>颜色相似度只比较照片中的颜色；文字参考分按公开规则累计具体信息并扣除过度承诺；推荐排序结合图片质量和已确认标签。它们都不是“真假概率”。自然光、原相机和无滤镜声明不能仅凭成片证明。</p><p><b>现在能做到哪里？</b>深入覆盖 YSL 610 / 1936、兰蔻 274 / 275。169 张原始样本中 151 张用于颜色参考，另有 6 张标准图；1,913 条去重文字记录。局部编辑受控测试检出 40/60，对照误报 0/48；未完成独立人工真实性盲评或跨品牌泛化验证。</p><p>首页三组案例是团队提供的已知演示压力测试，不是训练集之外的盲测。自拍预览是辅助视觉模拟，不参与内容判断。</p><a href="./docs/DEMO_PROTOCOL.md" target="_blank" rel="noopener">查看方法、演示协议和后续验证计划</a>`;openModal()}

function openModal(){modal.hidden=false;modal.setAttribute('aria-hidden','false');modal.style.display='grid';modal.style.pointerEvents='auto';document.body.style.overflow='hidden'}function closeModal(){modal.style.display='none';modal.style.pointerEvents='none';modal.hidden=true;modal.setAttribute('aria-hidden','true');document.body.style.overflow=''}function wait(ms){return new Promise(r=>setTimeout(r,ms))}
async function router(){try{await getManifest();const p=(location.hash.slice(1)||'/').split('?')[0];if(p==='/'||p==='/home')return home();if(p==='/seeded')return seeded();if(p==='/selfie')return selfieHome();if(p==='/search')return search();if(p.startsWith('/shade/'))return shade(p.split('/')[2]);if(p==='/verify')return verify();if(p==='/tryon')return tryon();if(p==='/compare')return compare();return home()}catch(e){console.error(e);page(`<div class="route-head"><h1>数据加载失败</h1><p>${esc(e.message)}</p><a class="secondary-btn" href="#/">返回首页</a></div>`)}}
$('#open-method').onclick=openAbout;$('#modal-close').onclick=closeModal;modal.onclick=e=>e.target===modal&&closeModal();document.addEventListener('keydown',e=>e.key==='Escape'&&closeModal());window.addEventListener('hashchange',router);router();
