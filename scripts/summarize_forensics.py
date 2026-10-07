import hashlib,json
from pathlib import Path
from PIL import Image
import numpy as np
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'data/forensics'
read=lambda n:json.loads((OUT/n).read_text())
config=read('frozen-config.json');bench=read('benchmark.json');reference=read('test-reference-results.json');generation=read('test-generation-results.json')
assert config['benchmarkSha256']==hashlib.sha256((OUT/'benchmark.json').read_bytes()).hexdigest()
assert config['codeSha256']==hashlib.sha256((ROOT/'visual-forensics.js').read_bytes()).hexdigest()
cal=set(config['calibrationGroups']);test={r['sourceGroup'] for r in bench['records'] if r['phase']=='test'};assert not cal&test
for r in bench['records']:
 if r['kind']=='splice':assert r['params']['donorGroup'] in (cal if r['phase']=='calibration' else test)
for row in reference['rows']:
 m=row.pop('predictedMask',None)
 if m is not None:
  dest='benchmark/'+row['id']+'-detected.png';pred=np.array(m,dtype=np.uint8).reshape(128,128);Image.fromarray(pred*255).save(OUT/dest);row['predictedMaskFile']=dest
  if row['mask']:
   truth=np.asarray(Image.open(OUT/row['mask']))>0;union=(truth|(pred>0)).sum();row['iou']=float((truth&(pred>0)).sum()/union) if union else 0
 elif row['mask']:
  if row.get('predictedMaskFile'):
   pred=np.asarray(Image.open(OUT/row['predictedMaskFile']))>0;truth=np.asarray(Image.open(OUT/row['mask']))>0;union=(truth|pred).sum();row['iou']=float((truth&pred).sum()/union) if union else 0
  else:row['iou']=0
(OUT/'test-reference-results.json').write_text(json.dumps(reference,ensure_ascii=False,separators=(',',':')))
# Re-running a summary loads the persisted prediction mask.
for row in reference['rows']:
 if row.get('mask') and 'iou' not in row:
  row['iou']=0
labels={'control':'未施加新增编辑','jpeg':'JPEG 重压缩','resize':'缩小后恢复尺寸','exposure':'整体曝光 / 白平衡变化','local_color':'较轻局部改色','local_color_strong':'较强局部改色','smoothing':'局部纹理平滑','local_shadow':'局部明暗调整','splice':'唇部拼接','ai_generated':'已知 AI 生成图'}
rows=reference['rows'];normal=[r for r in rows if r['label']=='no_additional_edit'];positive=[r for r in rows if r['label']=='additional_edit'];generated=[r for r in generation['rows'] if r['label']=='known_generated'];gnormal=[r for r in generation['rows'] if r['label']=='no_additional_edit'];t=config['generation']['signalThreshold'];bykind=[]
for kind in labels:
 subset=[r for r in rows if r['kind']==kind];bykind.append({'kind':kind,'label':labels[kind],'positive':bool(subset and subset[0]['label']=='additional_edit'),'count':len(subset),'detected':sum(bool(r['flag']) for r in subset),'unmatched':sum(r['flag'] is None for r in subset),'meanIoU':sum(r.get('iou',0) for r in subset)/max(1,len(subset))})
summary={'version':'held-out-forensics-v1','date':'2026-10-07','reference':{'negatives':len(normal),'negativesFalsePositive':sum(bool(r['flag']) for r in normal),'positives':len(positive),'positivesDetected':sum(bool(r['flag']) for r in positive),'meanIoUAllPositives':sum(r.get('iou',0) for r in positive)/len(positive),'unmatchedPositives':sum(r['flag'] is None for r in positive)},'generation':{'threshold':t,'generated':len(generated),'generatedDetected':sum(r['rawSignal']>=t for r in generated),'controlSignalsOverThreshold':sum(r['rawSignal']>=t for r in gnormal),'controls':len(gnormal),'independentGenerationFamilies':1,'usableAsAuthenticityGate':False},'byKind':bykind,'failures':{'missedLocalEdits':[r['id'] for r in positive if not r['flag']],'falseAlerts':[r['id'] for r in normal if r['flag']],'missedGenerated':[r['id'] for r in generated if r['rawSignal']<t]},'contracts':bench['protocol'],'frozenConfigSha256':hashlib.sha256((OUT/'frozen-config.json').read_bytes()).hexdigest()}
(OUT/'test-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2))
lines=['# 图像取证受控测试：方法与实测边界','','日期：2026-10-07。版本：held-out-forensics-v1。此报告回答新增编辑是否被发现，不衡量网上内容真假比例。','','## 检测真正做了什么','','1. 源图库包含 159 张可解码发布图片的派生像素和结构描述。采用低分辨率灰度内容匹配，不做身份识别；与肤色、唇色标签和官方色差评分无关。','2. 找到相近源图后，将两图归一到 128×128，轻度平滑，稳健拟合全局 RGB 增益与偏置，再定位局部残差。橙色区域表示相对源图的差异，不证明编辑者、编辑意图或 AI 生成。','3. 没有相近源图时，局部检测放弃判断。小幅编辑、裁剪、复杂几何变化和源图自身已存在的处理可能漏检。','4. 实验性全图分类使用 Apache-2.0 预训练 ViT real/deepfake 模型。它没有提供局部伪造定位；原始响应不是概率校准后的真假分数。','','## 数据分组与冻结规则','','四个色号各抽取 6 个不同原帖/评论组，共 24 组。12 组调参、12 组保留测试；同一帖的照片不跨组，拼接供体也不跨组。各组包含未新增编辑、JPEG 压缩、缩放、整体曝光四类对照，以及较轻/较强改色、局部平滑、局部阴影、唇部拼接五类新增编辑。','','**对照源图并没有经独立认证为真实相机原图。** 标签只表示本测试未施加新增局部编辑，不能用作真实/AI 的严格负类 ground truth。区域标注来自实际施加编辑的 alpha > 0.05，是操作记录，不是假装成人工标注。','','阈值只基于 108 个调参样本，选择正常处理误报不超过 5% 时检出最多的候选配置。检测阈值和代码在运行测试组前冻结。AI 裁片在首次模型推理前从 128 提升到 512 像素，未改变任何调参输入或阈值；报告整理时补齐最终清单哈希，原始冻结记录保留在 threshold-freeze-record.json。保留测试有 108 个源图派生样本和 6 个已知生成图。生成阈值仅由调参对照的最高响应 +0.05 向上取整确定，没有使用生成测试图调参。','','**源图核对明确把对应基准图作为推理输入。** 这不是没有源图的盲测，不能将其检出率外推到任意陌生图片。删去比较源图后，该定位模块应放弃判断，不以色差取代篡改检测。','','## 保留测试结果','',f"- 正常处理对照误报：{summary['reference']['negativesFalsePositive']}/{len(normal)}。样本量有限，观察到零误报不等于真实误报率为零。",f"- 新增局部编辑检出：{summary['reference']['positivesDetected']}/{len(positive)}（{summary['reference']['positivesDetected']/len(positive):.1%}）。",f"- 所有新增编辑的平均定位 IoU：{summary['reference']['meanIoUAllPositives']:.3f}；漏检和无法匹配均按 0 计入。",f"- 生成模型：阈值 {t}，已知 AI 图触发 {summary['generation']['generatedDetected']}/{len(generated)}；对照触发 {summary['generation']['controlSignalsOverThreshold']}/{len(gnormal)}。对照本身来源真实性未知，因此不是严格的 AI 检测特异性。",'', '| 操作 | 检出/数量 | 无源图匹配 | 平均区域 IoU |','|---|---:|---:|---:|']
for r in bykind:lines.append(f"| {r['label']} | {r['detected']}/{r['count']} | {r['unmatched']} | {r['meanIoU']:.3f} |")
lines+=['','**较轻改色在测试中全部漏检；生成分类器也漏掉全部 6 张生成图。** 当前不能支持通用 AI 生成/伪造鉴别的宣传，生成模块只保留实验入口，不作为真实性通过门槛。一次生成的 6 个裁片属于一个相关生成家族，不能宣称覆盖 6 种模型。预训练模型训练集与本图库是否重合未知。','','## 已知生成数据来源','','由本次任务实际调用 image_gen 生成一张六人物联系表，再按 3×2 切片；全部为虚构成年人物。原联系表哈希、每个裁片坐标和文件哈希在 benchmark.json 记录。生成器具体版本未由工具返回，不能指定版本名称。模型评估使用每片 512×512；源图定位使用 128×128 的结构输入。受控局部编辑也在 128×128 上完成，这一限制降低了对真实高清修图的外推能力。','','## 决策与后续验证','','有源图差异 → 索取原图/编辑记录、暂缓作为颜色依据；只有模型响应 → 保留待核验；没有检出 → 仍核对文案、SKU 和真实反馈。Evidence / Trust Agent 是确定性编排器，负责汇总专项模块与未解决项，不是四个独立大模型投票。','','下一版需要新增独立生成来源和真实编辑记录，采用外部盲评与来源级验证。更换模型后必须重新建立调参/保留集，不能用本次失败样本改阈值后再冒充独立测试。还未覆盖刷评检测、虚构文本识别、通用拼接、真实真假 ground truth、临床肤色估计或商业转化实验。','','## 可复核记录','','- [测试清单](../../data/forensics/benchmark.json)','- [冻结配置](../../data/forensics/frozen-config.json)','- [逐张源图结果](../../data/forensics/test-reference-results.json)','- [逐张生成模型结果](../../data/forensics/test-generation-results.json)','- [汇总与漏检 ID](../../data/forensics/test-summary.json)','- 重跑：`node scripts/evaluate_forensic_reference.mjs test`，预训练模型结果用 `scripts/evaluate_generation_model.py --phase test`；最后运行 `scripts/summarize_forensics.py`。安装与模型校验见 `MODEL_ATTRIBUTION.md`。']
(ROOT/'docs/forensics/benchmark-report.md').write_text('\n'.join(lines)+'\n');print(json.dumps(summary['reference']));print(json.dumps(summary['generation']))
