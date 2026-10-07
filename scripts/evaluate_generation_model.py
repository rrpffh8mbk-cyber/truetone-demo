"""Frozen pretrained ViT, Apache-2.0. Raw softmax is NOT calibrated authenticity probability."""
import argparse,hashlib,json
from pathlib import Path
import numpy as np
from PIL import Image
import onnxruntime as ort
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'data/forensics'
p=argparse.ArgumentParser();p.add_argument('--phase',choices=['calibration','test'],required=True);a=p.parse_args()
model=Path('/workspace/.cache/truetone-models/deepfake-vit-quantized.onnx');assert hashlib.sha256(model.read_bytes()).hexdigest()=='3519c22b9695f99ddc00821228eeac91239065a90bfbdb4917858b3ec1dcfc42'
opts=ort.SessionOptions();opts.intra_op_num_threads=2;opts.inter_op_num_threads=1
s=ort.InferenceSession(str(model),sess_options=opts,providers=['CPUExecutionProvider']);rows=[]
for r in json.loads((OUT/'benchmark.json').read_text())['records']:
 if r['phase']!=a.phase:continue
 im=Image.open(OUT/r['image']).convert('RGB').resize((224,224),Image.Resampling.BILINEAR);x=(np.asarray(im,dtype=np.float32)/255-.5)/.5;x=x.transpose(2,0,1)[None,...];logits=s.run(None,{s.get_inputs()[0].name:x})[0].reshape(-1);prob=np.exp(logits-logits.max());prob/=prob.sum()
 rows.append({'id':r['id'],'phase':r['phase'],'kind':r['kind'],'sourceGroup':r['sourceGroup'],'label':r['label'],'rawSignal':float(prob[1])})
 if len(rows)%18==0:print('Inferred',a.phase,len(rows),flush=True)
(OUT/(a.phase+'-generation-results.json')).write_text(json.dumps({'modelSha256':hashlib.sha256(model.read_bytes()).hexdigest(),'rows':rows},separators=(',',':')))
print('Completed',a.phase,len(rows),flush=True)
