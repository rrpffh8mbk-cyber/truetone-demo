"""Controlled additional edits; untouched controls are NOT verified camera originals.
Inputs are local release originals and the existing cached semantic lip masks.
The detector never reads manipulation masks or labels. Public files omit private paths.
"""
import argparse,hashlib,json,io
from pathlib import Path
from PIL import Image,ImageFilter,ImageOps
import numpy as np
from scipy import ndimage
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'data/forensics'; SIZE=128
sha=lambda b:hashlib.sha256(b).hexdigest()
def writej(p,x):p.write_text(json.dumps(x,ensure_ascii=False,separators=(',',':')))
def rgb(im):return np.asarray(im.convert('RGB').resize((SIZE,SIZE),Image.Resampling.BILINEAR)).copy()
def desc(a):
 g=np.asarray(Image.fromarray(a).convert('L').resize((16,16),Image.Resampling.BILINEAR),dtype=float).reshape(-1);g=(g-g.mean())/max(g.std(),1);return np.round(g,4).tolist()
def lipmask(im,hash):
 paths=list(Path('/workspace/.cache/truetone-rebuild-v3').glob(hash+'-*-roi.jpg'))
 if not paths:return None
 roi=Image.open(paths[-1]).convert('RGB');base=im.resize(roi.size,Image.Resampling.BILINEAR);a=np.asarray(base,dtype=float);r=np.asarray(roi,dtype=float)
 keep=((r.sum(2)+3)/(a.sum(2)+3)>.55)&(a.sum(2)>60)
 keep=ndimage.binary_opening(keep,iterations=1);lab,n=ndimage.label(keep)
 if not n:return None
 counts=np.bincount(lab.ravel());counts[0]=0;largest=np.argmax(counts);region=lab==largest
 # Preserve upper/lower nearby regions rather than text noise.
 yy,xx=np.where(region);box=(xx.min(),yy.min(),xx.max(),yy.max())
 for c in range(1,n+1):
  y,x=np.where(lab==c)
  if len(x)>15 and x.mean()>=box[0]-5 and x.mean()<=box[2]+5 and abs(y.mean()-yy.mean())<max(8,(box[2]-box[0])*.3):region|=lab==c
 m=np.asarray(Image.fromarray((region*255).astype('uint8')).resize((SIZE,SIZE),Image.Resampling.BILINEAR),dtype=float)/255
 if (m>.5).sum()<25 or (m>.5).sum()>SIZE*SIZE*.2:return None
 return m
p=argparse.ArgumentParser();p.add_argument('--generated',required=True);args=p.parse_args()
manifest=json.loads(Path('/workspace/.cache/truetone-originals/manifest.json').read_text())
tags={r['id']:r for r in json.loads((ROOT/'data/catalog/sample_tags_v1.json').read_text())['images']}
refs=[];raw={};eligible={}
for row in manifest:
 if row['role']!='sample':continue
 try:
  im=ImageOps.exif_transpose(Image.open(row['file'])).convert('RGB');data=Path(row['file']).read_bytes();a=rgb(im)
 except Exception:continue
 id=row['id'];group=sha(str(Path(row['source_object_key']).parent).encode())[:16];file=f'references/{id}.rgb';(OUT/file).write_bytes(a.tobytes())
 refs.append({'id':id,'productKey':row['product_key'],'group':group,'file':file,'descriptor':desc(a),'sourceSha256':sha(data),'width':im.width,'height':im.height})
 raw[id]=(im,a,row)
 if tags[id].get('use_for_color_reference'):
  mask=lipmask(im,sha(data))
  if mask is not None:eligible.setdefault(row['product_key'],[]).append((group,id,mask))
writej(OUT/'gallery.json',{'version':'source-gallery-v1','size':SIZE,'descriptorSize':16,'scope':'Derived release images, not certified authentic camera captures. Content matching only, not face recognition.','references':refs})
selected=[]
for product,items in sorted(eligible.items()):
 seen=set();chosen=[]
 for group,id,mask in sorted(items,key=lambda x:sha(('source-split-v1'+x[0]).encode())):
  if group not in seen:seen.add(group);chosen.append((group,id,mask))
  if len(chosen)==6:break
 assert len(chosen)==6,(product,len(chosen))
 for i,(group,id,mask) in enumerate(chosen):selected.append({'group':group,'id':id,'mask':mask,'phase':'calibration' if i<3 else 'test','product':product})
records=[]
def save(source,kind,a,mask=None,params=None):
 id=source['id']+'-'+kind;rel='benchmark/'+id+'.png';Image.fromarray(a.astype('uint8')).save(OUT/rel)
 binary='benchmark/'+id+'.rgb';(OUT/binary).write_bytes(a.astype('uint8').tobytes())
 gt=None
 if mask is not None:
  gt='benchmark/'+id+'-mask.png';Image.fromarray(((mask>.05)*255).astype('uint8')).save(OUT/gt)
 records.append({'id':id,'phase':source['phase'],'sourceGroup':source['group'],'sourceId':source['id'],'productKey':source.get('product'),'kind':kind,'image':rel,'pixels':binary,'sha256':sha((OUT/rel).read_bytes()),'mask':gt,'params':params or {},'label':'additional_edit' if mask is not None else 'no_additional_edit','referenceAvailable':True})
for s in selected:
 im,a,row=raw[s['id']];f=a.astype(float);mask=s['mask'];soft=ndimage.gaussian_filter(mask,1);m=soft[:,:,None]
 save(s,'control',a)
 b=io.BytesIO();Image.fromarray(a).save(b,format='JPEG',quality=55);b.seek(0);save(s,'jpeg',np.asarray(Image.open(b)),params={'quality':55})
 save(s,'resize',np.asarray(Image.fromarray(a).resize((80,80),Image.Resampling.BILINEAR).resize((SIZE,SIZE),Image.Resampling.BILINEAR)),params={'intermediate':80})
 save(s,'exposure',np.clip(f*1.07+[4,1,-2],0,255).astype('uint8'),params={'gain':1.07,'offset':[4,1,-2]})
 save(s,'local_color',np.clip(f+m*[18,-13,-4],0,255).astype('uint8'),soft,{'rgbShift':[18,-13,-4]})
 save(s,'local_color_strong',np.clip(f+m*[40,-25,10],0,255).astype('uint8'),soft,{'rgbShift':[40,-25,10]})
 # Texture smoothing in a local rectangle selected from lip geometry, not a detector ROI.
 yy,xx=np.where(mask>.5);cx=int(xx.mean());cy=int(yy.mean());hw=max(8,int((xx.max()-xx.min())*.8));hh=max(8,int(hw*.8));skin=np.zeros((SIZE,SIZE));skin[max(0,cy-3*hh):max(1,cy-hh),max(0,cx-hw):min(SIZE,cx+hw)]=1;skin=ndimage.gaussian_filter(skin,1)
 blur=np.asarray(Image.fromarray(a).filter(ImageFilter.GaussianBlur(3)),dtype=float);save(s,'smoothing',np.clip(f*(1-skin[:,:,None])+blur*skin[:,:,None],0,255).astype('uint8'),skin,{'blurRadius':3})
 save(s,'local_shadow',np.clip(f*(1-.35*m),0,255).astype('uint8'),soft,{'localGain':.65})
 donors=[x for x in selected if x['phase']==s['phase'] and x['group']!=s['group']]
 donor=donors[0];da=raw[donor['id']][1];dy,dx=np.where(donor['mask']>.5)
 crop=Image.fromarray(da).crop((int(dx.min()),int(dy.min()),int(dx.max()+1),int(dy.max()+1))).resize((int(xx.max()-xx.min()+1),int(yy.max()-yy.min()+1)),Image.Resampling.BILINEAR)
 pasted=f.copy();pasted[yy.min():yy.max()+1,xx.min():xx.max()+1]=np.asarray(crop)
 save(s,'splice',np.clip(f*(1-m)+pasted*m,0,255).astype('uint8'),soft,{'donorGroup':donor['group'],'donorSourceId':donor['id'],'blend':'semantic lip alpha'})
# All six crops share one generator invocation; this is one generation family.
gen=Image.open(args.generated).convert('RGB');parentHash=sha(Path(args.generated).read_bytes());genGroup='image-gen-'+parentHash[:16]
for y in range(2):
 for x in range(3):
  box=(round(x*gen.width/3),round(y*gen.height/2),round((x+1)*gen.width/3),round((y+1)*gen.height/2));a=rgb(gen.crop(box));id=f'generated-{y*3+x+1}';s={'id':id,'phase':'test','group':genGroup};save(s,'ai_generated',a,params={'generator':'image_gen','parentSha256':parentHash,'crop':box,'generationFamily':genGroup});records[-1].update(label='known_generated',referenceAvailable=False)
  crop=gen.crop(box);crop.thumbnail((512,512));dest=OUT/records[-1]['image'];crop.save(dest);records[-1]['sha256']=sha(dest.read_bytes());records[-1]['params']['classificationResolution']=list(crop.size)
writej(OUT/'benchmark.json',{'version':'controlled-beauty-edits-v1','splitSeed':'source-split-v1','date':'2026-10-07','size':SIZE,'protocol':{'sourceSplit':'12 calibration and 12 held-out source-post groups; donor posts stay in same split.','negativeDefinition':'No additional local editing applied by this benchmark; source authenticity is unknown.','referenceAssisted':'Gallery includes comparable baseline images as an explicit inference input; not a blind single-image forgery task.','generated':'Six crops from one independently generated contact sheet; all held-out, correlated, one generator family.','maskDefinition':'Applied alpha >0.05; actual controlled editing region, not claimed human annotation.','scope':'Four lipstick shades; controlled operations do not measure prevalence or real-world deception accuracy.'},'records':records})
print(json.dumps({'references':len(refs),'sourceGroups':len(selected),'records':len(records),'calibration':sum(r['phase']=='calibration' for r in records),'test':sum(r['phase']=='test' for r in records)}))
