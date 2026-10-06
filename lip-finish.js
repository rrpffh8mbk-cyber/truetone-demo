// Gloss follows the photograph's existing illumination and lip texture.
// No painted highlight band; skin, teeth and the mouth opening stay untouched.
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
const smooth=n=>{n=clamp(n,0,1);return n*n*(3-2*n)};
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
  values.sort((a,b)=>a-b);const quantile=q=>values[Math.floor((values.length-1)*q)];
  const median=quantile(.5),low=quantile(.15),high=quantile(.9),peak=quantile(.97);
  const strength=clamp(finish.glossStrength||0,0,.3);
  const depth=geometry?.height||Math.max(1,maxY-minY);
  const feather=Math.max(1,Math.min(2.8,depth*.06));
  const source=pixels.slice(),cw=maxX-minX+1,ch=maxY-minY+1;
  const weights=new Float32Array(cw*ch),brightness=new Float32Array(cw*ch),distance=new Float32Array(cw*ch);
  for(let y=0;y<ch;y++)for(let x=0;x<cw;x++){
    const j=y*cw+x,i=((y+minY)*width+x+minX)*4;
    if(mask[i+3]<80)continue;
    weights[j]=mask[i+3]/255;brightness[j]=Math.max(source[i],source[i+1],source[i+2])/255*100;
    distance[j]=x===0||y===0||x===cw-1||y===ch-1?1:cw+ch;
  }
  // Distance to every outer/inner boundary fades pigment and sheen from inside.
  for(let y=0;y<ch;y++)for(let x=0;x<cw;x++){
    const j=y*cw+x;if(!weights[j])continue;
    if(x)distance[j]=Math.min(distance[j],distance[j-1]+1);
    if(y)distance[j]=Math.min(distance[j],distance[j-cw]+1);
  }
  for(let y=ch-1;y>=0;y--)for(let x=cw-1;x>=0;x--){
    const j=y*cw+x;if(!weights[j])continue;
    if(x<cw-1)distance[j]=Math.min(distance[j],distance[j+1]+1);
    if(y<ch-1)distance[j]=Math.min(distance[j],distance[j+cw]+1);
  }
  // Weighted integral images smooth illumination without sampling teeth or skin.
  const stride=cw+1,sums=new Float64Array(stride*(ch+1)),counts=new Float64Array(sums.length);
  for(let y=0;y<ch;y++)for(let x=0;x<cw;x++){
    const j=y*cw+x,k=(y+1)*stride+x+1;
    sums[k]=brightness[j]*weights[j]+sums[k-1]+sums[k-stride]-sums[k-stride-1];
    counts[k]=weights[j]+counts[k-1]+counts[k-stride]-counts[k-stride-1];
  }
  const radius=Math.max(1,Math.min(6,Math.round(depth*.1)));
  const localLight=(x,y)=>{
    const x0=Math.max(0,x-radius),y0=Math.max(0,y-radius),x1=Math.min(cw,x+radius+1),y1=Math.min(ch,y+radius+1);
    const area=a=>a[y1*stride+x1]-a[y1*stride+x0]-a[y0*stride+x1]+a[y0*stride+x0];
    return area(sums)/Math.max(.001,area(counts));
  };
  const lightRange=Math.max(12,high-low),definition=smooth((high-low)/24);
  for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
    const i=(y*width+x)*4;if(mask[i+3]<80)continue;
    const j=(y-minY)*cw+x-minX;
    const [,s,v]=hsv([source[i],source[i+1],source[i+2]]);
    const toneV=clamp(target.brightness*.62+median*.38+(v-median)*(.85+strength*.6),5,98);
    const tone=rgb(target.hue,s*.16+target.saturation*.84,toneV);
    const edge=smooth(distance[j]/feather),light=localLight(x-minX,y-minY);
    const lit=smooth((v-low)/lightRange),broad=smooth((light-median)/Math.max(8,high-median));
    const ridge=smooth((v-light)/Math.max(6,lightRange*.35));
    const highlight=smooth((v-high)/Math.max(6,peak-high));
    const reflection=strength*definition*edge*lit*(.26*broad+.36*ridge+.11*highlight);
    const alpha=.9*mask[i+3]/255*edge,maxChannel=Math.max(1,source[i],source[i+1],source[i+2]);
    for(let channel=0;channel<3;channel++){
      const reflectedLight=255*(.9+.1*source[i+channel]/maxChannel);
      const shaded=tone[channel]*(1-reflection)+reflectedLight*reflection;
      pixels[i+channel]=Math.round(source[i+channel]*(1-alpha)+shaded*alpha);
    }
  }
  return pixels;
}
