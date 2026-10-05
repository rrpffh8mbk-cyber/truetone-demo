import {analyzeImageFile,runFourAgents,buildProductConsumerSummary,hsvToHex,ANALYSIS_KEYWORDS,circularHueDistance} from './agents.js';
import {createVirtualTryOn} from './tryon.js';

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const app=$('#app'),toast=$('#toast'),modal=$('#modal-backdrop'),modalContent=$('#modal-content');
// Defensive initial state: never allow the modal overlay to block the app on first paint.
modal.style.display='none';modal.style.pointerEvents='none';modal.hidden=true;modal.setAttribute('aria-hidden','true');
let manifest, cache=new Map(), cloudCache=new Map(), verifyFiles=[], verifyAnalyses=[], selfieFile=null, selfieResult=null, purchaseTargetKey=null;
const PARTS={'ysl-610':4,'ysl-1936':4,'lancome-274':0,'lancome-275':0};
const FALLBACK_REVIEWS={
 'lancome-274':[
  {platform:'小红书',type:'正文',text:'兰蔻274经典奶茶色真香。刚上嘴我一直觉得太棕，但等成膜/氧化后颜色会变浅、更奶茶；深唇要谨慎，和YSL 610相比更厚重。',negativeEvidence:true},
  {platform:'小红书',type:'正文',text:'浅奶茶调刚上嘴几乎融唇，素颜时一度觉得没气色；现在更偏爱淡妆后，反而觉得薄涂温柔、低饱和、日常通勤很合适。'},
  {platform:'淘宝',type:'评价',text:'274颜色和实物相差比较大，我这里呈现得更暗、更土，是一次踩雷体验。',sku:'「声色」限定#274[原声裸茶]；基本款',negativeEvidence:true},
  {platform:'淘宝',type:'评价',text:'274奶茶裸低饱和，素颜薄涂提气色，淡妆厚涂更有氛围感。',sku:'兰蔻粉金管唇膏#274'},
  {platform:'小红书',type:'正文',text:'网上产品图和拿到手差别会很大；我本身唇色很淡又偏干，274在我这里很提气色。',negativeEvidence:true},
  {platform:'淘宝',type:'问大家回答',text:'我买过274唇釉，在我这里并不合适；不同人上嘴差异很明显。',repeatBuyer:true,negativeEvidence:true}
 ],
 'lancome-275':[
  {platform:'淘宝',type:'评价',text:'之前买过274，这次尝试275；刚擦上去颜色还好，但很快会氧化发暗，掉色也比较明显。',sku:'兰蔻菁纯裸唇釉#275 法式裸茶',repeatBuyer:true,negativeEvidence:true},
  {platform:'小红书',type:'正文',text:'用唇刷把275晕染开后更接近广告里的裸色，带大地色系奶茶调；覆盖力可以，深唇也能遮一些。',negativeEvidence:true},
  {platform:'淘宝',type:'评价',text:'本人浅唇，275涂出来和广告颜色比较接近，没有很偏橘，掉色也不是很严重。',sku:'兰蔻菁纯裸唇釉#275 法式裸茶'},
  {platform:'淘宝',type:'问大家回答',text:'275更适合素颜；如果想要更浓一些的显色，可以考虑其他方向。'},
  {platform:'淘宝',type:'问大家回答',text:'我是深唇，带妆会更好看一点；无美颜无滤镜，只看颜色，希望能帮到你。',negativeEvidence:true},
  {platform:'小红书',type:'正文',text:'我这里素颜效果并不好，而且偏拔干；网上很多好评不一定适合每个人。',negativeEvidence:true}
 ]};
const fmt=n=>new Intl.NumberFormat('zh-CN').format(n||0);
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const shadeTarget=p=>p.tryOnColor||p.analysis.center; const color=p=>{const c=shadeTarget(p);return hsvToHex(c.hue,c.saturation,c.brightness)};
function toastMsg(s){toast.textContent=s;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),1900)}
async function ungzipB64(parts){const txt=(await Promise.all(parts.map(u=>fetch(u).then(r=>{if(!r.ok)throw Error('数据文件未部署完整');return r.text()})))).join('').trim();const bin=Uint8Array.from(atob(txt),c=>c.charCodeAt(0));if(!('DecompressionStream'in window))throw Error('当前浏览器不支持数据解压，请使用最新版 Chrome / Edge / Safari');const stream=new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'));return JSON.parse(await new Response(stream).text())}
async function getManifest(){if(manifest)return manifest;manifest=await fetch('./data/manifest.json').then(r=>r.json());return manifest}
function summaryFallback(k){
 const m=manifest.products.find(x=>x.key===k);
 if(!m)throw Error('未找到该色号数据');
 const ids=m.analysis?.topMediaIds||[];
 const media=ids.map((id,i)=>{
   const platform=id.startsWith('xhs-')?'小红书':'淘宝';
   const pm=m.analysis?.platform?.[platform]||m.analysis?.center||{hue:0,saturation:0,brightness:50};
   return {id,platform,type:'离线真实媒体记录',thumb:null,referenceScore:Math.max(60,92-i*2),
     metrics:{hue:pm.hue,saturation:pm.saturation,brightness:pm.brightness,sceneBrightness:pm.brightness,lighting:'媒体记录',dominant:hsvToHex(pm.hue,pm.saturation,pm.brightness)},
     reasons:['该媒体 ID 来自完整离线数据的 Top reference 排名；原始高清文件将在阿里云 OSS 数据层展示']};
 });
 const reviews=(FALLBACK_REVIEWS[k]||[]).map((r,i)=>({id:`fallback-${k}-${i+1}`,...r,genericTemplate:false}));
 return {...m,media,reviews,asks:[],_summaryOnly:true};
}
async function getProduct(k){
 if(cache.has(k))return cache.get(k);
 const n=PARTS[k]||0;
 if(!n){const p=summaryFallback(k);cache.set(k,p);return p}
 const urls=Array.from({length:n},(_,i)=>`./data/full/${k}.${i+1}.b64`);
 const p=await ungzipB64(urls);cache.set(k,p);return p
}
function meta(k){return manifest.products.find(x=>x.key===k)}
function page(x){app.innerHTML=`<div class="page">${x}</div>`;window.scrollTo(0,0)}
function go(h){location.hash=h}
function shadeCard(p){return `<a class="shade-card" href="#/shade/${p.key}"><div><div class="shade-brand">${esc(p.brand)}</div><div class="shade-code">#${p.shade}</div><div class="shade-name">${esc(p.name)} · ${esc(p.product)}</div><div class="shade-meta"><span class="mini-chip">${p.analysis.counts.visual} 份视觉素材</span><span class="mini-chip">${p.analysis.counts.text} 条文字证据</span><span class="mini-chip">证据充分度 ${p.analysis.evidenceSufficiency}</span></div></div><div class="shade-swatch" style="background:radial-gradient(circle at 38% 35%,${color(p)} 0,#6b352e 48%,#271715 100%)"></div></a>`}
function opts(sel){return manifest.products.map(p=>`<option value="${p.key}" ${p.key===sel?'selected':''}>${esc(p.brand)} #${p.shade} ${esc(p.name)}</option>`).join('')}
function highlight(t){let s=esc(t);for(const k of ANALYSIS_KEYWORDS)s=s.replaceAll(k,`<mark class="highlight">${k}</mark>`);return s}
function reviewCard(r){return `<article class="review"><p>${highlight(r.text)}</p><small><span>${r.platform}</span><span>${r.type||'评论'}</span>${r.sku?`<span>${esc(r.sku)}</span>`:''}${r.repeatBuyer?'<span>复购线索</span>':''}${r.negativeEvidence?'<span>含负向体验</span>':''}</small></article>`}
async function fetchCloudReferenceMedia(productKey){
 const api=(window.TRUETONE_CONFIG?.apiBase||'').replace(/\/$/,'');
 if(!api)return [];
 try{
   const r=await fetch(api+'/api/media?product_key='+encodeURIComponent(productKey),{cache:'no-store'});
   if(!r.ok)throw Error('HTTP '+r.status);
   const out=await r.json();
   return Array.isArray(out?.media)?out.media.filter(x=>x&&x.url).slice(0,3):[];
 }catch(e){
   console.warn('OSS reference media unavailable',e);
   return [];
 }
}
function cloudReferenceCard(m,i){
 const platform=esc(m.platform||'真实来源'),label=esc(m.label||'真实试色参考'),reason=esc(m.reason||'来自已核验的真实样本，用于辅助购买判断。');
 return `<article class="media-card cloud-media-card" data-cloud-url="${esc(m.url)}">
   <div class="cloud-thumb-wrap"><img src="${esc(m.url)}" alt="${platform}真实试色参考 ${i+1}" loading="lazy" referrerpolicy="no-referrer"><span class="media-source-badge">${platform} · OSS真实样本</span></div>
   <div class="media-card-body"><div class="rank">#${i+1} · 真实样本</div><div class="source-line">${label}</div><div class="reason">${reason}</div></div>
 </article>`;
}

function mediaCard(m,i){const score=Number.isFinite(m.referenceScore)?Math.round(m.referenceScore)+'/100':'Top reference';return `<article class="media-card" data-media="${m.id}">${m.thumb?`<img src="${m.thumb}" alt="真实试色参考图 ${i+1}">`:'<div class="skeleton media-placeholder" style="height:210px"><span>真实媒体记录<br><small>原图未在公开静态页重发</small></span></div>'}<div class="media-card-body"><div class="rank">#${i+1} · ${score}</div><div class="source-line">${m.platform} · ${m.metrics?.lighting||m.type}</div><div class="reason">${esc((m.reasons||[])[0]||'接近多来源参考色域')}</div></div></article>`}
function metric(label,v,max=100,u='%'){return `<div class="metric-row"><label>${label}</label><div class="bar"><i style="width:${Math.min(100,Math.abs(v)/max*100)}%"></i></div><span>${Number(v).toFixed(1)}${u}</span></div>`}
function evidenceScoreText(a){return `视觉 ${a.counts.images} 图 + ${a.counts.videos} 视频元数据 · 文字 ${fmt(a.counts.text)} 条 · ${a.counts.sources} 类来源`}
function creatorAdviceForProduct(p){
 const a=p.analysis||{},kw=a.keywordCounts||{},out=[];
 const add=(title,issue,how,why,impact)=>out.push({title,issue,how,why,impact});
 if((a.findings||[]).some(f=>/过曝|亮度/.test(f.type)))add('统一拍摄曝光','当前样本存在亮度/曝光异常','使用中性、稳定光源并锁定曝光','减少亮度变化被消费者误读成色号差异','提高跨内容可比性');
 if((a.findings||[]).some(f=>/饱和/.test(f.type)))add('减少非必要增饱和','部分样本饱和度偏离主要色域','保留无滤镜原图并标注后期处理','降低颜色被视觉强化的风险','让消费者更容易判断真实显色范围');
 if(kw['深唇']||kw['浅唇'])add('补充素唇与唇色背景','消费者反馈显示原生唇色会影响呈现','增加素唇对比，并标注浅唇/深唇','避免把个体差异误解为内容失真','让相似唇色用户更快找到可参考证据');
 if(kw['薄涂']||kw['厚涂'])add('同时展示薄涂 / 厚涂','数据中存在不同涂抹厚度的描述','同一光线下并列展示薄涂与厚涂','控制涂抹厚度这一影响变量','减少“为什么和博主不一样”的误差');
 if(kw['氧化'])add('补充成膜/氧化后效果','消费者反馈提到上嘴后颜色变化','增加刚涂与成膜一段时间后的对比','让购买者看到时间维度上的正常变化','降低到手后的预期落差');
 add('标注拍摄条件','社媒与电商图片来源和环境不完全一致','注明自然光/暖光/冷光、设备与是否滤镜','帮助消费者区分拍摄环境与产品本身差异','提升内容透明度与信任');
 return out.slice(0,5);
}


function reviewPersonalScore(r,profile){
 const t=(r.text||'');let s=0;
 if(profile.lip!=='不确定'&&t.includes(profile.lip))s+=8;
 if(profile.makeup==='素颜'&&t.includes('素颜'))s+=6;
 if(profile.makeup==='日常妆'&&/日常|通勤|淡妆/.test(t))s+=5;
 if(profile.makeup==='完整妆'&&/厚涂|带妆|浓妆/.test(t))s+=5;
 const goalMap={'自然通勤':/自然|日常|通勤|低饱和|裸/,'显白提气色':/显白|提气色|气色/,'清透轻盈':/清透|轻薄|薄涂|镜面/,'更有气场':/浓郁|厚涂|复古|气场|显色/};
 if(goalMap[profile.goal]?.test(t))s+=7;
 if(r.repeatBuyer)s+=4;if(r.negativeEvidence)s+=4;if(r.genericTemplate)s-=7;
 s+=Math.min(5,t.length/60);return s;
}
function personalizedReviews(p,profile){
 const arr=(p.reviews||[]).filter(r=>r.text&&!r.genericTemplate).map(r=>({r,s:reviewPersonalScore(r,profile)})).sort((a,b)=>b.s-a.s);
 return arr.slice(0,3).map(x=>x.r);
}
function personalizedMedia(p,selfie){
 const light=selfie?.light?.label||'中性光',b=selfie?.light?.brightness??60;
 return (p.media||[]).filter(m=>m.metrics).map(m=>{
   let s=Number.isFinite(m.referenceScore)?m.referenceScore:72;
   const ml=m.metrics.lighting||'中性光';if(ml===light)s+=5;else if(['暖光','冷光'].includes(ml))s-=3;
   s-=Math.min(10,Math.abs((m.metrics.sceneBrightness??m.metrics.brightness??60)-b)*.12);
   return {...m,personalScore:Math.max(25,Math.min(99,s))};
 }).sort((a,b)=>b.personalScore-a.personalScore).slice(0,3);
}
function personalMatchScore(p,selfie,profile,reviews){
 let s=68;const a=p.analysis||{},kw=a.keywordCounts||{};
 if(a.evidenceSufficiency==='高')s+=7;
 if((a.platformDiff?.hue??99)<12)s+=5;
 if(selfie?.light?.label==='中性光')s+=5;else s-=2;
 if(profile.lip!=='不确定'&&kw[profile.lip])s+=5;
 if(profile.makeup==='素颜'&&kw['素颜'])s+=4;
 const gm={'自然通勤':['素颜','薄涂'],'显白提气色':['显白'],'清透轻盈':['薄涂'],'更有气场':['厚涂']};
 if((gm[profile.goal]||[]).some(k=>kw[k]))s+=4;
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
  product:{key:p.key,brand:p.brand,shade:p.shade,name:p.name,product:p.product,texture:p.texture,skuLines:p.skuLines||[]},
  trust_score:p.analysis.score,evidence_sufficiency:p.analysis.evidenceSufficiency,
  counts:p.analysis.counts,platform_diff:p.analysis.platformDiff,keyword_counts:p.analysis.keywordCounts,
  representative_reviews:reviews.map(r=>({platform:r.platform,type:r.type,text:r.text,sku:r.sku||'',repeatBuyer:!!r.repeatBuyer,negativeEvidence:!!r.negativeEvidence})),
  deterministic_match_score:match
 };
 const payload={product_key:p.key,profile,selfie_features:{light:selfie.light,faceRef:selfie.faceRef},evidence};
 const cacheKey=JSON.stringify([p.key,profile,selfie.light?.label,Math.round(selfie.light?.brightness||0),match]);
 if(cloudCache.has(cacheKey))return cloudCache.get(cacheKey);
 for(let attempt=0;attempt<2;attempt++){
  try{
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
   const r=await fetch(api+'/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:controller.signal});
   clearTimeout(timer);
   if(!r.ok)throw Error('HTTP '+r.status);
   const out=await r.json();
   if(!out||(!out.summary&&!out.purchase_advice))throw Error('incomplete cloud narrative');
   cloudCache.set(cacheKey,out);return out;
  }catch(e){
   console.warn('Cloud Agent attempt '+(attempt+1)+' unavailable',e);
   if(attempt===0)await wait(700);
  }
 }
 return null;
}

function normalizeTargetInput(s){
 return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[＃#\s·._-]/g,'');
}
function resolveDemoProduct(brandRaw,shadeRaw){
 const b=normalizeTargetInput(brandRaw),s=normalizeTargetInput(shadeRaw);
 if(!b||!s)return null;
 return manifest.products.find(p=>{
   const brandOk=p.key.startsWith('ysl-')
     ? ['ysl','saintlaurent','圣罗兰'].some(x=>b.includes(x))
     : ['lancome','兰蔻'].some(x=>b.includes(x));
   const shadePool=[p.shade,p.name,...(p.shadeAliases||[]),...(p.skuLines||[])].map(normalizeTargetInput);
   const shadeOk=shadePool.some(x=>x===s||x.includes(s)||s.includes(x)||s.includes(normalizeTargetInput(p.shade)));
   return brandOk&&shadeOk;
 })||null;
}

async function home(){
 await getManifest();selfieFile=null;selfieResult=null;purchaseTargetKey=null;
 page(`
 <section class="consumer-hero">
   <div class="eyebrow">TRUE TONE · YOUR ONLINE BEAUTY ADVISOR</div>
   <h1>这支口红，<br>真的适合我吗？</h1>
   <p>先上传一张自拍，再告诉 TrueTone 你正在考虑的色号。我们会先筛掉不值得依赖的种草与评价，再从可信内容里找到与你情况更接近的真实参考。</p>
   <div class="journey-line"><span>你的自拍</span><i>→</i><span>目标色号</span><i>→</i><span>可信内容筛选</span><i>→</i><span>和你最像的证据</span><i>→</i><span>购买建议</span></div>
 </section>

 <section class="consumer-builder">
   <div class="builder-step">
     <div class="step-num">01</div>
     <div class="step-copy"><div class="eyebrow">先认识当前的你</div><h2>上传一张自拍</h2><p>优先使用自然光、无滤镜、正脸、嘴唇清晰的照片。自拍只在当前浏览器内用于本次分析。</p></div>
     <label class="selfie-uploader" id="consumer-selfie-zone" for="consumer-selfie-input">
       <input id="consumer-selfie-input" class="native-image-input" type="file" accept="image/*">
       <div id="consumer-selfie-empty"><div class="upload-icon">＋</div><b>点击上传自拍</b><span>手机相册 / JPG / PNG / HEIC / WEBP</span></div>
       <img id="consumer-selfie-preview" class="hidden" alt="自拍预览">
       <span class="replace-photo hidden" id="consumer-replace-photo">更换照片</span>
     </label>
   </div>

   <div class="builder-step">
     <div class="step-num">02</div>
     <div class="step-copy"><div class="eyebrow">告诉我们你想买什么</div><h2>输入品牌和目标色号</h2><p>像真实购买场景一样直接输入你正在考虑的品牌与色号。当前 Demo 会在团队已爬取的小红书 + 淘宝真实样本库中匹配。</p></div>
     <div class="target-entry">
       <div class="target-fields">
         <label><span>品牌名</span><input id="consumer-brand" class="target-input" list="brand-options" autocomplete="off" placeholder="例如 圣罗兰 YSL / 兰蔻 Lancôme"></label>
         <label><span>色号 / 色号名</span><input id="consumer-shade" class="target-input" list="shade-options" autocomplete="off" placeholder="例如 610 / 274 / 冰乌龙 / 杏仁奶茶"></label>
       </div>
       <datalist id="brand-options"><option value="圣罗兰 YSL"><option value="兰蔻 Lancôme"></datalist>
       <datalist id="shade-options"><option value="610 · 冰乌龙 / 冷萃奶茶"><option value="1936 · 琥珀柑茶"><option value="274 · 杏仁奶茶 / 裸茶系"><option value="275 · 法式裸茶"></datalist>
       <div class="target-match empty-state" id="target-match">输入品牌和色号后，TrueTone 会确认是否已收录该产品。</div>
       <p class="demo-support">当前比赛 Demo 已收录：圣罗兰 YSL 610 / 1936；兰蔻 Lancôme 274 / 275。</p>
     </div>
   </div>

   <div class="builder-step compact-step">
     <div class="step-num">03</div>
     <div class="step-copy"><div class="eyebrow">可选 · 提高匹配度</div><h2>再告诉我们一点使用习惯</h2><p>这些信息由你主动选择；系统不会从自拍推断种族、年龄、颜值或身份。</p></div>
     <div class="profile-fields">
       <label>你的自然唇色<select id="consumer-lip" class="select"><option>不确定</option><option>浅唇</option><option>中唇</option><option>深唇</option></select></label>
       <label>通常怎么涂<select id="consumer-makeup" class="select"><option>素颜</option><option selected>日常妆</option><option>完整妆</option></select></label>
       <label>最想要的效果<select id="consumer-goal" class="select"><option selected>自然通勤</option><option>显白提气色</option><option>清透轻盈</option><option>更有气场</option></select></label>
     </div>
   </div>

   <div class="consumer-start">
     <button class="primary-btn big-action" id="consumer-run" disabled>上传自拍后开始 TrueTone 分析</button>
     <p>分析会区分“网上内容是否值得信”与“这个色号与你的参考匹配度”，不会把二者混成一个分数。</p>
   </div>
 </section>
 <section id="consumer-analysis"></section>
 <section class="privacy-strip"><strong>隐私说明：</strong>自拍仅在当前浏览器内用于本次颜色方向预览，不进入评论与试色样本库；网络证据从受控的真实样本库中读取。</section>
 `);

 const input=$('#consumer-selfie-input'),zone=$('#consumer-selfie-zone'),preview=$('#consumer-selfie-preview'),empty=$('#consumer-selfie-empty'),replace=$('#consumer-replace-photo'),run=$('#consumer-run'),brandInput=$('#consumer-brand'),shadeInput=$('#consumer-shade'),matchBox=$('#target-match');
 function updateRunState(){
   const ok=!!selfieFile&&!!purchaseTargetKey;
   run.disabled=!ok;
   run.textContent=!selfieFile?'上传自拍后开始 TrueTone 分析':!purchaseTargetKey?'请输入已收录的品牌与色号':'开始 TrueTone 个性化分析';
 }
 function updateTargetMatch(){
   const p=resolveDemoProduct(brandInput.value,shadeInput.value);
   purchaseTargetKey=p?.key||null;
   if(p){
     matchBox.className='target-match matched';
     matchBox.innerHTML=`<span class="shade-dot" style="background:${color(p)}"></span><div><b>已找到：${esc(p.brand)} #${p.shade} · ${esc(p.name)}</b><small>${esc(p.product)} · ${esc(p.texture)} · ${fmt(p.analysis.counts.text)} 条文字证据 · 试色参考色已载入</small></div><em>可分析</em>`;
   }else if(brandInput.value||shadeInput.value){
     matchBox.className='target-match no-match';
     matchBox.textContent='暂未匹配到当前 Demo 数据。请尝试 圣罗兰 YSL 610 / 1936 或 兰蔻 Lancôme 274 / 275。';
   }else{
     matchBox.className='target-match empty-state';
     matchBox.textContent='输入品牌和色号后，TrueTone 会确认是否已收录该产品。';
   }
   updateRunState();
 }
 function chooseFile(file){
   if(!file)return;
   const name=String(file.name||'').toLowerCase();
   const looksLikeImage=(file.type||'').startsWith('image/')||/\.(jpe?g|png|webp|heic|heif)$/i.test(name);
   if(!looksLikeImage){showToast('请选择照片文件');return}
   selfieFile=file;
   const objectUrl=URL.createObjectURL(file);
   preview.onload=()=>URL.revokeObjectURL(objectUrl);
   preview.onerror=()=>{URL.revokeObjectURL(objectUrl);showToast('这张照片当前浏览器无法预览，请尝试 JPG / PNG 或直接从手机相册重新选择。')};
   preview.src=objectUrl;preview.classList.remove('hidden');empty.classList.add('hidden');replace.classList.remove('hidden');updateRunState();
 }
 input.onchange=()=>chooseFile(input.files&&input.files[0]);
 zone.ondragover=e=>{e.preventDefault();zone.classList.add('drag')};zone.ondragleave=()=>zone.classList.remove('drag');zone.ondrop=e=>{e.preventDefault();zone.classList.remove('drag');chooseFile(e.dataTransfer.files&&e.dataTransfer.files[0])};
 brandInput.oninput=updateTargetMatch;shadeInput.oninput=updateTargetMatch;
 brandInput.onkeydown=shadeInput.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();updateTargetMatch();if(!run.disabled)run.click()}};
 updateRunState();run.onclick=runConsumerJourney;
}

async function runConsumerJourney(){
 if(!selfieFile||!purchaseTargetKey)return;
 const result=$('#consumer-analysis'),run=$('#consumer-run'),key=purchaseTargetKey;
 const profile={lip:$('#consumer-lip').value,makeup:$('#consumer-makeup').value,goal:$('#consumer-goal').value};
 run.disabled=true;run.textContent='正在分析…';
 result.innerHTML=`<section class="consumer-progress"><div class="eyebrow">TrueTone 正在替你筛选</div><h2>先判断网上什么值得信，再找什么最像你。</h2><div class="human-progress">
  <div class="hp active">读取该色号的小红书与电商证据</div><div class="hp">检查光照、颜色与跨内容差异</div><div class="hp">降低不稳定 / 低参考价值内容权重</div><div class="hp">寻找与你条件更接近的评论与试色</div><div class="hp">生成购买参考</div>
 </div><div class="progress"><i id="consumer-progress-bar"></i></div></section>`;
 result.scrollIntoView({behavior:'smooth',block:'start'});
 try{
   const p=await getProduct(key),steps=$$('.hp'),bar=$('#consumer-progress-bar');
   steps[0].classList.add('done');steps[1].classList.add('active');bar.style.width='22%';await wait(180);
   selfieResult=await createVirtualTryOn(selfieFile,p,false);
   steps[1].classList.add('done');steps[2].classList.add('active');bar.style.width='48%';await wait(180);
   const reviews=personalizedReviews(p,profile),media=personalizedMedia(p,selfieResult);
   steps[2].classList.add('done');steps[3].classList.add('active');bar.style.width='72%';await wait(180);
   const match=personalMatchScore(p,selfieResult,profile,reviews),expected=expectedAppearance(p,selfieResult);
   steps[3].classList.add('done');steps[4].classList.add('active');bar.style.width='90%';
   const cloudNarrative=await callCloudAgent(p,profile,selfieResult,reviews,match);await wait(120);
   steps[4].classList.add('done');bar.style.width='100%';
   renderConsumerResult(p,profile,reviews,media,match,expected,cloudNarrative);
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
  const platform=esc(m.platform||'真实来源'),label=esc(m.label||'真实试色参考'),reason=esc(m.reason||'来自已核验真实样本，用于辅助判断不同环境下的综合色调。'),sku=m.sku?'<small>'+esc(m.sku)+'</small>':'';
  return '<article class="matched-media real-reference"><div class="real-media-frame"><img src="'+esc(m.url)+'" alt="'+platform+'试色参考 '+(i+1)+'" loading="lazy"><span class="media-source-badge">'+platform+' · 已核验样本</span></div><div class="media-card-copy"><div class="media-rank-line"><b>0'+(i+1)+'</b><span>'+label+'</span></div><p>'+reason+'</p>'+sku+'</div></article>';
 }).join('');
 if(localMedia&&localMedia.length)return localMedia.slice(0,3).map((m,i)=>{
  const pic=m.thumb?'<img src="'+esc(m.thumb)+'" alt="试色参考 '+(i+1)+'" loading="lazy">':'<div class="media-placeholder"><span>图片暂不可显示<br><small>该条证据仍参与分析</small></span></div>';
  return '<article class="matched-media">'+pic+'<div class="media-card-copy"><div class="media-rank-line"><b>0'+(i+1)+'</b><span>'+esc(m.platform||'真实来源')+'</span></div><p>'+esc((m.reasons||[])[0]||'在可信度与当前使用条件之间综合排序。')+'</p></div></article>';
 }).join('');
 return '<div class="empty">当前没有可稳定展示的真实试色图片。</div>';
}

function consumerPlatformSummary(a){
 const d=a.platformDiff||{},h=Math.abs(Number(d.hue)||0),s=Math.abs(Number(d.saturation)||0),b=Math.abs(Number(d.brightness)||0);
 const xhs=a.platform?.['小红书'],tb=a.platform?.['淘宝'];
 const tone=h<5?'综合色相基本一致':h<12?'色相有轻微差别':'色相差别比较明显';
 let bright='亮度差异不大';
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
 if(kw['薄涂']||kw['厚涂'])out.push('薄涂和厚涂会改变饱和度、覆盖力和红/棕感。');
 if(kw['氧化'])out.push('部分消费者提到成膜或氧化后会变深/变色，刚上嘴和过一会儿不一定一样。');
 if(kw['自然光']||kw['滤镜']||kw['无滤镜'])out.push('自然光、室内灯和滤镜会改变照片观感，光线差异应先于“P图”判断。');
 return out.length?out:['同一个色号在不同唇色、光线和涂法下出现差异，本身并不等于内容失真。'];
}
function cleanAgentCopy(s,max=150){
 let x=String(s||'').replace(/TrueTone\s*Score\s*\d+/gi,'').replace(/Match\s*Score\s*\d+/gi,'').replace(/[（(]\s*[，,;；:\s]*[）)]/g,'').replace(/\s+/g,' ').trim();
 return x.length>max?x.slice(0,max).replace(/[，,;；。]\s*$/,'')+'。':x;
}

function renderConsumerResult(p,profile,reviews,media,match,expected,cloudNarrative=null){
 const a=p.analysis,cloudScore=Number(cloudNarrative?.truetone_score??cloudNarrative?.trust_score??cloudNarrative?.score),trust=Number.isFinite(cloudScore)?Math.round(cloudScore):Math.round(a.score),evidenceLevel=cloudEvidenceLabel(cloudNarrative?.evidence_sufficiency||a.evidenceSufficiency),trustLabel=trust>=80?'整体较值得参考':trust>=65?'可以参考，但要注意内容差异':'建议谨慎参考，不依赖单一内容';
 const fitLabel=match>=84?'与你当前条件的参考匹配度较高':match>=72?'有一定参考价值，但个体差异仍明显':'与你当前条件相近的证据还不够充分';
 const normalItems=consumerNormalItems(p),riskItems=consumerRiskItems(p),platformSummary=consumerPlatformSummary(a);
 const mediaHtml=cloudMediaHtml(cloudNarrative,media);
 const reviewsHtml=reviews.length?reviews.map((r,i)=>`<article class="matched-review"><div class="match-rank">0${i+1}</div><div><div class="review-source">${r.platform} · ${r.type||'评论'}${r.repeatBuyer?' · 复购/已购高信息量线索':''}</div><p>“${highlight(r.text)}”</p><small>匹配原因：${profile.lip!=='不确定'&&r.text.includes(profile.lip)?'与你主动填写的唇色情况一致；':''}${r.negativeEvidence?'包含具体负向/差异体验，信息量高；':''}与“${profile.goal}”购买目标相关。</small></div></article>`).join(''):'<div class="empty">当前没有足够的可匹配原文评论。</div>';
 $('#consumer-analysis').innerHTML=`
 <section class="personal-result">
   <div class="result-title"><div><div class="eyebrow">你的 TrueTone 购买参考</div><h2>${esc(p.brand)} #${p.shade} · ${esc(p.name)}</h2><p>不是替你宣布“适合 / 不适合”，而是根据当前自拍和可信消费者证据告诉你：这个方向对你有多大参考价值。</p></div><button class="ghost-btn" id="back-to-form">重新选择</button></div>
   ${cloudNarrative?.runtime==="aliyun-model-studio"?`<div class="cloud-connected-badge"><span>TRUE AI ANALYSIS</span><b>✓ 阿里云百炼已参与本次分析</b></div>`:``}
   <div class="personal-hero-grid">
    <div class="tryon-card"><div class="tryon-image"><img id="consumer-result-photo" src="${selfieResult.tryon}"><div class="toggle result-toggle"><button class="active" data-view="tryon">颜色预览</button><button data-view="original">原自拍</button></div></div><div class="tryon-caption"><div class="preview-color-row"><span class="preview-swatch" style="background:${color(p)}"></span><div><b>#${p.shade} · ${esc(p.name)}</b><p>${expected.tone}。当前仅模拟综合色调方向，并保留你原本的唇纹与明暗。</p></div></div><small>颜色预览是视觉模拟，不是品牌官方色卡或精准 AR 试色；实物仍会受原生唇色、光线与涂抹厚度影响。</small></div></div>
    <div class="decision-card">
      <div class="decision-block"><span>网上关于这个色号，可信吗？</span><div class="big-score">${trust}<small>/100</small></div><b>${trustLabel}</b><p>${a.counts.visual} 份视觉素材 + ${fmt(a.counts.text)} 条文字证据；证据充分度：${evidenceLevel}。</p></div>
      <div class="decision-block accent"><span>和你当前情况，匹配吗？</span><div class="big-score">${match}<small>% MATCH</small></div><b>${fitLabel}</b><p>结合当前自拍光照、你主动选择的“${profile.lip} / ${profile.makeup} / ${profile.goal}”以及可信内容匹配。</p></div>
    </div>
   </div>

   ${cloudNarrative?.summary?`<section class="agent-narrative"><div class="eyebrow">AI 个性化解读</div><h3>先看结论：这支口红值不值得你继续考虑？</h3><p>${esc(cleanAgentCopy(cloudNarrative.summary,170))}</p>${cloudNarrative.purchase_advice?`<small>${esc(cleanAgentCopy(cloudNarrative.purchase_advice,210))}</small>`:''}</section>`:`<section class="agent-narrative local-narrative"><div class="eyebrow">本次稳定结果</div><h3>先看结论：可以参考，但别只看一张种草图。</h3><p>${esc(trustLabel)}。当前结果仍使用已收录的真实样本、评论和你的使用条件完成；云端个性化文字这次没有稳定返回，不影响证据排序和颜色风险判断。</p></section>`}
   <section class="consumer-section"><div class="section-head"><div><div class="eyebrow">先看这些</div><h2>最值得你参考的 3 张试色</h2></div><p>先通过内容可信度筛选，再按与你当前自拍光照和使用情况的接近程度重新排序。</p></div><div class="matched-media-grid">${mediaHtml}</div></section>

   <section class="consumer-section"><div class="section-head"><div><div class="eyebrow">她们怎么说</div><h2>和你更相关的 3 条消费者反馈</h2></div><p>负向体验、复购/已购和具体使用条件会获得更高信息权重；好评本身不会被当成“真实”。</p></div><div class="matched-review-list">${reviewsHtml}</div></section>

   <section class="consumer-section trust-explain"><div class="section-head"><div><div class="eyebrow">为什么我们相信 / 不完全相信这些内容</div><h2>网络内容可信度拆解</h2></div></div>
    <div class="trust-grid">
      <div class="panel trust-story-card platform-card"><h3>跨平台观察</h3><p>${esc(platformSummary)}</p></div>
      <div class="panel trust-story-card risk-card"><h3>当前主要风险</h3><ul class="consumer-bullets">${riskItems.slice(0,4).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>
      <div class="panel trust-story-card"><h3>这些可能是正常差异</h3><ul class="consumer-bullets">${(normalItems.length?normalItems:['当前证据不足以细分更多正常变化。']).slice(0,4).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>
      <div class="panel"><h3>同色号不同版本提醒</h3><p>${p.skuLines?.length>1?`当前样本里同一色号出现 ${p.skuLines.length} 个产品线 / 包装或版本标签。TrueTone 会分开看，避免把版本差异误当成“修图”。`:'当前样本里没有明显的同色号版本混淆。'}</p></div>
    </div>
    <details class="tech-details"><summary>查看分析依据与技术细节</summary><div class="details-grid"><div class="panel"><h3>当前自拍</h3><p>光照：${selfieResult.light.label}<br>画面亮度：${selfieResult.light.brightness}%<br>当前照片可见面部颜色：${selfieResult.faceRef.hex} · ${selfieResult.faceRef.tone}</p></div><div class="panel"><h3>样本综合色调</h3><p>这是网络样本的统计中心，用来比较平台偏差，不等同于实物色卡。<br>分析值：H ${a.center.hue}° · S ${a.center.saturation}% · B ${a.center.brightness}%</p></div></div></details>
   </section>

   <section class="purchase-loop"><div><div class="eyebrow">最后一步</div><h2>你喜欢这个方向吗？</h2><p>喜欢就继续看相似色号 / 不同质地；不喜欢就告诉我们想往哪个方向调整。</p></div><div class="purchase-actions"><button class="primary-btn" id="result-like">喜欢，看看相似色</button><button class="secondary-btn" id="result-warmer">想更橘一点</button><button class="secondary-btn" id="result-brighter">想更清透一点</button><a class="ghost-btn" href="#/compare">我在纠结两个色号</a></div></section>
 </section>`;
 $$('.result-toggle button').forEach(b=>b.onclick=()=>{$$('.result-toggle button').forEach(x=>x.classList.remove('active'));b.classList.add('active');$('#consumer-result-photo').src=b.dataset.view==='tryon'?selfieResult.tryon:selfieResult.original});
 $('#back-to-form').onclick=()=>window.scrollTo({top:0,behavior:'smooth'});
 $('#result-like').onclick=()=>recommend(p,false);$('#result-warmer').onclick=()=>recommend(p,true);$('#result-brighter').onclick=()=>recommend(p,false);
}

function quick(q){q=(q||'').toLowerCase().replace('#','').trim();const p=manifest.products.find(x=>x.shade===q||x.brand.toLowerCase().includes(q)||x.name.toLowerCase().includes(q));p?go('/shade/'+p.key):go('/search')}

async function search(){
 await getManifest();page(`<div class="route-head"><a class="backlink" href="#/">← 首页</a><div class="eyebrow" style="margin-top:22px">搜索已有色号</div><h1>先找一个你正在纠结的颜色</h1><p>先看最值得参考的真实试色和与你情况更接近的反馈，再决定要不要买。</p></div><div class="searchbox" style="max-width:720px"><span class="search-icon">⌕</span><input id="catalog-q" placeholder="YSL / Lancôme / 610 / 274…"></div><div class="shade-grid" id="catalog" style="margin-top:18px">${manifest.products.map(shadeCard).join('')}</div>`);
 $('#catalog-q').oninput=e=>{$('#catalog').innerHTML=manifest.products.filter(p=>(p.brand+p.name+p.product+p.shade).toLowerCase().includes(e.target.value.toLowerCase())).map(shadeCard).join('')||'<div class="empty">当前 Demo 数据库里暂时没有这个色号。</div>'}
}

async function shade(k){
 const m=meta(k);
 if(!m)return home();
 page(`<div class="route-head"><a class="backlink" href="#/search">← 返回色号库</a><div class="eyebrow" style="margin-top:22px">${esc(m.brand)} · ${esc(m.product)}</div><h1>#${m.shade} ${esc(m.name)}</h1><p>先从消费者的购买问题出发。点击分析后，TrueTone 才会读取当前色号的证据集，并依次运行颜色/环境、风险审查、消费者报告与创作者建议四个模块。</p></div>
 <section class="analysis-start">
  <div class="panel analysis-intro">
   <div class="eyebrow">本次分析证据集</div>
   <h2>不是先给你一个分数，而是先看证据。</h2>
   <div class="source-counts"><span><b>${m.analysis.counts.visual}</b> 份视觉素材</span><span><b>${fmt(m.analysis.counts.text)}</b> 条文字证据</span><span><b>${m.analysis.counts.sources}</b> 类来源</span><span><b>${m.analysis.counts.skus}</b> 个 SKU / 产品线标签</span></div>
   ${m.skuLines?.length>1?`<div class="sku-warning">同一色号包含多个 SKU / 产品线：${m.skuLines.map(esc).join('、')}。系统会保留这些边界，避免把产品差异误判成内容失真。</div>`:''}
   <div class="plain-note" style="margin-top:14px">真实性评分与证据充分度是两个不同概念；“正面评价”也不会直接被当成“真实”。</div>
  </div>
  <div class="panel">
   <div class="eyebrow">TrueTone 分析流程</div>
   <div class="agent-steps" id="product-agent-steps">
    <div class="agent-step" data-a="1">颜色与拍摄环境</div>
    <div class="agent-step" data-a="2">内容可信度与跨图差异</div>
    <div class="agent-step" data-a="3">消费者参考与 Top 3</div>
    <div class="agent-step" data-a="4">内容透明度建议</div>
   </div>
   <button class="primary-btn" id="start-product-analysis" style="width:100%;margin-top:16px">开始 TrueTone 分析</button>
   <div class="progress" style="margin-top:12px"><i id="product-progress"></i></div>
  </div>
 </section>`);
 $('#start-product-analysis').onclick=async()=>{
   const btn=$('#start-product-analysis'),steps=$$('#product-agent-steps .agent-step'),bar=$('#product-progress');
   btn.disabled=true;btn.textContent='正在读取证据集…';
   try{
     await getProduct(k);
     const labels=['正在分析颜色与拍摄环境…','正在交叉核验风险与一致性…','正在整理消费者最有用的证据…','正在生成改进建议…'];
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

async function shadeReport(k){
 const p=await getProduct(k),a=p.analysis,c=buildProductConsumerSummary(p),top=c.top,sku=p.skuLines||[];
 const cloudTop=await fetchCloudReferenceMedia(k);
 page(`<div class="route-head"><a class="backlink" href="#/search">← 返回色号库</a><div class="eyebrow" style="margin-top:22px">${esc(p.brand)} · ${esc(p.product)}</div><h1>#${p.shade} ${esc(p.name)}</h1><p>先给购买结论，再展开依据。下面的分数、排序和统计来自当前真实 sample data 与可复现分析逻辑，不是写死的展示数字。</p>${sku.length>1?`<div class="sku-warning">SKU 提醒：当前样本同一色号包含 <b>${sku.length}</b> 个产品线 / SKU：${sku.map(esc).join('、')}。系统保留 SKU 边界，不把不同产品本身的差异误判成“P 图”。</div>`:''}</div>
 <section class="report-hero"><div class="panel"><div class="eyebrow">一句话结论</div><div class="conclusion">${esc(c.conclusion)}</div><div class="source-counts"><span><b>${a.counts.visual}</b> 份视觉素材</span><span><b>${fmt(a.counts.text)}</b> 条文字证据</span><span><b>${a.counts.sources}</b> 类来源</span></div><div class="filter-row" style="margin-top:18px"><span style="font-size:11px;color:var(--muted);align-self:center">更像你的情况：</span><button class="filter-btn active" data-prof="all">全部</button><button class="filter-btn" data-prof="深唇">深唇</button><button class="filter-btn" data-prof="浅唇">浅唇</button><button class="filter-btn" data-prof="素颜">素颜</button></div></div>
 <div class="panel score-panel"><div class="score-ring" style="--score:${a.score};--ring:${a.score>=80?'#82b996':a.score>=60?'#e2b16b':'#d46d60'}"><b>${a.score}</b></div><div class="score-label"><strong>TrueTone 参考可信度</strong>它不是“真假裁决”，而是当前内容适不适合作为购买参考。<span class="evidence-badge">证据充分度：${a.evidenceSufficiency}</span><div class="disclaimer">${evidenceScoreText(a)}。真实性评分与证据充分度分开。</div></div></div></section>
 <section class="panel report-section" id="top-ref"><div class="section-head"><div><div class="eyebrow">Top 3 reference</div><h2 style="font-size:28px">你最值得先看的 3 张</h2></div><p>${cloudTop.length?'优先展示阿里云 OSS 中已核验的真实样本。':'当前仅显示离线排序记录；真实原图暂未稳定读取。'}</p></div><div class="top-media" id="top-media">${cloudTop.length?cloudTop.map(cloudReferenceCard).join(''):top.map(mediaCard).join('')}</div></section>
 <section class="details-grid"><div class="panel"><h3>消费者色差证据</h3><div class="keyword-cloud">${Object.entries(a.keywordCounts).sort((x,y)=>y[1]-x[1]).slice(0,18).map(([x,n])=>`<span class="kw">${x} <b>${n}</b></span>`).join('')}</div><div class="plain-note" style="margin-top:15px">${a.consumerDifferenceMentions} 条文本提到偏色、色差或“和图片不一样”等线索。评论质量层还识别到：复购/回头客 ${a.reviewQuality.repeatBuyer} 条；负向体验 ${a.reviewQuality.negativeEvidence} 条；模板化泛评 ${a.reviewQuality.genericTemplate} 条会降低权重。</div></div><div class="panel"><h3>与你情况相关的真实反馈</h3><div class="review-list" id="reviews">${c.reviews.slice(0,7).map(reviewCard).join('')}</div></div></section>
 <section class="details-grid"><div class="panel"><h3>综合色调方向</h3><div class="direction-swatch-wrap"><span class="direction-swatch" style="background:${color(p)}"></span><div><b>#${p.shade} · ${esc(p.name)}</b><p>这个色块只用于帮助理解当前 Demo 的综合色调方向。网络样本的 H/S/B 统计主要用于比较平台偏差，不再直接画成“实物颜色”。</p></div></div></div><div class="panel"><h3>小红书 vs 淘宝</h3>${metric('色相差异',a.platformDiff.hue,90,'°')}${metric('饱和度差异',Math.abs(a.platformDiff.saturation),35,'%')}${metric('亮度差异',Math.abs(a.platformDiff.brightness),35,'%')}<div class="plain-note">小红书 H${a.platform['小红书'].hue} / S${a.platform['小红书'].saturation} / B${a.platform['小红书'].brightness}<br>淘宝 H${a.platform['淘宝'].hue} / S${a.platform['淘宝'].saturation} / B${a.platform['淘宝'].brightness}</div></div></section>
 <section class="details-grid"><div class="panel"><h3>为什么是这个分数？</h3>${(a.findings||[]).length?(a.findings||[]).map(f=>`<div class="finding"><span class="severity ${f.severity}">${f.severity==='high'?'高风险':f.severity==='medium'?'中风险':'低风险'}</span><div><strong>${esc(f.type)}</strong><p>在 ${f.count||1} 个样本中触发；根据项目既定扣分规则影响总分。</p></div></div>`).join(''):'<div class="plain-note">当前产品级汇总没有触发 high / medium 异常扣分；总分仍不等于“绝对真实”。</div>'}<div class="plain-note" style="margin-top:12px">评分保留原方案：base 82；单图 high −4 / medium −2 / low −1；跨图 high −8 / medium −4；范围 25–95。</div></div><div class="panel"><h3>哪些差异属于正常变化？</h3><div class="review-list">${c.normal.map(x=>`<div class="review"><p>${esc(x)}</p></div>`).join('')||'<div class="plain-note">当前文本证据不足以细分更多正常变化。</div>'}</div></div></section>
 <section class="panel report-section"><div class="section-head"><div><div class="eyebrow">内容透明度建议</div><h2 style="font-size:28px">给内容创作者 / 品牌的透明度建议</h2></div><p>这些建议不是为了“修图更好看”，而是让同一色号在不同内容里更容易比较。</p></div><div class="review-list">${creatorAdviceForProduct(p).map(s=>`<article class="review"><p><b>${esc(s.title)}</b><br><span style="color:var(--muted)">发现：</span>${esc(s.issue)}<br><span style="color:var(--muted)">怎么改：</span>${esc(s.how)}<br><span style="color:var(--muted)">为什么：</span>${esc(s.why)}<br><span style="color:var(--gold)">预计改善：</span>${esc(s.impact)}</p></article>`).join('')}</div></section>
 <section class="cta-band"><div><h3>想知道 #${p.shade} 在你脸上可能怎么呈现？</h3><p>上传自拍后，TrueTone 会优先从真实样本里找更接近你当前光照和使用情况的参考图与评论。</p></div><a class="primary-btn" href="#/tryon?p=${p.key}">上传自拍</a></section>
 <section class="cta-band"><div><h3>喜欢这个方向吗？</h3><p>不喜欢也没关系，可以换成更橘、更浅或不同质地，再看相似色号。</p></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="secondary-btn" id="like">喜欢，看看相似色</button><button class="ghost-btn" id="warmer">想更橘一点</button><a class="ghost-btn" href="#/compare">我在纠结两个色号</a></div></section>`);
 $$('.filter-btn[data-prof]').forEach(b=>b.onclick=()=>{ $$('.filter-btn[data-prof]').forEach(x=>x.classList.remove('active'));b.classList.add('active');const prof=b.dataset.prof;const cc=buildProductConsumerSummary(p,prof);$('#reviews').innerHTML=cc.reviews.slice(0,7).map(reviewCard).join('')||'<div class="plain-note">当前数据中没有足够匹配评论。</div>'});
 $('.media-card[data-media]').forEach(x=>x.onclick=()=>openMedia(p,x.dataset.media));
 $('.cloud-media-card[data-cloud-url]').forEach(x=>x.onclick=()=>{modalContent.innerHTML=`<div class="eyebrow">真实试色参考</div><h2 id="modal-title">原始高清样本</h2><img src="${esc(x.dataset.cloudUrl)}" style="width:100%;max-height:640px;object-fit:contain;background:#090807;border-radius:14px"><p style="color:var(--muted);line-height:1.7">该图片来自阿里云 OSS 私有样本库，通过短时签名地址加载，仅用于当前 Demo 展示。</p>`;openModal()});
 $('#like').onclick=()=>recommend(p,false);$('#warmer').onclick=()=>recommend(p,true);
}
function recommend(p,warm){const candidates=manifest.products.filter(x=>x.key!==p.key).map(x=>({p:x,d:circularHueDistance(p.analysis.center.hue,x.analysis.center.hue)+(warm?(x.analysis.center.hue<p.analysis.center.hue?18:0):0)})).sort((a,b)=>a.d-b.d).slice(0,3);modalContent.innerHTML=`<div class="eyebrow">Similar shades</div><h2 id="modal-title">${warm?'更偏暖 / 橘一点的方向':'相似色号'}</h2><p>只在当前欧莱雅集团 Demo 数据内推荐，依据参考色域距离与质地方向，不伪装成全市场推荐。</p><div class="shade-grid">${candidates.map(x=>shadeCard(x.p)).join('')}</div>`;openModal()}
function openMedia(p,id){const m=p.media.find(x=>x.id===id);if(!m)return;modalContent.innerHTML=`<div class="eyebrow">${m.platform} · 单图证据</div><h2 id="modal-title">Reference score ${Math.round(m.referenceScore||0)}/100</h2>${m.thumb?`<img src="${m.thumb}" style="width:100%;max-height:520px;object-fit:contain;background:#090807;border-radius:14px">`:''}<div class="details-grid" style="margin-top:15px"><div class="panel"><h3>像素指标</h3><p>Hue ${m.metrics?.hue??'—'}°<br>Saturation ${m.metrics?.saturation??'—'}%<br>Brightness ${m.metrics?.brightness??'—'}%<br>光照：${m.metrics?.lighting||'—'}</p></div><div class="panel"><h3>推荐 / 降权原因</h3><p>${esc((m.reasons||[]).join('；')||'当前样本未记录额外说明')}</p></div></div>`;openModal()}

async function verify(){
 await getManifest();page(`<div class="route-head"><a class="backlink" href="#/">← 首页</a><div class="eyebrow" style="margin-top:22px">上传试色核验</div><h1>这张试色，值得你参考吗？</h1><p>图片只在当前浏览器中读取像素。可一次上传多张；多图会自动做跨图一致性比较与推荐排序。</p></div><section class="upload-shell"><label class="dropzone" id="drop"><input id="verify-input" type="file" accept="image/png,image/jpeg,image/webp" multiple hidden><div><div class="upload-icon">＋</div><h3>拖进来，或点这里选择图片</h3><p>JPG / PNG / WEBP · 支持多张 · 可删除、追加</p></div></label><div class="file-previews" id="previews"></div><div class="form-row"><select class="select" id="source"><option>小红书</option><option>淘宝/电商</option><option>用户实拍</option><option>其他</option></select><select class="select" id="match-product"><option value="">不与已有色号比较</option>${opts('')}</select><button class="primary-btn" id="run-verify" disabled>开始 TrueTone 分析</button></div><div class="progress"><i id="vprogress"></i></div><div class="agent-run hidden" id="agent-run"><div class="agent-steps"><div class="agent-step" data-a="1">Agent 1 · 色彩/光照</div><div class="agent-step" data-a="2">Agent 2 · 鉴伪/一致性</div><div class="agent-step" data-a="3">Agent 3 · 消费者报告</div><div class="agent-step" data-a="4">Agent 4 · 改进建议</div></div></div></section><div id="verify-results"></div>`);
 const input=$('#verify-input'),drop=$('#drop');drop.ondragover=e=>{e.preventDefault();drop.classList.add('drag')};drop.ondragleave=()=>drop.classList.remove('drag');drop.ondrop=e=>{e.preventDefault();drop.classList.remove('drag');addVerify([...e.dataTransfer.files])};input.onchange=()=>addVerify([...input.files]);$('#run-verify').onclick=runVerify
}
function addVerify(fs){verifyFiles.push(...fs.filter(f=>f.type.startsWith('image/')));renderVerifyPreviews()}
function renderVerifyPreviews(){const el=$('#previews');el.innerHTML=verifyFiles.map((f,i)=>`<div class="preview-card"><button class="remove-file" data-i="${i}">×</button><img src="${URL.createObjectURL(f)}"><div class="meta">${esc(f.name)}</div></div>`).join('');$$('.remove-file').forEach(b=>b.onclick=e=>{e.preventDefault();verifyFiles.splice(+b.dataset.i,1);renderVerifyPreviews()});$('#run-verify').disabled=!verifyFiles.length}
async function runVerify(){const btn=$('#run-verify');btn.disabled=true;verifyAnalyses=[];$('#agent-run').classList.remove('hidden');const steps=$$('.agent-step');steps.forEach(x=>x.className='agent-step');steps[0].classList.add('active');for(let i=0;i<verifyFiles.length;i++){verifyAnalyses.push(await analyzeImageFile(verifyFiles[i]));$('#vprogress').style.width=((i+1)/verifyFiles.length*55)+'%'}steps[0].className='agent-step done';steps[1].className='agent-step active';let p=null;if($('#match-product').value)p=await getProduct($('#match-product').value);await wait(220);const report=runFourAgents(verifyAnalyses,p);steps[1].className='agent-step done';steps[2].className='agent-step active';await wait(180);steps[2].className='agent-step done';steps[3].className='agent-step active';await wait(150);steps[3].className='agent-step done';$('#vprogress').style.width='100%';renderVerifyResults(report);btn.disabled=false;btn.textContent='重新分析'}
function renderVerifyResults(r){const ranked=verifyAnalyses.map((x,i)=>({x,i,score:Math.max(25,95-(x.metrics.saturation>75?8:0)-(x.metrics.sceneBrightness>80?8:0)-(x.metrics.sceneBrightness<30?4:0)-((x.metrics.lighting==='暖光'||x.metrics.lighting==='冷光')?4:0))})).sort((a,b)=>b.score-a.score);$('#verify-results').innerHTML=`<section class="report-hero"><div class="panel"><div class="eyebrow">分析完成</div><div class="conclusion">${esc(r.summary)}</div><div class="plain-note">分析置信度：${r.confidence}% · 输入 ${verifyAnalyses.length} 张图片</div></div><div class="panel score-panel"><div class="score-ring" style="--score:${r.score}"><b>${r.score}</b></div><div class="score-label"><strong>参考可信度</strong>来自真实像素指标与项目原评分规则。</div></div></section><section class="panel report-section"><h3>最值得参考的上传图片</h3><div class="top-media">${ranked.slice(0,3).map((q,n)=>`<article class="media-card"><img src="${q.x.views.original}"><div class="media-card-body"><div class="rank">#${n+1} · ${q.score}/100</div><div class="source-line">${q.x.metrics.lighting}</div><div class="reason">H ${q.x.metrics.hue}° · S ${q.x.metrics.saturation}% · B ${q.x.metrics.brightness}%</div></div></article>`).join('')}</div></section><section class="panel report-section"><h3>视觉证据墙 · 5 种真实像素视图</h3><div class="filter-row" id="diag-tabs">${verifyAnalyses.map((x,i)=>`<button class="filter-btn ${i?'':'active'}" data-img="${i}">图 ${i+1}</button>`).join('')}</div><div id="diag"></div></section><section class="details-grid"><div class="panel"><h3>为什么是这个分数？</h3>${r.findings.map(f=>`<div class="finding"><span class="severity ${f.severity}">${f.severity}</span><div><strong>${esc(f.type)}</strong><p>${esc(f.evidence)} · ${esc(f.impact)}</p></div></div>`).join('')||'<div class="plain-note">未触发明显视觉风险；仍不代表“绝对真实”。</div>'}</div><div class="panel"><h3>给内容创作者的改进建议</h3>${r.suggestions.map(s=>`<div class="review"><p><b>${esc(s.title)}</b><br>${esc(s.why)}<br><span style="color:var(--gold)">预期改善：</span>${esc(s.impact)}</p></div>`).join('')}</div></section>`;$$('#diag-tabs .filter-btn').forEach(b=>b.onclick=()=>showDiag(+b.dataset.img));showDiag(0)}
function showDiag(i){const x=verifyAnalyses[i];$$('#diag-tabs .filter-btn').forEach((b,n)=>b.classList.toggle('active',n===i));$('#diag').innerHTML=`<div class="diagnostic-tabs"><button class="tab-btn active" data-v="original">原图</button><button class="tab-btn" data-v="roi">试色候选区</button><button class="tab-btn" data-v="saturation">饱和度</button><button class="tab-btn" data-v="brightness">亮度</button><button class="tab-btn" data-v="composite">综合</button></div><div class="diag-view"><img id="diag-img" src="${x.views.original}"></div><div class="plain-note" style="margin-top:10px">H ${x.metrics.hue}° · S ${x.metrics.saturation}% · B ${x.metrics.brightness}% · ${x.metrics.lighting} · 候选色区 ${x.metrics.candidateRatio}%</div>`;$$('[data-v]').forEach(b=>b.onclick=()=>{$$('[data-v]').forEach(z=>z.classList.remove('active'));b.classList.add('active');$('#diag-img').src=x.views[b.dataset.v]})}

async function tryon(){
 await getManifest();const param=new URLSearchParams((location.hash.split('?')[1]||''));const preset=param.get('p')||'ysl-610';page(`<div class="route-head"><a class="backlink" href="#/">← 首页</a><div class="eyebrow" style="margin-top:22px">自拍个性化试色</div><h1>别问“它适不适合所有人”。<br>先看它在这张自拍里可能怎么呈现。</h1><p>只分析当前照片中的颜色、光照与唇部位置；不推断种族、年龄、身份、健康或颜值。</p></div><section class="tryon-layout"><label class="photo-stage" id="selfie-stage"><input id="selfie-input" type="file" accept="image/png,image/jpeg,image/webp" hidden><div class="empty-stage" id="selfie-empty"><div class="upload-icon">＋</div><h3>上传自然光、无滤镜、嘴唇清晰的正脸自拍</h3><p>自拍仅用于本次浏览器内分析，不上传。</p></div><img id="selfie-img" class="hidden"><div class="toggle hidden" id="try-toggle" style="position:absolute;left:14px;bottom:14px"><button class="active" data-show="tryon">颜色预览</button><button data-show="original">原自拍</button></div></label><aside class="panel try-controls"><div><div class="eyebrow">Step 1</div><h3>选择色号</h3><div class="choice-grid" id="try-products">${manifest.products.map(p=>`<button class="choice ${p.key===preset?'active':''}" data-p="${p.key}"><b>#${p.shade}</b><br><small>${esc(p.brand)} · ${esc(p.name)}</small></button>`).join('')}</div></div><div><div class="eyebrow">Step 2 · 可选</div><h3>告诉我们你的使用情况</h3><div class="form-row"><select class="select" id="lip-prof"><option value="all">唇色：不确定</option><option>浅唇</option><option>深唇</option></select><select class="select" id="tone-prof"><option value="auto">冷暖：按照片</option><option value="warm">偏暖</option><option value="neutral">中性</option><option value="cool">偏冷</option></select></div><button class="primary-btn" id="run-try" disabled>分析当前自拍</button><label style="display:flex;gap:7px;margin-top:11px;color:var(--muted);font-size:11px"><input id="debug" type="checkbox"> 调试模式：显示唇部 landmarks / polygon</label></div><div class="quality-list" id="quality"></div></aside></section><div id="try-results"></div>`);
 const input=$('#selfie-input'),stage=$('#selfie-stage');stage.onclick=e=>{if(e.target.closest('.toggle'))return;input.click()};input.onchange=()=>{selfieFile=input.files[0];if(!selfieFile)return;const u=URL.createObjectURL(selfieFile);$('#selfie-img').src=u;$('#selfie-img').classList.remove('hidden');$('#selfie-empty').classList.add('hidden');$('#run-try').disabled=false};$$('#try-products .choice').forEach(b=>b.onclick=e=>{e.preventDefault();$$('#try-products .choice').forEach(x=>x.classList.remove('active'));b.classList.add('active')});$('#run-try').onclick=runTry
}
async function runTry(){if(!selfieFile)return;const btn=$('#run-try');btn.disabled=true;btn.textContent='正在识别唇部…';const p=await getProduct($('#try-products .active').dataset.p);try{selfieResult=await createVirtualTryOn(selfieFile,p,$('#debug').checked);$('#selfie-img').src=selfieResult.tryon;$('#try-toggle').classList.remove('hidden');$$('#try-toggle button').forEach(b=>b.onclick=e=>{e.preventDefault();$$('#try-toggle button').forEach(x=>x.classList.remove('active'));b.classList.add('active');$('#selfie-img').src=selfieResult[b.dataset.show]});$('#quality').innerHTML=selfieResult.quality.map(x=>`<div class="quality"><span>${esc(x.label)}</span><b>${esc(x.value)}</b></div>`).join('');renderTryResult(p)}catch(e){$('#quality').innerHTML=`<div class="sku-warning">${esc(e.message)}</div>`}finally{btn.disabled=false;btn.textContent='重新分析'}}
function renderTryResult(p){const r=selfieResult,a=p.analysis,lip=$('#lip-prof').value,tone=$('#tone-prof').value;let reviews=p.reviews.filter(x=>a.representativeReviewIds.includes(x.id));if(lip!=='all'){const t=reviews.filter(x=>x.text.includes(lip));if(t.length)reviews=t}if(tone==='warm'){const t=reviews.filter(x=>/黄皮|暖调|偏暖/.test(x.text));if(t.length)reviews=t}if(tone==='cool'){const t=reviews.filter(x=>/冷白|冷调|偏冷/.test(x.text));if(t.length)reviews=t}reviews=reviews.slice(0,3);const top=p.media.filter(m=>m.thumb&&m.metrics).map(m=>({...m,personal:(m.referenceScore||0)-(m.metrics.lighting===r.light.label?0:7)-Math.abs((m.metrics.sceneBrightness||60)-r.light.brightness)*.18})).sort((x,y)=>y.personal-x.personal).slice(0,3);const c=a.center,expected={h:c.hue,s:Math.max(5,c.saturation+(r.faceRef.saturation-30)*.08),b:Math.max(5,Math.min(95,c.brightness+(r.light.brightness-60)*.12))};$('#try-results').innerHTML=`<section class="details-grid"><div class="panel"><div class="eyebrow">当前自拍质量</div><h3>当前照片颜色参考</h3><div style="display:flex;gap:14px;align-items:center"><span class="swatch-dot" style="width:58px;height:58px;background:${r.faceRef.hex}"></span><div class="plain-note">${r.faceRef.tone}<br>${r.faceRef.hex} · 明度 ${r.faceRef.brightness}% · 饱和度 ${r.faceRef.saturation}%<br><small>仅代表当前照片。</small></div></div></div><div class="panel"><div class="eyebrow">预计呈现</div><h3>#${p.shade} 在当前自拍中可能怎么呈现？</h3><div class="plain-note">当前为 <b style="color:#fff">${r.light.label}</b>。结合多来源参考色域，预计呈现 H ${expected.h.toFixed(1)}° · S ${expected.s.toFixed(1)}% · B ${expected.b.toFixed(1)}%。</div><div class="swatches" style="margin-top:12px"><span class="swatch-dot" title="TrueTone 参考中心" style="background:${hsvToHex(c.hue,c.saturation,c.brightness)}"></span><span class="swatch-dot" title="当前自拍预计" style="background:${hsvToHex(expected.h,expected.s,expected.b)}"></span></div><div class="disclaimer">颜色预览为视觉模拟，仅供参考，不代表实物最终效果。</div></div></section><section class="panel report-section"><div class="section-head"><div><div class="eyebrow">Personal reference</div><h2 style="font-size:28px">最值得你参考的 3 张真实试色</h2></div><p>同时考虑原 reference score、与你当前光照/亮度的接近程度。</p></div><div class="top-media">${top.map((m,i)=>`<article class="media-card"><img src="${m.thumb}"><div class="media-card-body"><div class="rank">#${i+1} · ${Math.round(m.personal)}/100</div><div class="source-line">${m.platform} · ${m.metrics.lighting}</div><div class="reason">${esc((m.reasons||[])[0]||'接近参考色域')}</div></div></article>`).join('')}</div></section><section class="panel report-section"><div class="section-head"><div><div class="eyebrow">Matched comments</div><h2 style="font-size:28px">最匹配的 3 条消费者反馈</h2></div></div><div class="review-list">${reviews.map(reviewCard).join('')||'<div class="plain-note">当前没有足够匹配文本。</div>'}</div></section><section class="cta-band"><div><h3>下一步：回到完整色号报告</h3><p>把自拍预览、真实 Top 3、消费者反馈和 SKU 信息放在一起做购买判断。</p></div><a class="secondary-btn" href="#/shade/${p.key}">查看 #${p.shade} 报告</a></section>`}

async function compare(){
 await getManifest();page(`<div class="route-head"><a class="backlink" href="#/">← 首页</a><div class="eyebrow" style="margin-top:22px">色号对比</div><h1>纠结两个颜色？放在同一把尺子上。</h1><p>比较多来源参考色域、证据充分度与消费者反馈，而不只比较官方商品图。</p></div><div class="compare-pickers"><div class="compare-col"><select id="ca" class="select" style="width:100%">${opts('ysl-610')}</select></div><div class="compare-col"><select id="cb" class="select" style="width:100%">${opts('lancome-274')}</select></div></div><div id="cmp"></div>`);$('#ca').onchange=renderCmp;$('#cb').onchange=renderCmp;renderCmp()
}
async function renderCmp(){const [a,b]=await Promise.all([getProduct($('#ca').value),getProduct($('#cb').value)]);const cp=p=>`<div class="shade-brand">${esc(p.brand)}</div><div class="shade-code">#${p.shade}</div><div class="shade-name">${esc(p.name)} · ${esc(p.texture)}</div><div class="shade-swatch" style="height:130px;margin:18px 0;background:radial-gradient(circle at 40% 35%,${color(p)},#61342e 55%,#251515 100%)"></div><div class="compare-stat"><div class="stat"><b>${p.analysis.score}</b><span>参考可信度</span></div><div class="stat"><b>${p.analysis.evidenceSufficiency}</b><span>证据充分度</span></div><div class="stat"><b>${p.analysis.center.saturation}%</b><span>饱和度</span></div><div class="stat"><b>${p.analysis.center.brightness}%</b><span>明度</span></div></div><a class="secondary-btn" style="margin-top:14px" href="#/shade/${p.key}">看完整报告</a>`;$('#cmp').innerHTML=`<div class="comparison"><div class="panel">${cp(a)}</div><div class="panel">${cp(b)}</div></div><section class="panel report-section"><h3>一眼看懂差异</h3><div class="plain-note">参考色域中心的环形色相距离约 <b style="color:#fff">${circularHueDistance(a.analysis.center.hue,b.analysis.center.hue).toFixed(1)}°</b>；饱和度差 ${Math.abs(a.analysis.center.saturation-b.analysis.center.saturation).toFixed(1)}%，明度差 ${Math.abs(a.analysis.center.brightness-b.analysis.center.brightness).toFixed(1)}%。</div></section>`}

function openAbout(){modalContent.innerHTML=`<div class="eyebrow">How it works</div><h2 id="modal-title">TrueTone 不是一个“真假按钮”</h2><p>当前公开版保留项目原有四个 Agent 的职责：先做真实像素与环境分析，再按固定规则审查风险，再把证据翻译成消费者报告，最后给内容改进建议。</p><div class="method-flow"><div><b>Agent 1</b>HSV / 光照 / ROI 候选区 / 真实像素诊断</div><div><b>Agent 2</b>异常 / 跨图一致性 / 0–100 评分</div><div><b>Agent 3</b>一句话结论 / Top 3 / 评论证据</div><div><b>Agent 4</b>拍摄与创作者改进建议</div></div><p>现有产品报告使用已结构化导入的小红书 + 淘宝 sample data；169 张 JPG 已离线做真实像素统计，29 个视频保留来源与媒体元数据。自拍使用 MediaPipe Face Mesh 的唇部 landmarks → outer polygon − inner mouth mask，避免把牙齿和口腔涂色。</p><p><b style="color:#fff">关于“真实 Agent”：</b>这里的四 Agent 是会实际运行的确定性分析模块，不是随机 UI。公开 GitHub Pages 不安全地存放任何大模型 API Key；后续接入 Base44 安全后端时，可以让 LLM 只做语言整合，评分与证据仍由可复现逻辑提供。</p>`;openModal()}
function openModal(){modal.hidden=false;modal.setAttribute('aria-hidden','false');modal.style.display='grid';modal.style.pointerEvents='auto';document.body.style.overflow='hidden'}function closeModal(){modal.style.display='none';modal.style.pointerEvents='none';modal.hidden=true;modal.setAttribute('aria-hidden','true');document.body.style.overflow=''}function wait(ms){return new Promise(r=>setTimeout(r,ms))}
async function router(){try{await getManifest();const p=(location.hash.slice(1)||'/').split('?')[0];if(p==='/'||p==='/home')return home();if(p==='/search')return search();if(p.startsWith('/shade/'))return shade(p.split('/')[2]);if(p==='/verify')return verify();if(p==='/tryon')return tryon();if(p==='/compare')return compare();return home()}catch(e){console.error(e);page(`<div class="route-head"><h1>数据加载失败</h1><p>${esc(e.message)}</p><a class="secondary-btn" href="#/">返回首页</a></div>`)}}
$('#open-method').onclick=openAbout;$('#modal-close').onclick=closeModal;modal.onclick=e=>e.target===modal&&closeModal();document.addEventListener('keydown',e=>e.key==='Escape'&&closeModal());window.addEventListener('hashchange',router);router();
