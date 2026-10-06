import assert from 'node:assert/strict';
import fs from 'node:fs';
import {attachLibraryLabels,profileTagMatch,rankReferenceMedia} from '../library-tags.js';

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
const neutral={id:'neutral',colorDistance:0};
assert.equal(rankReferenceMedia([neutral,tagged],profile)[0],tagged);
assert.equal(rankReferenceMedia([neutral,tagged],null)[0],neutral);
assert.equal(tagged.referenceScore,43,'Profile preference must not change color similarity');
assert.equal(rankReferenceMedia([neutral,weak],profile)[0],neutral);
console.log('PASS complete catalog, text precedence, native-lip abstention, unchanged exclusions and profile ranking');
