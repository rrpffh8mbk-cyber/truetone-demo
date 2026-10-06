# TrueTone — Consumer Trust & Virtual Try-on Demo

这是欧莱雅美妆科技黑客松 TrueTone 的**完整消费者端 Demo 骨架**，不再是轻量色号卡片展示。

公开预览：
https://rrpffh8mbk-cyber.github.io/truetone-demo/

## 消费者主流程

首页从购买决策出发，只有三个核心入口：

1. **上传自拍，看看色号在当前照片中可能怎么呈现**
2. **上传试色图片，核验内容是否值得参考**
3. **搜索已有色号，查看跨平台真实性 / 参考价值报告**

另有：
- 色号对比
- 相似色号方向推荐
- Top 3 最值得参考证据
- 深唇 / 浅唇 / 素颜反馈筛选
- SKU / product line 边界提示
- 社媒 vs 电商颜色趋势
- 消费者色差关键词与复购/负向体验权重
- 创作者 / 品牌透明度建议

## 真实分析模块

公开版不是随机 UI。

- `agents.js`：统一的自动唇部像素分析；不再通过红色阈值选区。
- `semantic-lips.js`：本地 BiSeNet 上唇 / 下唇语义分割，支持特写的中性色输入与上下文缩放；不需要逐张手动涂选。首次需下载并校验模型，之后缓存复用。
- `lips.js`：MediaPipe 几何唇部遮罩，供试妆和识别失败时使用。
- `color-similarity.js`：CIELAB / CIEDE2000 颜色比较；相同颜色 100，明显不同颜色可为 0，没有 82 起算或最低保底分，文字不会抬高颜色相似度。
- `data/catalog/lip_color_reference_v3.json`：已检查 data_original 中全部 169 张样本及 6 张官方标准图，采用 151 张、排除 18 张；唇部识别失败、无法读取、重复或与对应标准色差超过 ΔE00 20 的图片标记为不使用。上传图直接对照官方标准色。全部使用标记见 `data/catalog/sample_usage_v3.csv`，重算方法见 `scripts/README.md`。
- `tests/`：颜色公式、自动特写、失败处理和浏览器回归检查，运行方法见 `tests/README.md`。
- `tryon.js`：MediaPipe Face Mesh 唇部 landmarks，outer lip − inner mouth polygon mask，局部 alpha blending；不做人脸身份识别
- `prompts/TRUE_TONE_AGENT_SYSTEM.md`：后续在 Base44 backend 中使用的最终 runtime system instructions
- `DATA_PROVENANCE.md`：当前数据来源、统计规模与公开版边界

## 数据

完整离线结构化处理覆盖：
- YSL #610
- YSL #1936
- Lancôme #274
- Lancôme #275
- 小红书 + 淘宝评论 / 问大家 / SKU / 图片与视频元数据

公开 GitHub Pages 不无差别重发团队抓取的全部高分辨率图片和原视频；原始大文件应转入 Base44 Storage / 对象存储。页面不会为了“看起来完整”而伪造媒体、评论或评测指标。

## Base44 / Base Code

建议直接连接本仓库。下一阶段由 Base44 提供安全 backend / storage，把：
`TRUE_TONE_AGENT_SYSTEM.md` → runtime Agent
并把完整原始媒体文件放进受控 Storage，而不是暴露 API key 或所有原图在 GitHub Pages。

## Ground Truth

项目计划中的人工 ground truth 尚未随原始数据包完成，因此当前版本不会虚构 Accuracy / F1 / 人工一致率。
