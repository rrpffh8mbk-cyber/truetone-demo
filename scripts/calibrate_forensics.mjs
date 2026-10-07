import fs from 'node:fs';import crypto from 'node:crypto';
import {DEFAULT_CONFIG,findReference,compareReference} from '../visual-forensics.js';
const root=new URL('../data/forensics/',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,root))),gallery=read('gallery.json'),bench=read('benchmark.json');
const rows=bench.records.filter(r=>r.phase==='calibration'),refs=new Map(gallery.references.map(r=>[r.id,new Uint8Array(fs.readFileSync(new URL(r.file,root)))]));
const inputs=rows.map(r=>({r,pixels:new Uint8Array(fs.readFileSync(new URL(r.pixels,root)))}));for(const i of inputs)i.match=findReference(i.pixels,gallery);
const trials=[];
for(const smoothingPasses of [1,2])for(const residualMin of [12,16,20]){
 const config={...DEFAULT_CONFIG,smoothingPasses,residualMin};let fp=0,tp=0,neg=0,pos=0;
 for(const i of inputs){const positive=i.r.label==='additional_edit',report=i.match?compareReference(i.pixels,refs.get(i.match.id),config):null;if(positive){pos++;if(report?.flag)tp++}else{neg++;if(report?.flag)fp++}}
 trials.push({config,fp,tp,neg,pos,falsePositiveRate:fp/neg,recall:tp/pos});console.log(JSON.stringify(trials.at(-1)));
}
const eligible=trials.filter(t=>t.falsePositiveRate<=.05);eligible.sort((a,b)=>b.recall-a.recall||a.fp-b.fp||a.config.smoothingPasses-b.config.smoothingPasses);const chosen=eligible[0]||trials.sort((a,b)=>a.fp-b.fp||b.tp-a.tp)[0];
const generation=read('calibration-generation-results.json').rows.filter(r=>r.label==='no_additional_edit'),max=Math.max(...generation.map(r=>r.rawSignal)),threshold=Math.min(.999,Math.ceil((max+.05)*100)/100);
const config={version:'forensic-contract-v1',frozenAt:new Date().toISOString(),detector:chosen.config,generation:{signalThreshold:threshold,thresholdMethod:'Upper bound of calibration controls + 0.05, rounded up. No known-generated positives used for calibration; not probability calibration.',calibrationControlMaximum:max},selection:{targetFalsePositiveRate:.05,trials,chosen},codeSha256:crypto.createHash('sha256').update(fs.readFileSync(new URL('../visual-forensics.js',import.meta.url))).digest('hex'),benchmarkSha256:crypto.createHash('sha256').update(fs.readFileSync(new URL('benchmark.json',root))).digest('hex'),calibrationGroups:[...new Set(rows.map(r=>r.sourceGroup))]};
fs.writeFileSync(new URL('frozen-config.json',root),JSON.stringify(config,null,2));console.log('Frozen configuration BEFORE held-out execution');
