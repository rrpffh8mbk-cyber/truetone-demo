// Change only mask pixels. Preserve local contrast; gloss adds a smooth,
// lip-aligned reflection, not random glitter or a skin highlight.
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
const hsv=([r,g,b])=>{
  const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;let h=0;
  if(d){if(max===r)h=60*((g-b)/d%6);else if(max===g)h=60*((b-r)/d+2);else h=60*((r-g)/d+4)}
  return [(h+360)%360,max?d/max*100:0,max/255*100];
};
function rgb(h,s,v){s/=100;v/=100;const c=v*s,x=c*(1-Math.abs((h/60)%2-1)),m=v-c;
  const a=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];return a.map(n=>Math.round((n+m)*255));
}
export function renderLipFinish(pixels,mask,width,height,target,finish={glossStrength:0},geometry=null){
  const values=[];let minX=width,minY=height,maxX=-1,maxY=-1;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;if(mask[i+3]<80)continue;
    values.push(Math.max(pixels[i],pixels[i+1],pixels[i+2])/255*100);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y)}
  if(!values.length)return pixels;
  values.sort((a,b)=>a-b);const median=values[Math.floor(values.length/2)];
  const center=geometry?.center||{x:(minX+maxX)/2,y:(minY+maxY)/2};
  const axis=geometry?.axis||{x:1,y:0};const span=geometry?.width||Math.max(1,maxX-minX),depth=geometry?.height||Math.max(1,maxY-minY);
  for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
    const i=(y*width+x)*4;if(mask[i+3]<80)continue;
    const [,s,v]=hsv([pixels[i],pixels[i+1],pixels[i+2]]);
    const toneV=clamp(target.brightness*.62+median*.38+(v-median)*.85,5,98);
    const tone=rgb(target.hue,s*.16+target.saturation*.84,toneV);
    const dx=x-center.x,dy=y-center.y,u=(dx*axis.x+dy*axis.y)/span,t=(-dx*axis.y+dy*axis.x)/depth;
    const lower=Math.exp(-(((u+.06)/.24)**2+((t-.23)/.085)**2));
    const upper=.35*Math.exp(-(((u-.10)/.20)**2+((t+.23)/.07)**2));
    const reflection=clamp((finish.glossStrength||0)*(lower+upper),0,.30);
    const alpha=.9*mask[i+3]/255;
    for(let channel=0;channel<3;channel++){
      const shaded=tone[channel]*(1-reflection)+255*reflection;
      pixels[i+channel]=Math.round(pixels[i+channel]*(1-alpha)+shaded*alpha);
    }
  }
  return pixels;
}
