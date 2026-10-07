import fs from 'node:fs';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {findReference,compareReference,descriptor} from '../visual-forensics.js';import {coordinateEvidence} from '../trust-agent.js';
const root=new URL('../data/forensics/',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,root))),config=read('frozen-config.json'),gallery=read('gallery.json'),bench=read('benchmark.json'),summary=read('test-summary.json');
assert.equal(config.codeSha256,crypto.createHash('sha256').update(fs.readFileSync(new URL('../visual-forensics.js',import.meta.url))).digest('hex'));
assert.equal(config.benchmarkSha256,crypto.createHash('sha256').update(fs.readFileSync(new URL('benchmark.json',root))).digest('hex'));
const cal=new Set(bench.records.filter(r=>r.phase==='calibration').map(r=>r.sourceGroup)),test=new Set(bench.records.filter(r=>r.phase==='test').map(r=>r.sourceGroup));assert.equal([...cal].filter(g=>test.has(g)).length,0);
for(const r of bench.records)if(r.kind==='splice')assert.ok((r.phase==='calibration'?cal:test).has(r.params.donorGroup),'No cross-split donor');
for(const kind of ['control','jpeg','resize','exposure','local_color_strong','splice','ai_generated']){
 const row=bench.records.find(r=>r.kind===kind&&r.phase==='test'),pixels=new Uint8Array(fs.readFileSync(new URL(row.pixels,root))),match=findReference(pixels,gallery,config.detector);
 if(kind==='ai_generated'){assert.equal(match,null,'No unrelated person used as comparable source');continue}
 assert.ok(match);assert.equal(match.id,row.sourceId,'Find source by content, not fixture filename');
 const source=new Uint8Array(fs.readFileSync(new URL(match.file,root))),r=compareReference(pixels,source,config.detector);assert.equal(r.flag,['local_color_strong','splice'].includes(kind));
 if(r.flag)assert.ok(r.regions.length&&r.mask.some(x=>x));
}
const unrelated=new Uint8Array(128*128*3).fill(128);assert.equal(findReference(unrelated,gallery,config.detector),null);assert.ok(descriptor(unrelated).every(Number.isFinite));
const coordinated=coordinateEvidence({hasImage:true,forensics:[{status:'local-change'}]});assert.equal(coordinated.decision.level,'caution');assert.ok(coordinated.actions.some(a=>a.id==='request-original'));assert.equal(coordinated.truthProbability,null);
assert.equal(coordinateEvidence({hasImage:true,forensics:[{status:'source-unavailable'}]}).stages[0].status,'unverified');
assert.equal(summary.generation.usableAsAuthenticityGate,false);assert.equal(summary.generation.generatedDetected,0,'Keep documented model failures visible');
console.log('Forensic content matching, benign controls, local edits, abstention, leakage and coordinator checks passed');
