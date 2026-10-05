// BiSeNet / CelebAMask-HQ labels: mouth=11, upper lip=12, lower lip=13.
export const FACE_PARSING_MODEL={
 url:new URL('./models/resnet18.onnx',import.meta.url).href,
 sourceUrl:'https://huggingface.co/jbrownkramer/face-parsing/resolve/4be031c61a22e801ab389ab9ccf954781772fd42/resnet18.onnx',
 sha256:'0d9bd318e46987c3bdbfacae9e2c0f461cae1c6ac6ea6d43bbe541a91727e33f',
 version:'bisenet-resnet18-4be031c-v1'
};
let sessionPromise=null,ortModule=null,queue=Promise.resolve();
async function loadModel(){
 ortModule=await import('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/ort.wasm.min.mjs');
 ortModule.env.wasm.numThreads=1;
 ortModule.env.wasm.wasmPaths='https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/';
 let cache=null,response=null;
 try{cache=await caches.open('truetone-face-parsing-v1');response=await cache.match(FACE_PARSING_MODEL.url)}catch{}
 if(!response){response=await fetch(FACE_PARSING_MODEL.url);if(!response.ok)throw Error('自动唇部分割模型暂不可用')}
 const bytes=await response.arrayBuffer();
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
 if(digest!==FACE_PARSING_MODEL.sha256){if(cache)await cache.delete(FACE_PARSING_MODEL.url);throw Error('唇部分割模型校验失败')}
 if(cache)try{await cache.put(FACE_PARSING_MODEL.url,new Response(bytes))}catch{}
 return ortModule.InferenceSession.create(bytes,{executionProviders:['wasm'],graphOptimizationLevel:'all'});
}
async function getSession(){
 if(!sessionPromise)sessionPromise=loadModel().catch(e=>{sessionPromise=null;throw e});
 return sessionPromise;
}
function canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c}
export async function segmentLipMask(image,{neutral=false,padding=0}={}){
 const task=queue.then(async()=>{
  const size=512,input=canvas(size,size),ctx=input.getContext('2d',{willReadFrequently:true});
  const offset=Math.round(size*padding),extent=size-2*offset;
  ctx.fillStyle='#c9aaa0';ctx.fillRect(0,0,size,size);ctx.drawImage(image,offset,offset,extent,extent);const pixels=ctx.getImageData(0,0,size,size).data,plane=size*size,values=new Float32Array(3*plane);
  let min=255,max=0;for(let y=offset;y<size-offset;y+=4)for(let x=offset;x<size-offset;x+=4){const i=(y*size+x)*4,v=(pixels[i]+pixels[i+1]+pixels[i+2])/3;min=Math.min(min,v);max=Math.max(max,v)}
  if(max-min<3)return {mask:null,reason:'图片没有可供定位唇部的结构',source:FACE_PARSING_MODEL.version};
  const session=await getSession();
  const mean=[.485,.456,.406],std=[.229,.224,.225];
  for(let i=0;i<plane;i++){const grey=.299*pixels[i*4]+.587*pixels[i*4+1]+.114*pixels[i*4+2];for(let c=0;c<3;c++)values[c*plane+i]=((neutral?grey:pixels[i*4+c])/255-mean[c])/std[c]}
  const output=await session.run({[session.inputNames[0]]:new ortModule.Tensor('float32',values,[1,3,size,size])});
  const logits=output[session.outputNames[0]],dims=logits.dims;
  if(dims.length!==4||dims[1]!==19)throw Error('唇部分割模型输出不兼容');
  const h=dims[2],w=dims[3],n=w*h,mask=canvas(w,h),mc=mask.getContext('2d'),md=mc.createImageData(w,h);
  let selected=0,totalConfidence=0;
  for(let i=0;i<n;i++){
   let best=0,max=logits.data[i];for(let c=1;c<19;c++){const v=logits.data[c*n+i];if(v>max){max=v;best=c}}
   if(best!==12&&best!==13)continue;
   let sum=0;for(let c=0;c<19;c++)sum+=Math.exp(logits.data[c*n+i]-max);
   const confidence=1/sum;if(confidence<.55)continue;
   md.data[i*4]=md.data[i*4+1]=md.data[i*4+2]=md.data[i*4+3]=255;selected++;totalConfidence+=confidence;
  }
  if(selected/n<.0005||selected/n>.65)return {mask:null,reason:'未自动定位到足够清晰的唇部',source:FACE_PARSING_MODEL.version};
  mc.putImageData(md,0,0);
  const restored=canvas(image.width||image.naturalWidth,image.height||image.naturalHeight),rc=restored.getContext('2d');
  rc.imageSmoothingEnabled=false;const mx=Math.round(w*padding),my=Math.round(h*padding);rc.drawImage(mask,mx,my,w-2*mx,h-2*my,0,0,restored.width,restored.height);
  return {mask:restored,source:'semantic-lips',modelVersion:FACE_PARSING_MODEL.version,neutral,padding,confidence:totalConfidence/selected};
 });
 queue=task.catch(()=>{});return task;
}

// A hue-neutral, zoomed-out pass reduces both training color bias and crop scale
// bias. It changes model input only; measured pixels always come from the original.
export async function automaticLipMask(image){
 const raw=await segmentLipMask(image);
 if(raw.mask)return {...raw,augmentation:'none'};
 const neutral=await segmentLipMask(image,{neutral:true,padding:.25});
 if(neutral.mask)return {...neutral,augmentation:'neutral-context'};
 const contextual=await segmentLipMask(image,{padding:.15});
 return {...contextual,augmentation:'context-scale'};
}
