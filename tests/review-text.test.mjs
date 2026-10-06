import assert from 'node:assert/strict';
import fs from 'node:fs';
import {extractAuthorTags,reviewTextAssessment} from '../review-text.js';
assert.deepEqual(extractAuthorTags('适合黄皮深唇的姐妹，建议素颜涂'),{});
assert.equal(extractAuthorTags('我黄皮深唇，今天素颜试了').lip.value,'深唇');
assert.equal(extractAuthorTags('我黄皮深唇，今天素颜试了').skin.value,'黄皮');
assert.equal(extractAuthorTags('我也是黄皮').skin.value,'黄皮');
assert.equal(extractAuthorTags('我唇色深，唇纹也有点深').lip.value,'深唇');
assert.deepEqual(extractAuthorTags('唇纹有点深'),{});
assert.deepEqual(reviewTextAssessment('可以',{question:'黄皮深唇适合275吗'}).authorTags,{});
assert.equal(reviewTextAssessment('可以去专柜试试',{question:'黄皮深唇适合275吗'}).claims.yellow_skin,undefined);
assert.equal(reviewTextAssessment('黄皮适合吗？求问').claims.yellow_skin,undefined);
assert.equal(reviewTextAssessment('不拔干，不沾杯').negativeEvidence,false);
assert.equal(reviewTextAssessment('完全不沾杯，但是很拔干').topics.find(t=>t.key==='dryness').polarity,'reported');
assert.equal(reviewTextAssessment('不荧光，没有失望').negativeEvidence,false);
assert.equal(reviewTextAssessment('黄皮深唇，275不显白盖不住深唇').claims.deep_lip.stance,'oppose');
const catalog=JSON.parse(fs.readFileSync(new URL('../data/catalog/review_catalog_v2.json',import.meta.url)));
const claims=JSON.parse(fs.readFileSync(new URL('../data/catalog/evidence_claims_v2.json',import.meta.url)));
const rows=Object.values(catalog.products).flatMap(p=>p.reviews),byId=new Map(rows.map(r=>[r.id,r]));
assert.equal(catalog.summary.source_text_rows,2093);assert.equal(rows.length,1913);
assert.equal(byId.size,rows.length);
assert.equal(rows.reduce((n,r)=>n+r.sources.length,0),2093);
for(const r of rows){
 for(const l of Object.values(r.authorTags))assert.ok(r.text.includes(l.evidence_quote));
 for(const l of Object.values(r.claims))assert.ok(r.text.includes(l.evidence_quote));
 if(['other_or_unspecified_product','uncertain_comparison'].includes(r.product_scope))assert.deepEqual(r.claims,{});
}
assert.equal(byId.get('review-b6763da4fc46a6ee').claims.deep_lip.stance,'support','442 opinion must not reverse 610');
assert.deepEqual(byId.get('review-edfd3855a23dec2b').claims,{},'1988 opinion must not become 1936 evidence');
assert.equal(byId.get('review-4f930cc547c17d20').claims.deep_lip.stance,'oppose');
assert.equal(byId.get('review-face28791143f538').claims.bare_face.stance,'support');
for(const [key,p] of Object.entries(claims.products))for(const [field,c] of Object.entries(p.claims)){
 const relevant=catalog.products[key].reviews.filter(r=>r.claims[field]);
 assert.equal(c.support_count,relevant.filter(r=>r.claims[field].stance==='support').length);
 assert.equal(c.oppose_count,relevant.filter(r=>r.claims[field].stance==='oppose').length);
 for(const example of [...c.support_examples,...c.oppose_examples])assert.ok(byId.has(example.review_id));
}
const serialized=JSON.stringify(catalog);
for(const forbidden of ['用户ID','昵称','IP属地','xsec_token','/workspace/','Signature='])assert.ok(!serialized.includes(forbidden));
console.log('PASS all source text rows, deduplication, author/opinion separation, negation, product scope and exact opposing evidence');
