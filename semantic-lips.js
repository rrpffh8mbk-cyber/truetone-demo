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
// Keep one mouth, including its separated upper/lower lip components. Small
// isolated predictions on captions or applicators must not become color samples.
export function retainPrimaryLipRegion(pixels,w,h){
 const seen=new Uint8Array(w*h),parts=[];
 for(let start=0;start<w*h;start++){
  if(!pixels[start*4+3]||seen[start])continue;
  const indices=[start];seen[start]=1;let x0=w,y0=h,x1=0,y1=0;
  for(let q=0;q<indices.length;q++){
   const p=indices[q],x=p%w,y=Math.floor(p/w);x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
   for(const n of [x>0?p-1:-1,x<w-1?p+1:-1,y>0?p-w:-1,y<h-1?p+w:-1])if(n>=0&&!seen[n]&&pixels[n*4+3]){seen[n]=1;indices.push(n)}
  }
  if(indices.length>=6)parts.push({indices,x0,x1,y0,y1});
 }
 if(!parts.length)return null;
 parts.sort((a,b)=>b.indices.length-a.indices.length);const group=[parts[0]];
 for(const p of parts.slice(1))if(group.some(g=>{
  const overlap=Math.min(g.x1,p.x1)-Math.max(g.x0,p.x0)+1;
  const gap=Math.max(0,Math.max(g.y0,p.y0)-Math.min(g.y1,p.y1)-1);
  return overlap>.25*Math.min(g.x1-g.x0+1,p.x1-p.x0+1)&&gap<.18*Math.max(g.x1-g.x0+1,p.x1-p.x0+1);
 }))group.push(p);
 const keep=new Set(group.flatMap(g=>g.indices));for(let p=0;p<w*h;p++)if(!keep.has(p))pixels[p*4+3]=0;
 const box={x0:Math.min(...group.map(g=>g.x0)),y0:Math.min(...group.map(g=>g.y0)),x1:Math.max(...group.map(g=>g.x1)),y1:Math.max(...group.map(g=>g.y1))};
 return {count:keep.size,box};
}
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
  const mx=Math.round(w*padding),my=Math.round(h*padding);let selected=0,totalConfidence=0;const confidences=new Float32Array(n);
  for(let i=0;i<n;i++){
   const x=i%w,y=Math.floor(i/w);if(x<mx||x>=w-mx||y<my||y>=h-my)continue;
   let best=0,max=logits.data[i];for(let c=1;c<19;c++){const v=logits.data[c*n+i];if(v>max){max=v;best=c}}
   if(best!==12&&best!==13)continue;
   let sum=0;for(let c=0;c<19;c++)sum+=Math.exp(logits.data[c*n+i]-max);
   const confidence=1/sum;if(confidence<.55)continue;
   md.data[i*4]=md.data[i*4+1]=md.data[i*4+2]=md.data[i*4+3]=255;confidences[i]=confidence;
  }
  const region=retainPrimaryLipRegion(md.data,w,h);
  if(region){selected=region.count;for(let i=0;i<n;i++)if(md.data[i*4+3])totalConfidence+=confidences[i]}
  const fraction=selected/((w-2*mx)*(h-2*my));
  if(!region||fraction<.0005||fraction>.7)return {mask:null,reason:'未自动定位到足够清晰的唇部',source:FACE_PARSING_MODEL.version};
  mc.putImageData(md,0,0);
  const restored=canvas(image.width||image.naturalWidth,image.height||image.naturalHeight),rc=restored.getContext('2d');
  rc.imageSmoothingEnabled=false;rc.drawImage(mask,mx,my,w-2*mx,h-2*my,0,0,restored.width,restored.height);
  return {mask:restored,source:'semantic-lips',modelVersion:FACE_PARSING_MODEL.version,neutral,padding,confidence:totalConfidence/selected,fraction,box:region.box};
 });
 queue=task.catch(()=>{});return task;
}

// A hue-neutral, zoomed-out pass reduces both training color bias and crop scale
// bias. It changes model input only; measured pixels always come from the original.
export async function automaticLipMask(image){
 const raw=await segmentLipMask(image);
 const strong=r=>r.mask&&r.confidence>=.8&&r.fraction>=.002;
 if(strong(raw))return {...raw,augmentation:'none'};
 const candidates=raw.mask?[{...raw,augmentation:'none'}]:[];
 // A tight crop can otherwise yield only a few pixels at a mouth corner.
 // Evaluate broader context, rather than accepting the first nonempty mask.
 for(const padding of [.25,.35,.4]){
  const r=await segmentLipMask(image,{padding});
  if(r.mask)candidates.push({...r,augmentation:'context-scale'});
 }
 if(!candidates.some(strong))for(const padding of [.25,.35]){
  const r=await segmentLipMask(image,{neutral:true,padding});
  if(r.mask)candidates.push({...r,augmentation:'neutral-context'});
 }
 const quality=r=>r.confidence+.08*Math.min(1,Math.sqrt(r.fraction/.05));
 candidates.sort((a,b)=>quality(b)-quality(a));
 const best=candidates[0];
 if(!best||best.confidence<.6)return {mask:null,reason:'自动唇部选区置信度不足，未取色',augmentation:'multi-scale'};
 // A hue-neutral crop can be measurable while remaining below the stricter
 // reference-library confidence cutoff. Preserve that uncertainty for callers.
 return {...best,lowConfidence:best.confidence<.65};
}
