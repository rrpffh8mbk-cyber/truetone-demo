import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildPersonalColor,personalColorCopy,personalSampleCopy,labToRgb} from '../personal-color.js';
import {rgbToLab,compareLipColor} from '../color-similarity.js';
import {attachLibraryLabels} from '../library-tags.js';
const read=name=>JSON.parse(fs.readFileSync(new URL('../data/catalog/'+name,import.meta.url)));
for(const rgb of [[0,0,0],[255,255,255],[255,0,0],[0,255,0],[0,0,255],[181,104,94]]){
  assert.deepEqual(labToRgb(rgbToLab(rgb)),rgb,'D65 Lab conversion must round-trip');
}
const fields=values=>Object.fromEntries(Object.entries(values).map(([k,value])=>[k,{value,confidence:'high'}]));
const make=(id,labels,lab=[50,25,15],extra={})=>({id,product_key:'ysl-610',thumb:'fixture.jpg',
  sourceImageHash:id,source_object_key:id,wearerProfileEvidence:true,useForColorReference:true,
  metrics:{lab,roiDetected:true,roiSource:'mediapipe-lips',sceneBrightness:60},referenceScore:85,
  labelFields:fields(labels),reviewText:{raw:'自然光本人试色',status:'review_body'},reviewFields:{},...extra});
const profile={lip:'深唇',skin:'黄皮',makeup:'浓妆'};
const full=Array.from({length:12},(_,i)=>make('match-'+i,profile));
const fixture={key:'ysl-610',media:[make('wrong',{lip:'浅唇',skin:'白皙'},[99,-80,80],{referenceScore:100}),
  make('unknown',{},[0,0,0]),make('duplicate',profile,[99,80,80],{sourceImageHash:'match-0'}),
  make('other',profile,[0,0,0],{product_key:'ysl-1936'}),...full]};
const original=JSON.stringify(fixture);
const chosen=buildPersonalColor(fixture,profile);
assert.equal(chosen.usedCount,10);assert.equal(chosen.counts.full,10);
assert.deepEqual(chosen.color.lab,[50,25,15]);
assert.ok(chosen.samples.every(s=>s.id.startsWith('match-')||s.id==='duplicate'));
assert.equal(new Set(chosen.samples.map(s=>s.source_image_sha256)).size,10);
assert.equal(JSON.stringify(fixture),original,'Personal selection must not mutate cached product data');
const scarce=buildPersonalColor({key:'ysl-610',media:full.slice(0,4)},profile);
assert.match(personalColorCopy(scarce).detail,/只找到 4 张.*未凑满 10/);
assert.equal(buildPersonalColor({key:'ysl-610',media:[fixture.media[0]]},profile).color,null);
const weak=make('weak',{lip:'浅唇',skin:'白皙'});weak.labelFields=Object.fromEntries(Object.entries(weak.labelFields).map(([k,v])=>[k,{...v,confidence:'low'}]));
assert.equal(buildPersonalColor({key:'ysl-610',media:[weak]},profile).counts.unknown,1);
assert.equal(buildPersonalColor({key:'ysl-610',media:[make('official',profile,[50,25,15],{wearerProfileEvidence:false})]},profile).usedCount,0);
const robust=buildPersonalColor({key:'ysl-610',media:[...full.slice(0,9),make('outlier',profile,[90,80,-70])]},profile);
assert.deepEqual(robust.color.lab,[50,25,15],'One extreme photo must not determine the color');

const tags=read('sample_tags_v1.json'),references=read('lip_color_reference_v3.json').products;
const records=new Map(tags.images.map(r=>[r.source_object_key,r]));
const product=key=>({key,media:references[key].samples.map(s=>attachLibraryLabels({...s,product_key:key,
  thumb:s.thumbnail,referenceScore:compareLipColor(s.metrics,{...references[key],selectedVariant:s.variant}).score},records))});
let selections=0;
for(const key of Object.keys(references))for(const variant of key==='lancome-274'?['intimatte','cream','cream_gift']:[null])
  for(const lip of ['浅唇','中唇','深唇'])for(const skin of ['白皙','黄皮','黑皮']){
    const result=buildPersonalColor(product(key),{lip,skin},variant);
    assert.ok(result.usedCount<=10);assert.equal(result.usedCount,result.samples.length);
    assert.equal(new Set(result.samples.map(s=>s.source_image_sha256)).size,result.usedCount);
    for(const s of result.samples){
      const row=records.get(s.source_object_key);assert.equal(row.use_for_color_reference,true);assert.equal(row.wearer_profile_evidence,true);
      if(variant)assert.equal(s.variant,variant);
      for(const [field,value] of Object.entries({lip,skin})){
        const label=row.labels.fields[field];if(['high','medium'].includes(label.confidence)&&label.value!=='不确定')assert.equal(label.value,value);
      }
    }
    assert.equal(result.counts.full+result.counts.partial+result.counts.unknown,result.usedCount);selections++;
  }
const cream=buildPersonalColor(product('lancome-274'),null,'cream');assert.equal(cream.usedCount,4);
const a=buildPersonalColor(product('ysl-610'),{lip:'浅唇',skin:'白皙'}),b=buildPersonalColor(product('ysl-610'),{lip:'深唇',skin:'黄皮'});
assert.notEqual(a.color.hex,b.color.hex);assert.notDeepEqual(a.samples.map(s=>s.id),b.samples.map(s=>s.id));
assert.notEqual(b.color.hex,'#b85f62','Personal color must replace the old hard-coded preview');
const black=buildPersonalColor(product('ysl-610'),{lip:'中唇',skin:'黑皮'});
assert.deepEqual(black.counts,{full:0,partial:0,unknown:10});
assert.match(personalColorCopy(black).headline,/暂无已确认匹配.*通用参考/);
assert.doesNotMatch(personalColorCopy(black).method,/与你条件相近的人/);
for(const s of black.samples){assert.deepEqual(personalSampleCopy(s,black),['肤色判断把握较低','原生唇色未说明']);}
assert.match(personalColorCopy(buildPersonalColor(product('ysl-610'),null)).detail,/尚未填写/);
const skinOnly=buildPersonalColor(product('ysl-610'),{skin:'黄皮'});
assert.ok(skinOnly.counts.full>0);assert.match(personalColorCopy(skinOnly).detail,/已确认的肤色与你相近/);
assert.doesNotMatch(personalColorCopy(buildPersonalColor(product('ysl-610'),{lip:'',skin:''})).headline,/为你/);
const finishes=read('product_finishes_v1.json').products,reviews=read('review_catalog_v2.json').products;
for(const [key,p] of Object.entries(finishes))for(const finish of p.variants?Object.values(p.variants):[p]){
  for(const image of finish.image_evidence){const row=records.get(image.source_object_key);assert.equal(row.id,image.id);assert.equal(row.source_image_sha256,image.image_sha256);}
  for(const evidence of finish.text_evidence){const r=reviews[key].reviews.find(r=>r.id===evidence.review_id);assert.ok(r?.text.includes(evidence.quote),'Finish must retain real source quotes');}
}
assert.equal(finishes['ysl-610'].kind,'gloss');assert.equal(finishes['lancome-274'].variants.intimatte.kind,'soft_matte');
console.log(`PASS real-photo color selection (${selections} profiles/versions), scarcity, deduplication, mismatch exclusion, median color and finish provenance`);
