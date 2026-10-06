# Color and lip-region checks

Serve the repository root with `python3 -m http.server 8000`.

- `node tests/reference-filtering.test.mjs`: official-color outliers, correct SKU
  comparison, missing/weak ROI, and primary-mouth cleanup.
- `python3 tests/test_library_usage.py`: all four reports show exact usage counts
  and excluded remote images cannot return as reference cards.
- `python3 tests/test_catalog.py`: all 169 usage marks, 6 standards, exclusion
  reasons, exact shared filtering decisions and accepted thumbnails.
- `node tests/color-similarity.test.mjs`: published CIEDE2000 test pairs, 100/0
  endpoints, missing-data handling, and rejection of legacy reference statistics.
- Open `/tests/lips-regression.html` on that server: pixel/geometry checks,
  mouth exclusion, concurrency and detector failure/recovery. No model download.
- `python3 tests/test_closeup.py`: desktop/mobile upload flow using a deterministic
  segmentation test double. Checks automatic processing, blue mismatch=0,
  isolation from text scores, ROI inspection and missing-region handling.

For the actual segmentation model on a blue-lip portrait crop, run:

```sh
TRUETONE_REAL_SAMPLE=/private/path/blue-lip-crop.png \
TRUETONE_MODEL_FILE=/cache/resnet18.onnx python3 tests/test_closeup.py
```

This mode verifies the model checksum and exercises the real browser model rather
than the test double. `TRUETONE_MODEL_FILE` is optional if model downloads work.
`TRUETONE_TEST_URL` selects a different served checkout or the published site.
Raw portraits are not added to Git. Synthetic/derived image checks establish
regressions, not accuracy on every portrait or an authenticity benchmark.

For the six uploaded official originals, run:

```sh
python3 tests/test_real_official.py --manifest /private/manifest.json
```

This uses verified real model weights, checks substantial lip area rather than
a corner-only selection, and verifies each official image scores 100 against
its own product/variant. Raw images remain in the external manifest directory.
