import assert from 'node:assert/strict';
import fs from 'node:fs';
import {assessEvidenceText,evidenceDecision,detectProductVariant} from '../evidence-assessment.js';
import {extractAuthorTags} from '../review-text.js';
import {DEMO_CASES} from '../demo-cases.js';
import {buildBrandActionPlan} from '../brand-actions.js';
const catalog=JSON.parse(fs.readFileSync(new URL('../data/catalog/review_catalog_v2.json',import.meta.url)));
const report=DEMO_CASES.map(c=>assessEvidenceText(c.text,{key:c.productKey,reviews:catalog.products[c.productKey].reviews}));
assert.ok(report[0].score<report[1].score&&report[1].score<report[2].score,'Known stress cases, not independent accuracy');
assert.equal(report[1].variant.id,'unknown');assert.equal(evidenceDecision(report[1],90,true).level,'clarify');
assert.equal(report[0].tags.lip,'深唇');assert.equal(report[2].tags.lip,'深唇');assert.equal(report[2].tags.makeup,'淡妆');assert.equal(report[2].riskLevel,'low');
for(const row of report[0].counterEvidence){const source=catalog.products['ysl-610'].reviews.find(r=>r.id===row.reviewId);assert.equal(row.text,source.text);assert.equal(source.product_scope,'target_context');}
assert.equal(evidenceDecision(report[0],100,true).level,'caution','Perfect color cannot validate absolute claims');
assert.equal(evidenceDecision(report[2],0,true).level,'caution','Good text cannot rescue a color mismatch');
assert.equal(assessEvidenceText('好看！').score,0,'No high baseline for unsupported enthusiasm');
const detailed='我是黄皮、深唇，平时基本是淡妆。薄涂奶茶棕，上嘴半小时后变深，喝水会沾杯。颜色好看，对我来说需要打底。';
const a=assessEvidenceText(detailed),b=assessEvidenceText('自然光、原相机、无滤镜。'+detailed);
assert.equal(a.score,b.score,'Unverifiable shooting claims cannot add credit');assert.ok(b.uncertainties.length);
assert.equal(a.criteria.find(c=>c.label==='优缺点同时交代').earned,12,'Negative experience adds information');
for(const t of ['并非完全不沾杯。','不建议黄皮闭眼冲。','不能保证任何肤色都好看。'])assert.equal(assessEvidenceText(t).risks.length,0,'Negated recommendations must not become absolute claims');
assert.equal(assessEvidenceText('任何肤色都适合，完全不沾杯，不会氧化。').riskLevel,'high');
assert.equal(extractAuthorTags('我是黄皮，深唇慎入。').lip,undefined);
assert.equal(extractAuthorTags('我是黄皮、浅唇、深唇。').lip,undefined);
for(const [text,id] of [['粉金管','intimatte'],['黑管哑光','cream'],['声色限定','cream_gift'],['274','unknown']])assert.equal(detectProductVariant(text).id,id);
const reviews=[{id:'a',text:'会沾杯',product_scope:'target_context',variant_scope:'same_variant',variant:'cream',topics:[{key:'transfer',polarity:'reported'}]},
 {id:'b',text:'会沾杯',product_scope:'target_context',variant_scope:'same_variant',variant:'intimatte',topics:[{key:'transfer',polarity:'reported'}]},
 {id:'c',text:'另一色号会沾杯',product_scope:'other_product',variant:'cream',topics:[{key:'transfer',polarity:'reported'}]}];
assert.deepEqual(assessEvidenceText('黑管哑光274完全不沾杯',{key:'lancome-274',reviews}).counterEvidence.map(r=>r.reviewId),['a']);
const plan=buildBrandActionPlan({key:'ysl-610',brand:'YSL',shade:'610',reviews:catalog.products['ysl-610'].reviews});
assert.match(plan.status,/未验证转化/);assert.ok(plan.actions.some(a=>a.id==='transfer'));
for(const action of plan.actions)for(const id of action.evidence.reviewIds||[])assert.ok(catalog.products['ysl-610'].reviews.some(r=>r.id===id));
console.log('PASS evidence/text separation, known stress cases, no high baseline, negative information, shooting claims, version boundaries and traceable brand actions');
