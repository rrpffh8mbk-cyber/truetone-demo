// A downloadable brief for a brand's content team. No campaign is launched,
// and suggested validation metrics are not claimed business outcomes.
export function buildBrandActionPlan(product){
 const reviews=(product.reviews||[]).filter(r=>r.product_scope==='target_context'&&r.variant_scope!=='cross_variant');
 const actions=[];
 const add=(id,issue,action,check,evidence)=>actions.push({id,issue,action,check,evidence});
 if(product.key==='lancome-274')add('version','同号多个版本可能混在一起讨论',
  '商品页和达人试色首屏标明产品线、包装与版本；分版本引用图片和评价。',
  '检查新版素材版本信息完整率；分版本重算色差和评价归属，不以家族平均值代替。',
  {versions:['cream','cream_gift','intimatte'],sampleIds:product.colorReference?.samples?.map(s=>s.id)||[]});
 const diff=product.analysis?.platformDiff;
 if(diff&&(diff.hue>20||Math.abs(diff.brightness)>15||Math.abs(diff.saturation)>15))add('shooting','两类平台的照片呈现存在可见差异',
  '补拍同一版本、同一涂抹厚度和稳定光源下的对照图；并列展示而非选最艳的一张。',
  '新旧素材按同一唇部算法比较颜色差异；独立人工评估是否更容易理解。',
  {platformDifference:diff,sampleIds:product.colorReference?.samples?.map(s=>s.id)||[]});
 for(const [topic,label] of [['dryness','干燥与唇纹'],['transfer','沾杯'],['oxidation','使用后变色']]){
  const rows=reviews.filter(r=>r.topics?.some(t=>t.key===topic&&t.polarity==='reported'));
  if(rows.length)add(topic,`有 ${rows.length} 条记录提到${label}（不是发生率）`,
   `补充${label}的使用条件和对照；保留正反体验，避免绝对性能承诺。`,
   '先核验版本与描述上下文，再组织统一条件的实际使用测试；不把评论数当实验结论。',
   {reviewIds:rows.map(r=>r.id),examples:rows.slice(0,2).map(r=>({id:r.id,text:r.text,platform:r.platform,variant:r.variant}))});
 }
 if(!actions.length)add('context','现有素材的使用条件未全部确认',
  '在新素材中标注原生唇色、涂抹厚度、版本与拍摄条件，并保留原图。',
  '检查条件字段完整率和条件相近的可用样本数量。',
  {sampleIds:product.colorReference?.samples?.map(s=>s.id)||[]});
 return {schema:'truetone-brand-brief-v1',productKey:product.key,productName:product.brand+' #'+product.shade,
  basis:'当前四个色号的已筛选图像与可追溯评价；不是总体市场推断',
  status:'建议待执行，未部署到品牌系统，未验证转化提升',actions,
  nextValidation:'组织独立人工盲评；之后再以同条件 A/B 测试比较理解度、退换原因与转化，记录样本量和不确定性。'};
}
