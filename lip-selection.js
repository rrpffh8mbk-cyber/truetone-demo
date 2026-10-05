// Normalized brush strokes keep the selected region aligned at any image size.
export function createSelectedLipMask(strokes,w,h){
 const mask=document.createElement('canvas');mask.width=w;mask.height=h;
 const ctx=mask.getContext('2d');ctx.strokeStyle=ctx.fillStyle='#fff';ctx.lineCap=ctx.lineJoin='round';
 for(const stroke of strokes){
  if(!stroke.points?.length)continue;
  const r=stroke.radius*Math.min(w,h);ctx.lineWidth=r*2;
  const first=stroke.points[0];ctx.beginPath();ctx.arc(first.x*w,first.y*h,r,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.moveTo(first.x*w,first.y*h);
  for(const p of stroke.points.slice(1))ctx.lineTo(p.x*w,p.y*h);
  ctx.stroke();
 }
 return mask;
}

export async function selectLipRegion(file,initial=[]){
 const image=new Image(),url=URL.createObjectURL(file);
 try{image.src=url;await image.decode()}finally{URL.revokeObjectURL(url)}
 const dialog=document.createElement('dialog');dialog.className='lip-selector';
 dialog.innerHTML=`<h2>标记特写中的唇部</h2><p>在上唇、下唇上涂选几笔。只选有口红的区域，避开牙齿、皮肤和唇刷；绿色区域会用于颜色分析。</p><canvas class="lip-selection-canvas" aria-label="在嘴唇上拖动以标记分析区域"></canvas><label class="lip-brush-label">笔刷大小 <input type="range" min="1" max="10" value="3" aria-label="笔刷大小"></label><div class="lip-selection-actions"><button type="button" data-action="undo">撤销一笔</button><button type="button" data-action="clear">清空</button><button type="button" data-action="skip">跳过唇色分析</button><button type="button" class="primary-btn" data-action="confirm">使用选中唇部</button></div><p class="lip-selection-status" role="status"></p>`;
 const canvas=dialog.querySelector('canvas'),scale=Math.min(1,720/Math.max(image.naturalWidth,image.naturalHeight));
 canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);
 const ctx=canvas.getContext('2d');let strokes=initial.map(s=>({radius:s.radius,points:s.points.map(p=>({...p}))})),active=null;
 const status=dialog.querySelector('[role="status"]'),confirm=dialog.querySelector('[data-action="confirm"]');
 function draw(){
  ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
  const mask=createSelectedLipMask(strokes,canvas.width,canvas.height),overlay=mask.getContext('2d');
  overlay.globalCompositeOperation='source-in';overlay.fillStyle='#34e6a0';overlay.fillRect(0,0,canvas.width,canvas.height);
  ctx.globalAlpha=.45;ctx.drawImage(mask,0,0);ctx.globalAlpha=1;
  confirm.disabled=!strokes.length;status.textContent=strokes.length?'已标记 '+strokes.length+' 笔；确认后按这些区域分析。':'尚未标记唇部。';
 }
 const point=e=>{const rect=canvas.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(e.clientY-rect.top)/rect.height))}};
 canvas.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();canvas.setPointerCapture(e.pointerId);active={radius:Number(dialog.querySelector('input').value)/100,points:[point(e)]};strokes.push(active);draw()};
 canvas.onpointermove=e=>{if(!active)return;active.points.push(point(e));draw()};
 canvas.onpointerup=canvas.onpointercancel=()=>{active=null};
 document.body.append(dialog);dialog.showModal();draw();
 return new Promise(resolve=>{
  const finish=value=>{dialog.close();dialog.remove();resolve(value)};
  dialog.oncancel=e=>{e.preventDefault();finish(null)};
  dialog.querySelector('[data-action="skip"]').onclick=()=>finish(null);
  confirm.onclick=()=>{if(strokes.length)finish(strokes)};
  dialog.querySelector('[data-action="undo"]').onclick=()=>{active=null;strokes.pop();draw()};
  dialog.querySelector('[data-action="clear"]').onclick=()=>{active=null;strokes=[];draw()};
 });
}

const selectedRegions=new WeakMap();
export async function markLipRegion(file){
 const strokes=await selectLipRegion(file,selectedRegions.get(file)||[]);
 if(strokes)selectedRegions.set(file,strokes);
 return Boolean(strokes);
}
export async function analyzeEvidenceFile(file){
 const {analyzeImageFile}=await import('./agents.js?v=20261006-closeup');
 if(selectedRegions.has(file))return analyzeImageFile(file,{lipSelection:selectedRegions.get(file)});
 const analysis=await analyzeImageFile(file);
 if(analysis.metrics.roiDetected)return analysis;
 if(await markLipRegion(file))return analyzeImageFile(file,{lipSelection:selectedRegions.get(file)});
 return analysis;
}
