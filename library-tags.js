// Shared labels for the current reference library. Unknown/weak evidence adds
// no preference, and official/product graphics cannot describe a wearer.
export function attachLibraryLabels(media, records) {
  const key=media.source_object_key||media.object_key;
  const row=records.get(key);
  return row?{...media,semanticTags:row.tags,labelFields:row.labels.fields,
    wearerProfileEvidence:row.wearer_profile_evidence,tagRecordId:row.id,
    reviewText:row.review_text,reviewFields:row.review_fields,textNotes:row.text_notes,
    imageSize:row.image_size,useForColorReference:row.use_for_color_reference,
    sourceImageHash:row.source_image_sha256}:media;
}

export function profileTagMatch(media, profile) {
  if(!profile||!media.wearerProfileEvidence)return 0;
  let matches=0;
  for(const field of ['lip','skin','makeup']){
    const label=media.labelFields?.[field];
    if(profile[field]&&label?.value===profile[field]&&
       ['medium','high'].includes(label.confidence))matches++;
  }
  return matches;
}

const clamp=n=>Math.max(0,Math.min(100,n));
const fieldWeights={lip:.45,skin:.30,makeup:.25};

export function profileTagAssessment(media,profile){
  let score=50,coverage=0;const matched=[],mismatched=[];
  if(profile&&media.wearerProfileEvidence)for(const [field,weight] of Object.entries(fieldWeights)){
    const label=media.labelFields?.[field];
    if(!profile[field]||!label||!['high','medium'].includes(label.confidence)||label.value==='不确定')continue;
    const reliability=label.confidence==='high'?1:.75;
    coverage+=weight*reliability;
    if(label.value===profile[field]){score+=50*weight*reliability;matched.push(label.value)}
    else{score-=50*weight*reliability;mismatched.push(label.value)}
  }
  return {score:clamp(score),coverage,matched,mismatched};
}

// These are deterministic, evidence-based assessments for the four roles;
// they are not four independent model calls or calibrated truth probabilities.
export function assessReferenceMedia(media,profile){
  const m=media.metrics||{},text=media.reviewText?.raw||'';
  const roi=m.roiDetected===true;
  const reliability=roi?(m.roiSource==='mediapipe-lips'?1:Number(m.segmentationConfidence)):0;
  const exposure=Number.isFinite(m.sceneBrightness)?clamp(100-Math.max(0,30-m.sceneBrightness)*3-Math.max(0,m.sceneBrightness-80)*3):0;
  const color=Number.isFinite(media.referenceScore)?clamp(media.referenceScore):
    Number.isFinite(media.colorDistance)?clamp(100*(1-media.colorDistance/30)):0;
  const colorAnalyst=clamp(.55*(Number.isFinite(reliability)?reliability*100:0)+.25*exposure+.20*color);
  const mismatch=(media.textNotes||[]).some(n=>/色号.*(?:不符|不一致|冲突)|(?:评论|文字).*312/.test(n));
  const referenceAuditor=mismatch?0:clamp(.7*color+.3*(media.useForColorReference===true?100:0));
  const fields=Object.values(media.labelFields||{}).filter(l=>l.value!=='不确定'&&['high','medium'].includes(l.confidence)).length;
  const fullText=['review_body','author_body'].includes(media.reviewText?.status);
  const reporter=clamp((roi?40:0)+(fullText?30:text?15:0)+Math.min(30,fields*10));
  const contextual=Object.values(media.reviewFields||{}).filter(l=>l.value!=='不确定'&&l.evidence_quote).length;
  const transparency=clamp((media.source_object_key||media.object_key?30:0)+(fullText?30:text?15:0)+Math.min(30,contextual*10)+(/无滤镜|原相机|原图|自然光/.test(text)?10:0));
  const agents={colorAnalyst,referenceAuditor,reporter,creatorAdvisor:transparency};
  const qualityScore=.4*colorAnalyst+.3*referenceAuditor+.2*reporter+.1*transparency;
  const match=profileTagAssessment(media,profile);
  const eligible=media.useForColorReference===true&&media.wearerProfileEvidence===true&&roi&&qualityScore>=60&&!mismatch;
  const combinedScore=profile&&['lip','skin','makeup'].some(k=>profile[k])?
    .7*qualityScore+.3*match.score:qualityScore;
  const reason=(match.matched.length?'与你的'+match.matched.join('、')+'条件相同。':
    match.coverage?'已结合可用标签比较你的使用条件。':'标签依据不足，主要按图片参考质量排序。')+
    '综合考虑唇部识别、曝光、标准色差和文字说明。';
  return {eligible,agents,qualityScore,match,combinedScore,reason};
}

export function rankReferenceMedia(media, profile) {
  return media.map(m=>({...m,recommendation:assessReferenceMedia(m,profile)}))
    .filter(m=>m.recommendation.eligible)
    .sort((a,b)=>b.recommendation.combinedScore-a.recommendation.combinedScore||
      b.recommendation.qualityScore-a.recommendation.qualityScore||
      (a.colorDistance??Infinity)-(b.colorDistance??Infinity)||String(a.id).localeCompare(String(b.id)));
}
