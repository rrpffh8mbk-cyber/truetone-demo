import assert from 'node:assert/strict';
import fs from 'node:fs';
import {attachLibraryLabels,profileTagMatch,rankReferenceMedia,assessReferenceMedia} from '../library-tags.js';

const catalog=JSON.parse(fs.readFileSync(new URL('../data/catalog/sample_tags_v1.json',import.meta.url)));
const usage=JSON.parse(fs.readFileSync(new URL('../data/catalog/sample_usage_v3.json',import.meta.url)));
const records=new Map(catalog.images.map(r=>[r.source_object_key,r]));
assert.equal(records.size,175);
assert.equal(catalog.images.filter(r=>r.role==='sample').length,169);
assert.equal(catalog.images.filter(r=>r.role==='official').length,6);
for(const row of usage.images)assert.equal(records.get(row.source_object_key).use_for_color_reference,row.use_for_color_reference);
for(const row of catalog.images){
  for(const [field,label] of Object.entries(row.labels.fields)){
    assert.ok(catalog.label_options[field].includes(label.value));
    const text=row.review_fields[field];
    if(text.value!=='不确定')assert.equal(label.value,text.value,'Explicit text must override image');
    if(label.basis.startsWith('comment'))assert.ok(row.review_text.raw.includes(label.evidence_quote));
    if(field==='lip'&&label.value!=='不确定')assert.equal(label.basis,'comment_self_report');
  }
  for(const conflict of row.conflicts){
    assert.equal(conflict.resolution,'comment_wins');
    assert.equal(row.tags[conflict.field],conflict.final_value);
    assert.notEqual(conflict.image_value,conflict.final_value);
  }
}
assert.equal(catalog.images.reduce((n,r)=>n+r.conflicts.length,0),7);
assert.equal(catalog.images.filter(r=>r.tags.lip!=='不确定').length,15);
// Recommendation-only wording and deep lip wrinkles cannot become native lip depth.
const wrinkles=catalog.images.filter(r=>r.source_object_key.includes('lancome_274_Intimatte_P11/'));
assert.equal(wrinkles.length,3);
for(const row of wrinkles){
  assert.equal(row.tags.lip,'不确定');
}
const conflicting=catalog.images.find(r=>r.tags.skin==='黑皮');
assert.equal(conflicting.visual.fields.skin.value,'黄皮');
const profile={lip:'深唇',skin:'黑皮',makeup:'素颜'};
const tagged=attachLibraryLabels({object_key:conflicting.source_object_key,colorDistance:17,referenceScore:43},records);
assert.equal(profileTagMatch(tagged,profile),3);
const weak={...tagged,labelFields:Object.fromEntries(Object.entries(tagged.labelFields).map(([k,v])=>[k,{...v,confidence:'low'}]))};
assert.equal(profileTagMatch(weak,profile),0);
assert.equal(profileTagMatch({...tagged,wearerProfileEvidence:false},profile),0);
const make=(id,score,labels)=>({...tagged,id,referenceScore:score,
 metrics:{roiDetected:true,roiSource:'semantic-lips',segmentationConfidence:.99,sceneBrightness:60},
 labelFields:labels,reviewText:{raw:'自然光，本人使用体验',status:'review_body'},reviewFields:{}});
const allMatch=Object.fromEntries(Object.entries(profile).map(([k,value])=>[k,{value,confidence:'high'}]));
const wrong=Object.fromEntries(Object.entries({lip:'浅唇',skin:'白皙',makeup:'浓妆'}).map(([k,value])=>[k,{value,confidence:'high'}]));
const highQuality=make('excellent',100,wrong),matched=make('matched',80,allMatch);
const bad=make('weak-picture',10,allMatch);bad.metrics={...bad.metrics,segmentationConfidence:.1,sceneBrightness:4};
assert.equal(assessReferenceMedia(bad,profile).eligible,false,'Perfect labels cannot rescue a poor picture');
const ranked=rankReferenceMedia([highQuality,matched,bad],profile);
assert.deepEqual(ranked.map(m=>m.id),['matched','excellent'],'Joint score must differ from quality-only ranking');
assert.equal(rankReferenceMedia([highQuality,matched],null)[0].id,'excellent');
assert.equal(ranked[0].referenceScore,80,'Ranking must preserve color similarity');
assert.equal(rankReferenceMedia([{...highQuality,useForColorReference:false}],profile).length,0);
assert.equal(rankReferenceMedia([{...highQuality,wearerProfileEvidence:false}],profile).length,0);
const unknown=make('unknown',100,{});const result=assessReferenceMedia(unknown,profile);
assert.equal(result.match.coverage,0);assert.equal(result.match.score,50);
assert.equal(result.combinedScore,.7*result.qualityScore+.3*50);
assert.deepEqual(Object.keys(result.agents),['colorAnalyst','referenceAuditor','reporter','creatorAdvisor']);
console.log('PASS complete catalog, text priority, quality gate, joint ranking, neutral missing tags and unchanged color scores');
