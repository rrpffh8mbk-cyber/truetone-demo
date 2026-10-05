# Automatic lip segmentation

The browser downloads the same-site `models/resnet18.onnx`, a fixed, checksum-verified BiSeNet ResNet18 ONNX model. This avoids a runtime dependency on Hugging Face connectivity.
It runs locally using ONNX Runtime Web 1.20.1 (WASM, one thread), and caches the
model. Images are not uploaded for segmentation. The initial 53 MB model download
can take time; later images reuse the same session/cache.

- Mirror: https://huggingface.co/jbrownkramer/face-parsing
- Revision: `4be031c61a22e801ab389ab9ccf954781772fd42`
- Model: `resnet18.onnx`
- SHA-256: `0d9bd318e46987c3bdbfacae9e2c0f461cae1c6ac6ea6d43bbe541a91727e33f`
- Original implementation: https://github.com/yakhyo/face-parsing
- Input: RGB resized to 512×512, ImageNet channel mean/std normalization.
- Output labels: 12 = upper lip, 13 = lower lip. Mouth, teeth and skin are excluded.

Standard inference is tried first. For failed crops, hue-neutral inference with
extra context padding reduces color/scale bias; original pixels are always used
for measuring color. MediaPipe geometric lips are a fallback if parsing fails.
Failed selections yield no score and do not prompt for manual marking. Automatic
model confidence is not a calibrated image-authenticity probability.

The model's MIT license is recorded in [LICENSE](LICENSE).
