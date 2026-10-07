import {evidenceDecision} from './evidence-assessment.js';
export const TRUST_AGENT_VERSION='evidence-coordinator-v2';
// A deterministic coordinator of specialist modules, not four independent LLMs.
export function coordinateEvidence({textReport=null,visual=null,forensics=[],hasImage=false,crossModal=null}={}){
 const localChange=forensics.some(r=>r.status==='local-change'),unverified=hasImage&&(!forensics.length||forensics.some(r=>['source-unavailable','unavailable'].includes(r.status)));
 const base=evidenceDecision(textReport,visual?.score??null,hasImage);
 let decision=localChange?{level:'caution',title:'先核对图片的局部变化，再参考这条内容',detail:'可比源图核对发现局部差异。请索取原图与编辑过程，暂缓把这张图当作该色号的颜色依据；这不是造假定论。'}:base;
 if(unverified){
  const limitation='缺少可比源图或核对未完成，无法判定图片是否有局部篡改；不判断真假，也不以颜色接近作为通过依据。';
  decision=base.level==='reference'&&!localChange?{level:'clarify',title:'使用条件可参考，图片篡改尚无法核验',detail:limitation+' 文案的具体体验可以单独阅读，图像保持待核验。'}:{...decision,detail:decision.detail+' '+limitation};
 }
 const actions=[];
 if(localChange)actions.push({id:'request-original',text:'索取原图与编辑过程，核对标出的局部变化。'});
 if(unverified)actions.push({id:'source-unverified',text:'缺少可比源图的图片保留待核验；可补查生成模型线索，但不能据此证明真假。'});
 if(['unknown','legacy'].includes(textReport?.variant?.id))actions.push({id:'confirm-version',text:'确认产品线和版本，同号不同版本分开比较。'});
 if(textReport?.risks?.length)actions.push({id:'check-claims',text:'核对文案承诺与同产品的不同体验，保留反例。'});
 if(!actions.length)actions.push({id:'compare-experiences',text:'继续对照同产品证据和使用条件；未检出线索不等于确认真实。'});
 return {version:TRUST_AGENT_VERSION,decision,actions,stages:[{id:'visual',status:hasImage?(localChange?'needs-review':unverified?'unverified':'checked'):'not-provided'},{id:'cross-modal',status:crossModal?'checked':'not-provided'},{id:'sku-evidence',status:'checked'},{id:'personal',status:'downstream'}],truthProbability:null};
}
