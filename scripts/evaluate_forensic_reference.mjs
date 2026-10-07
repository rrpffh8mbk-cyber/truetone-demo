import fs from 'node:fs';
import {DEFAULT_CONFIG,findReference,compareReference} from '../visual-forensics.js';
const root=new URL('../data/forensics/',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,root))),gallery=read('gallery.json'),benchmark=read('benchmark.json');
const refs=new Map(gallery.references.map(r=>[r.id,new Uint8Array(fs.readFileSync(new URL(r.file,root)))]));
const phases=process.argv[2]||'calibration';let config=DEFAULT_CONFIG;
if(phases!=='calibration')config=read('frozen-config.json').detector;
const rows=[];for(const row of benchmark.records.filter(r=>r.phase===phases)){const a=new Uint8Array(fs.readFileSync(new URL(row.pixels,root))),match=findReference(a,gallery,config),r=match?compareReference(a,refs.get(match.id),config):null;rows.push({...row,matchId:match?.id,match:match?.match,status:!r?'source-unavailable':r.flag?'local-change':'no-local-change',flag:r?.flag??null,changedFraction:r?.changedFraction,regions:r?.regions,predictedMask:r?Array.from(r.mask):null})}
fs.writeFileSync(new URL(phases+'-reference-results.json',root),JSON.stringify({version:config.version,phase:phases,config,rows}));
console.log(JSON.stringify(rows.reduce((out,r)=>{const c=out[r.kind]??={count:0,flagged:0,unmatched:0};c.count++;if(r.flag)c.flagged++;if(r.flag===null)c.unmatched++;return out},{})));
