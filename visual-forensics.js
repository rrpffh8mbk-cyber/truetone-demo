// Reference-assisted change detection. Independent of lipstick colour similarity.
export const FORENSIC_VERSION='reference-residual-v1';
export const DEFAULT_CONFIG={version:FORENSIC_VERSION,size:128,matchMin:.97,residualMin:12,minRegion:18,minChangedFraction:.0015,smoothingPasses:1};
export function descriptor(rgb,size=128){
 const d=[];for(let by=0;by<16;by++)for(let bx=0;bx<16;bx++){let s=0,n=0;for(let y=Math.floor(by*size/16);y<Math.floor((by+1)*size/16);y++)for(let x=Math.floor(bx*size/16);x<Math.floor((bx+1)*size/16);x++){let i=(y*size+x)*3;s+=.299*rgb[i]+.587*rgb[i+1]+.114*rgb[i+2];n++}d.push(s/n)}
 const mean=d.reduce((a,b)=>a+b)/d.length,sd=Math.sqrt(d.reduce((a,b)=>a+(b-mean)**2,0)/d.length);return d.map(x=>(x-mean)/Math.max(sd,1));
}
export function correlation(a,b){let xy=0,xx=0,yy=0;for(let i=0;i<a.length;i++){xy+=a[i]*b[i];xx+=a[i]*a[i];yy+=b[i]*b[i]}return xy/Math.sqrt(xx*yy||1)}
export function findReference(pixels,gallery,config=DEFAULT_CONFIG){const d=descriptor(pixels,config.size);let best=null;for(const r of gallery.references){const match=correlation(d,r.descriptor);if(!best||match>best.match)best={...r,match}}return best&&best.match>=config.matchMin?best:null}
function affine(source,target,include){const out=[];for(let c=0;c<3;c++){let x=0,y=0,xx=0,xy=0,n=0;for(let p=0;p<include.length;p++)if(include[p]){let a=source[p*3+c],b=target[p*3+c];x+=a;y+=b;xx+=a*a;xy+=a*b;n++}const gain=Math.max(.65,Math.min(1.5,(xy-x*y/n)/(xx-x*x/n||1)));out.push({gain,offset:(y-gain*x)/n})}return out}
function smooth(rgb,size,passes){let out=Float32Array.from(rgb);for(let t=0;t<passes;t++){const next=new Float32Array(out.length);for(let y=0;y<size;y++)for(let x=0;x<size;x++)for(let c=0;c<3;c++){let sum=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)sum+=out[(Math.max(0,Math.min(size-1,y+dy))*size+Math.max(0,Math.min(size-1,x+dx)))*3+c]*(dy===0?2:1)*(dx===0?2:1);next[(y*size+x)*3+c]=sum/16}out=next}return out}
export function compareReference(candidate,source,config=DEFAULT_CONFIG){
 const size=config.size,n=size*size;if(candidate.length!==n*3||source.length!==n*3)throw Error('Invalid forensic image dimensions');
 candidate=smooth(candidate,size,config.smoothingPasses||0);source=smooth(source,size,config.smoothingPasses||0);
 let keep=new Uint8Array(n).fill(1),fit,residual=new Float32Array(n);
 for(let iter=0;iter<3;iter++){
  fit=affine(source,candidate,keep);
  for(let p=0;p<n;p++){let sum=0;for(let c=0;c<3;c++){const v=candidate[p*3+c]-(fit[c].gain*source[p*3+c]+fit[c].offset);sum+=v*v}residual[p]=Math.sqrt(sum/3)}
  const sorted=Array.from(residual).sort((a,b)=>a-b),cut=sorted[Math.floor(n*.75)];for(let p=0;p<n;p++)keep[p]=residual[p]<=Math.max(2,cut)?1:0;
 }
 const seed=new Uint8Array(n);for(let p=0;p<n;p++)seed[p]=residual[p]>=config.residualMin?1:0;
 const seen=new Uint8Array(n),mask=new Uint8Array(n),regions=[];
 for(let start=0;start<n;start++){
  if(!seed[start]||seen[start])continue;let q=[start];seen[start]=1;let x0=size,y0=size,x1=0,y1=0,sum=0;
  for(let i=0;i<q.length;i++){let p=q[i],x=p%size,y=Math.floor(p/size);x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);sum+=residual[p];for(const b of [x? p-1:-1,x<size-1?p+1:-1,y?p-size:-1,y<size-1?p+size:-1])if(b>=0&&seed[b]&&!seen[b]){seen[b]=1;q.push(b)}}
  if(q.length>=config.minRegion){for(const p of q)mask[p]=1;regions.push({x:x0/size,y:y0/size,width:(x1-x0+1)/size,height:(y1-y0+1)/size,pixels:q.length,residual:+(sum/q.length).toFixed(2)})}
 }
 regions.sort((a,b)=>b.pixels-a.pixels);const changed=mask.reduce((a,b)=>a+b,0),fraction=changed/n;
 return {version:FORENSIC_VERSION,flag:fraction>=config.minChangedFraction,changedFraction:fraction,regions:regions.slice(0,8),mask,residual,fit,interpretation:'Regions mark differences relative to a comparable source after global exposure correction; they do not identify who edited an image or prove AI generation.'};
}
let galleryPromise,configPromise;
export async function forensicAssets(){
 if(!galleryPromise)galleryPromise=fetch(new URL('./data/forensics/gallery.json',import.meta.url)).then(r=>{if(!r.ok)throw Error('源图索引不可用');return r.json()}).catch(e=>{galleryPromise=null;throw e});
 if(!configPromise)configPromise=fetch(new URL('./data/forensics/frozen-config.json',import.meta.url)).then(r=>{if(!r.ok)throw Error('取证配置不可用');return r.json()}).catch(e=>{configPromise=null;throw e});
 const [gallery,config]=await Promise.all([galleryPromise,configPromise]);return {gallery,config:config.detector};
}
export async function imagePixels(file,size=128){
 const img=await createImageBitmap(file,{imageOrientation:'from-image'});const canvas=document.createElement('canvas');canvas.width=canvas.height=size;const c=canvas.getContext('2d',{willReadFrequently:true});c.drawImage(img,0,0,size,size);img.close();const rgba=c.getImageData(0,0,size,size).data,pixels=new Uint8Array(size*size*3);for(let i=0;i<size*size;i++)for(let k=0;k<3;k++)pixels[i*3+k]=rgba[i*4+k];return {pixels,canvas};
}
export async function analyzeVisualForensics(file){
 try{
  const {gallery,config}=await forensicAssets(),{pixels,canvas}=await imagePixels(file,config.size),match=findReference(pixels,gallery,config);
  if(!match)return {status:'source-unavailable',title:'没有找到可直接比较的源图',detail:'无法靠两张不同人的照片定位篡改。可继续检查生成线索，或向作者索取原图与拍摄条件。',regions:[],version:FORENSIC_VERSION};
  const response=await fetch(new URL('./data/forensics/'+match.file,import.meta.url));if(!response.ok)throw Error('源图不可用');const source=new Uint8Array(await response.arrayBuffer()),report=compareReference(pixels,source,config);
  const c=canvas.getContext('2d'),data=c.getImageData(0,0,config.size,config.size);for(let p=0;p<report.mask.length;p++)if(report.mask[p]){data.data[p*4]=Math.round(data.data[p*4]*.45+255*.55);data.data[p*4+1]=Math.round(data.data[p*4+1]*.45+110*.55);data.data[p*4+2]=Math.round(data.data[p*4+2]*.45)}c.putImageData(data,0,0);
  // A reliable content match is necessary but not evidence of authenticity.
  return {...report,mask:undefined,residual:undefined,status:report.flag?'local-change':'no-local-change',sourceId:match.id,sourceSha256:match.sourceSha256,match:+match.match.toFixed(4),overlay:canvas.toDataURL('image/png'),title:report.flag?'相对源图发现局部变化':'当前源图核对未检出明显局部变化',detail:report.flag?'橙色区域是扣除整体亮度和色偏后仍存在的局部差异。可能涉及局部改色、纹理处理或替换，需要查看编辑过程；不是造假定论。':'正常压缩、缩放和整体曝光变化尽量不被算作局部编辑。小幅修图、裁剪和源图自身已有的处理仍可能漏检。'};
 }catch{return {status:'unavailable',title:'源图核对暂未完成',detail:'没有完成的检查不会视为通过，请稍后重试。',regions:[],version:FORENSIC_VERSION}}
}
