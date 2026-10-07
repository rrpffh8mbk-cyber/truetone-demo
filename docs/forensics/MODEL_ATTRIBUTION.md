# Experimental generation-signal model

- Upstream model: [prithivMLmods/Deep-Fake-Detector-v2-Model](https://huggingface.co/prithivMLmods/Deep-Fake-Detector-v2-Model).
- ONNX conversion: [onnx-community/Deep-Fake-Detector-v2-Model-ONNX](https://huggingface.co/onnx-community/Deep-Fake-Detector-v2-Model-ONNX).
- Frozen revision: `4ea3d66dfb1bedca29727c6a0c6fa061d5f3f9c9`.
- Artifact: `onnx/model_quantized.onnx`, 87,333,629 bytes.
- SHA256: `3519c22b9695f99ddc00821228eeac91239065a90bfbdb4917858b3ec1dcfc42`.
- Declared upstream license: Apache-2.0; [license text](APACHE-2.0.txt). Attribution retained; no endorsement claimed.
- RGB 224×224 bilinear resize, each channel `(x/255-0.5)/0.5`, CHW tensor. Class 0 Realism, class 1 Deepfake. The class-1 softmax is a raw model response, **not calibrated authenticity probability**.
- Browser uses checksum-verified artifact and onnxruntime-web 1.20.1 WASM, cached locally. No user photo is uploaded. Python uses onnxruntime 1.20.1 / CPU / Pillow bilinear interpolation; browser interpolation may differ slightly.
- Tested here: **0/6 known AI-generated pictures flagged** at frozen threshold 0.89. Beauty-domain generalization is inadequate. This model is experimental and does not gate authenticity or color-reference inclusion.
- No upstream headline accuracy is used as our evaluation result. Pretraining overlap with the source corpus is unknown.

Python reproduction: install `onnxruntime==1.20.1`, `numpy`, `Pillow`, `scipy` in a local virtual environment; download the frozen HTTPS artifact, verify SHA256 before inference, then run `scripts/evaluate_generation_model.py --phase test`. The original release and old segmentation caches are needed only to rebuild fixture images, not to rerun the checked-in test. Original release download credentials/private paths are not published.
