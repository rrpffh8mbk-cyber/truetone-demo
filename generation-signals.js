// Neural global classifier; never a truth probability or local manipulation map.
export const GENERATION_MODEL={version:'deepfake-vit-4ea3d66-quantized',url:'https://huggingface.co/onnx-community/Deep-Fake-Detector-v2-Model-ONNX/resolve/4ea3d66dfb1bedca29727c6a0c6fa061d5f3f9c9/onnx/model_quantized.onnx',sha256:'3519c22b9695f99ddc00821228eeac91239065a90bfbdb4917858b3ec1dcfc42',bytes:87333629,license:'Apache-2.0'};
let pending,ort,queue=Promise.resolve();
async function session(){
 if(!pending)pending=(async()=>{
  ort=await import('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/ort.wasm.min.mjs');ort.env.wasm.numThreads=1;ort.env.wasm.wasmPaths='https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/';
  let cache,response;try{cache=await caches.open('truetone-generative-signals-v1');response=await cache.match(GENERATION_MODEL.url)}catch{}
  if(!response)response=await fetch(GENERATION_MODEL.url);if(!response.ok)throw Error('模型下载未完成');const bytes=await response.arrayBuffer();const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
  if(hash!==GENERATION_MODEL.sha256){if(cache)await cache.delete(GENERATION_MODEL.url);throw Error('模型完整性校验失败')}
  if(cache)try{await cache.put(GENERATION_MODEL.url,new Response(bytes))}catch{}
  return ort.InferenceSession.create(bytes,{executionProviders:['wasm'],graphOptimizationLevel:'all'});
 })().catch(e=>{pending=null;throw e});return pending;
}
export async function generationSignal(file){
 const task=queue.then(async()=>{
  const s=await session(),bitmap=await createImageBitmap(file,{imageOrientation:'from-image'}),canvas=document.createElement('canvas');canvas.width=canvas.height=224;const c=canvas.getContext('2d',{willReadFrequently:true});c.drawImage(bitmap,0,0,224,224);bitmap.close();const pixels=c.getImageData(0,0,224,224).data,n=224*224,input=new Float32Array(n*3);
  for(let p=0;p<n;p++)for(let k=0;k<3;k++)input[k*n+p]=(pixels[p*4+k]/255-.5)/.5;
  const out=await s.run({[s.inputNames[0]]:new ort.Tensor('float32',input,[1,3,224,224])}),logits=out[s.outputNames[0]].data,max=Math.max(...logits),exp=Array.from(logits,x=>Math.exp(x-max)),signal=exp[1]/exp.reduce((a,b)=>a+b,0);
  const response=await fetch(new URL('./data/forensics/frozen-config.json',import.meta.url));if(!response.ok)throw Error('冻结阈值未加载');const config=await response.json(),flag=signal>=config.generation.signalThreshold;
  return {model:GENERATION_MODEL.version,rawSignal:signal,flag,title:flag?'生成 / 人脸处理模型出现较强响应':'生成 / 人脸处理模型未出现较强响应',detail:'这是预训练模型的全图线索，不是“假图概率”，也不能定位 AI 区域。美妆、柔光和修图可能误触发；本次已知生成测试图检出 0/6，高质量生成图可能漏检。请结合原图来源核对，不能把低响应当作图片真实。'};
 });queue=task.catch(()=>{});return task;
}
