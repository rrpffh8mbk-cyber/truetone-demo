import * as vision from './vision.js';

const files=['./parts/app-1.js','./parts/app-2.js','./parts/app-3.js','./parts/app-4.js'];
const parts=await Promise.all(files.map(async f=>{
  const r=await fetch(f,{cache:'no-store'});
  if(!r.ok) throw new Error('无法加载 '+f);
  return r.text();
}));
const prelude=`const {analyzeBitmap,applyVirtualLip,canvasToHex,circularHueDistance}=vision;\n`;
const run=new Function('vision',prelude+parts.join('\n'));
run(vision);
