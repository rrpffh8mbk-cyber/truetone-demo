import {extractAuthorTags,reviewTextAssessment} from './review-text.js';

export const ASSESSMENT_VERSION='evidence-reference-v1';
export function detectProductVariant(text=''){
 const t=String(text);
 if(/粉金管|intimatte/i.test(t))return {id:'intimatte',label:'粉金管唇膏 #274',confidence:'高'};
 if(/声色|原声裸茶|cream.?gift/i.test(t))return {id:'cream_gift',label:'「声色」限定 #274 原声裸茶',confidence:'高'};
 if(/黑管哑光|奶茶裸|\bcream\b/i.test(t))return {id:'cream',label:'黑管哑光 #274 奶茶裸',confidence:'高'};
 if(/唇釉|镜面|小蛮腰/.test(t))return {id:'legacy',label:'历史/其他 274 产品线',confidence:'中'};
 return {id:'unknown',label:'无法仅凭当前文字确定版本',confidence:'低'};
}

// Fixed, inspectable rubric. No case IDs, target scores or product-specific weights.
// A negative experience is information, not evidence that its author is unreliable.
export function assessEvidenceText(text,product={}){
 const t=String(text||'').trim(),assessment=reviewTextAssessment(t),authorTags=extractAuthorTags(t);
 const tags=Object.fromEntries(Object.entries(authorTags).map(([k,v])=>[k,v.value]));
 if(/薄涂/.test(t))tags.application='薄涂';else if(/厚涂/.test(t))tags.application='厚涂';
 if(/暖光|黄光/.test(t))tags.lighting='室内暖光';
 else if(/冷光|白光/.test(t))tags.lighting='室内冷光';
 else if(/自然光|日光/.test(t))tags.lighting='自然光';
 const bounded=/对我(?:来说)?|在我(?:这里|原生唇色)|我觉得|我个人|可能|因人而异|最好.*参考|唇部状态|记得打底/.test(t);
 const observedNegative=assessment.topics.some(z=>z.polarity==='reported')||/显唇纹|能看到.*唇纹/.test(t);
 const observedPositive=/颜色好看|颜色真的|顺滑|好晕染|提气色|滋润|喜欢|会回购|真爱色/.test(t);
 const criteria=[
  {label:'本人唇色、肤色与妆面',earned:Object.keys(authorTags).length*10,max:30},
  {label:'涂抹厚度',earned:tags.application?10:0,max:10},
  {label:'具体颜色描述',earned:/奶茶|肉桂|蜜桃|(?:偏|带点|调|色)[粉橘棕红紫]|[粉橘棕红紫]调/.test(t)?12:0,max:12},
  {label:'时间或使用变化',earned:/半小时|\d+\s*(?:分钟|小时)|成膜|氧化|喝水|出门后/.test(t)?12:0,max:12},
  {label:'可比较的使用体验',earned:assessment.topics.length||/顺滑|好晕染|唇纹|覆盖力/.test(t)?12:0,max:12},
  {label:'优缺点同时交代',earned:observedNegative&&observedPositive?12:0,max:12},
  {label:'结论说明适用边界',earned:bounded?12:0,max:12}
 ];
 const risks=[];
 const add=(id,pattern,label,severity)=>{
  for(const m of t.matchAll(new RegExp(pattern.source,'g'))){
   const prefix=t.slice(0,m.index).split(/[，,。！？!?；;\n]/).pop();
   if(/并非|不是|不建议|不能保证|不能说|不要说|不要信|别信|别说|不敢说|拒绝|反对/.test(prefix))continue;
   risks.push({id,label,severity,quote:m[0]});break;
  }
 };
 add('universal',/任何肤色|任何妆容|任何人都|谁涂谁(?:显白|好看)|所有人都适合/,'把个体体验说成人人适用','high');
 add('generalization',/不挑皮(?:不挑场合)?/,'适配说法过于宽泛，需要补充使用条件','medium');
 add('performance',/完全不(?:拔干|沾杯|干|掉色)|一点都不(?:干|沾杯)|不会氧化|永不掉色/,'对持妆、舒适度或变色作绝对承诺','high');
 add('whitening',/(?:白|显白)(?:两|二|2)个?度/,'“白两个度”缺少可核验的测量依据','high');
 add('identical',/实物和图片一模一样|和图片一模一样|完全没色差|实物和图一样/,'承诺照片与实物完全一致，忽略拍摄和个体差异','high');
 add('pressure',/闭眼冲|无脑冲|天花板|不买后悔|给我冲|全网都在夸/,'情绪化推荐不能代替使用证据','medium');
 const variant=product.key==='lancome-274'?detectProductVariant(t):null;
 const unresolvedVariant=variant&&['unknown','legacy'].includes(variant.id);
 const uncertainties=[];
 if(/无滤镜|没滤镜|原相机|直出|自然光/.test(t))uncertainties.push('“自然光 / 原相机 / 无滤镜”是作者声明，无法仅凭最终成片验证，也不因此加分。');
 if(unresolvedVariant)uncertainties.push('274 版本无法确定：本次按色号家族解读，不默认某个版本。');
 const topicDefs=[['dryness',/完全不拔干|完全不干|一点都不干/],['transfer',/完全不沾杯|一点都不沾杯/],['oxidation',/不会氧化|不氧化/],['color_difference',/实物和图片一模一样|和图片一模一样|完全没色差|实物和图一样/]];
 const counterEvidence=[];
 for(const [topic,re] of topicDefs)if(re.test(t)){
  const matches=(product.reviews||[]).filter(r=>r.product_scope==='target_context'&&r.variant_scope!=='cross_variant'&&
   (!variant||variant.id==='unknown'||r.variant===variant.id)&&
   r.topics?.some(z=>z.key===topic&&z.polarity==='reported')).slice(0,2);
  for(const r of matches)counterEvidence.push({reviewId:r.id,topic,platform:r.platform,variant:r.variant,text:r.text,provenance:r.provenance||null});
 }
 const informationScore=criteria.reduce((sum,c)=>sum+c.earned,0);
 const highRisks=risks.filter(r=>r.severity==='high').length;
 const penalty=highRisks*15+risks.filter(r=>r.severity==='medium').length*8+(unresolvedVariant?8:0);
 // Risk caps prevent rich marketing copy from overwhelming absolute promises.
 const cap=highRisks>=2?35:highRisks?65:100;
 const score=Math.round(Math.min(cap,Math.max(0,informationScore-penalty)));
 const flags=risks.map(r=>r.label+'：“'+r.quote+'”。');
 const strengths=criteria.filter(c=>c.earned).map(c=>c.label+'有具体信息。');
 return {rawText:t,version:ASSESSMENT_VERSION,score,informationScore,criteria,penalty,cap,risks,flags,strengths,tags,authorTags,uncertainties,counterEvidence,variant,
  riskLevel:highRisks?'high':risks.length||unresolvedVariant?'medium':'low',
  contextHits:Object.values(tags),agreement:null};
}

export function evidenceDecision(textReport,imageScore,hasImage=false){
 if(textReport?.riskLevel==='high')return {level:'caution',title:'这条种草的承诺过满，建议先核对证据',detail:'即使照片颜色接近标准图，也不能证明“人人适用”或绝对性能承诺。先看下面的原文风险和消费者反馈。'};
 if(textReport?.variant?.id==='unknown'||textReport?.variant?.id==='legacy')return {level:'clarify',title:'先确认 274 的版本，再看这些体验是否适用',detail:'正文有可参考的信息，但同号不同版本不能混在一起评价。当前保留家族级结论。'};
 if(hasImage&&Number.isFinite(imageScore)&&imageScore<50)return {level:'caution',title:'文字可以参考，照片颜色需要另找依据',detail:'这张图的唇部颜色偏离标准图；光线、涂法和原生唇色都可能影响结果，不能据此判定造假。'};
 if(textReport?.score>=70)return {level:'reference',title:'这条体验条件具体，值得进一步对照',detail:'具体条件和正反体验增加了可参考信息；仍要对照照片、产品版本和与你相近的人。高分不代表作者真实或产品一定适合你。'};
 return {level:'clarify',title:'先补充使用条件，再决定参考多少',detail:hasImage&&imageScore===null?'唇部未可靠识别，未计算颜色相似度。现有文字仍可单独阅读。':'目前信息不足以给出强结论，可以优先看下面的真实图片与具体评价。'};
}
