// Author tags and suitability opinions are different kinds of evidence.
const LABEL_PATTERNS={
  lip:[['深唇',/(?:我(?:这种|这个|也|就)?(?:是|属于)?|本人(?:是)?|自己是|本)深唇|(?:我(?:的|本身)?|本人)(?:原生)?唇色(?:本身)?(?:是|比较|偏|很|有点|特别)?(?:深|重)/],['浅唇',/(?:我(?:这种|这个|也|就)?(?:是|属于)?|本人(?:是)?|自己是|本)浅唇|(?:我(?:的|本身)?|本人)(?:原生)?唇色(?:本身)?(?:是|比较|偏|很|有点|特别)?(?:浅|淡)/],['中唇',/(?:我是?|本人是?)中唇|(?:我的?|本人)唇色(?:是)?中等/]],
  skin:[['白皙',/(?:我(?:(?:也|就|算)是|是)?|本人是?|自己是|本)(?:个)?(?:黄一白|黄二白|冷白皮|暖白皮|白皮|白皙)/],['黄皮',/(?:我(?:(?:也|就|算)是|是)?|本人是?|自己是|本)(?:个)?(?:黄皮|自然偏黄)/],['黑皮',/(?:我(?:(?:也|就|算)是|是)?|本人是?|自己是|本)(?:个)?黑皮/]],
  makeup:[['素颜',/(?:我(?:是|平时|今天)?|本人|今天|这次|纯|现在)(?:都是?|是|就)?素颜|素颜(?:浅|薄|厚)?涂了/],['淡妆',/(?:我(?:今天|平时)?|本人|今天|这次)(?:化|画|是|带|化了)?(?:淡妆|通勤妆|日常妆)/],['浓妆',/(?:我(?:今天|平时)?|本人|今天|这次)(?:化|画|是|带|化了)?浓妆/]]
};
export function extractAuthorTags(text){
  const result={};
  // Enumerated self-reports stop before the next clause: recommendations to
  // other people ("我是黄皮，深唇慎入") must not become the author's lip tag.
  const self=String(text||'').match(/(?:我是|本人是)([^，,。；;\n]{1,25})/);
  if(self&&/[、\/]/.test(self[1])){
    const lips=['浅唇','中唇','深唇'].filter(value=>self[1].split(/[、\/]/).includes(value));
    if(lips.length===1)result.lip={value:lips[0],confidence:'high',basis:'comment_self_report',evidence_quote:self[0]};
  }
  const makeup=String(text||'').match(/(?:我(?:平时)?|平时)(?:基本|一般|通常)(?:都是|是|化)?(淡妆|浓妆|素颜)/);
  if(makeup)result.makeup={value:makeup[1],confidence:'high',basis:'comment_self_report',evidence_quote:makeup[0]};
  const compound=String(text||'').match(/(?:我(?:也|就)?是?|本人是?)(?:黄皮|白皮|黄一白|黄二白|冷白皮|暖白皮)(深唇|浅唇)/);
  if(compound)result.lip={value:compound[1],confidence:'high',basis:'comment_self_report',evidence_quote:compound[0]};
  for(const [field,patterns] of Object.entries(LABEL_PATTERNS)){
    const hits=patterns.flatMap(([value,re])=>{const m=String(text||'').match(re);return m?[{value,confidence:'high',basis:'comment_self_report',evidence_quote:m[0]}]:[]});
    // Contradictory self-reports require review rather than first-match selection.
    if(hits.length===1)result[field]=hits[0];
    else if(hits.length>1)delete result[field];
  }
  return result;
}

export function reviewTextAssessment(text,{question='',curatedFields=null}={}){
  const t=String(text||'').trim();
  const tags=curatedFields?Object.fromEntries(Object.entries(curatedFields).filter(([k,v])=>['lip','skin','makeup'].includes(k)&&v.value!=='不确定')):extractAuthorTags(t);
  const clauses=t.split(/[。！？!?；;，,\n]/).filter(Boolean),topics=[];
  const topicsDef=[
    ['dryness','拔干',/拔干|干燥|太干|很干|有点干/,/不(?:太|会|怎么|容易|是很|觉得)?(?:拔干|干燥|干)|没有.*干|挺润|滋润/],
    ['transfer','沾杯',/沾杯|掉色/,/不(?:太|会|怎么|容易)?(?:沾杯|掉色)|没有.*(?:沾杯|掉色)/],
    ['oxidation','氧化',/氧化|成膜.*(?:变|深|浅)/,/不(?:会)?氧化|没有.*氧化/],
    ['color_difference','色差',/色差|颜色.*(?:不一样|相差|差距)|(?:图片|实物).*不一样|偏色/,/没有.*色差|(?:无|没|不大|没有)色差|色差不大|和(?:图片|实物).*(?:一样|一致)/]
  ];
  for(const [key,label,yes,no] of topicsDef){
    const observed=clauses.filter(c=>yes.test(c)||no.test(c));
    for(const quote of observed)topics.push({key,label,polarity:no.test(quote)?'denied':'reported',evidence_quote:quote});
  }
  const substantive=/上嘴|上唇|唇色|深唇|浅唇|黄皮|白皮|素颜|薄涂|厚涂|成膜|氧化|沾杯|拔干|滋润|色差|黏腻|黏|起皮|唇纹|持久|易推开|香味|味道|显白|显黑|显老|荧光|偏(?:红|橘|棕|粉|紫)|不适合|不合适|涂出来/.test(t);
  const riskText=t.replace(/不(?:太|会|怎么)?(?:荧光|显老|显黑)|荧光感不重|没(?:有)?失望|没有踩雷/g,'');
  const negative=/不适合|不合适|不喜欢|不推荐|踩雷|失望|显老|显黑|荧光|不好看|太黏|黏腻|不舒服|不持久|买错|有点干|太干|起皮|不够滋润|难看|遮不住|盖不住|不提气色|不显白/.test(riskText)||topics.some(z=>z.polarity==='reported');
  const futureOnly=/还没(?:用|涂|拆)|尚未使用|希望.*不踩雷/.test(t)&&!substantive;
  const generic=!substantive&&!topics.length&&Object.keys(tags).length===0;
  const claims={};
  const subjects={yellow_skin:/黄皮|黄黑皮/,deep_lip:/深唇|乌唇/,bare_face:/素颜/};
  for(const [key,subject] of Object.entries(subjects)){
    const relevant=clauses.filter(c=>subject.test(c)&&!/吗|求问|适不适合|哪个|好看不|请问|有没有/.test(c));
    const opinions=relevant.map(c=>{
      if(/不适合|不合适|不推荐|慎重|慎入|不友好|没气色|显老|老\d+岁|荧光|踩雷|不显白|不提气色|盖不住|不显色/.test(c))return {stance:'oppose',quote:c};
      if(/适合|合适|友好|显白|天菜|好看|漂亮|满意/.test(c)&&!/不.*(?:适合|合适|友好|好看|显白)/.test(c))return {stance:'support',quote:c};
      return null;
    }).filter(Boolean);
    if(subject.test(question)&&!relevant.length&&!/适不适合|吗|求问/.test(t)){
      if(/^(?:不|不太|不是很)(?:行|可以|适合|合适|好看)/.test(t))opinions.push({stance:'oppose',quote:t});
      else if(/^(?:可以|适合|合适|好看|显白|不错|挺好)(?:$|[，,。.!！～~的呢]|\s)/.test(t)&&!/可以去|应该|不知道|没用过/.test(t))opinions.push({stance:'support',quote:t});
    }
    const stances=new Set(opinions.map(o=>o.stance));
    if(stances.size===1)claims[key]={stance:opinions[0].stance,evidence_quote:opinions[0].quote};
  }
  return {authorTags:tags,topics,claims,genericTemplate:generic,futureOnly,
    negativeEvidence:negative,informationScore:Math.min(100,(substantive?45:10)+Object.keys(tags).length*12+Math.min(20,topics.length*10)+(t.length>60?10:0)),
    questionIsAuthorEvidence:false};
}
