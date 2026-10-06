# Color and lip-region checks

Serve the repository root with `python3 -m http.server 8000`.

- `node tests/personal-color.test.mjs`: real-photo selection for 54 profile/version
  combinations, confirmed-mismatch exclusion, exact version isolation, duplicate
  removal, source-post diversity, five-photo limit, separation of unknown supplements,
  Lab conversion, median robustness, actual sample counts and finish provenance.
- `node tests/lip-finish.test.mjs`: gloss/matte differences, retained local contrast,
  unchanged face/teeth outside the mask, edge blending, no painted band under flat
  light, reflection following reversed source illumination and empty-mask handling.
- `python3 tests/test_personal_color.py`: desktop/mobile P1/P2 color and source
  consistency, changed profiles despite cached product data, mirror/matte labels,
  variant selection, honest sample scarcity, explicit missing-condition reasons and
  generic-reference labeling when no profile match is confirmed. Landmark detection is a test double;
  the real color catalog, sample selection and pixel rendering run unchanged.
  `TRUETONE_TEST_URL` also supports the published site using verified HTTPS.

- `node tests/library-tags.test.mjs`: all 175 label records, text priority,
  missing native-lip evidence, unchanged color exclusions, quality gating and
  joint ranking without changing color similarity.
- `node tests/review-text.test.mjs`: all 2,093 source rows retained after deduplication,
  author/opinion separation, negation, cross-product scope, exact source quotes
  and rebuilt support/oppose counts.
- `python3 tests/test_library_matching.py`: desktop/mobile site loads the current
  catalog and orders accepted media by the saved profile.
- `python3 tests/test_tag_resolution.py`: explicit makeup text overrides the
  image heuristic; unspecified made-up state uses the agreed eye/default rule.
  Requires the labeling script dependencies documented in `scripts/README.md`.

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

## Evidence-first journey (2026-10-07)

- `node tests/evidence-assessment.test.mjs`: known three-case pressure tests, no high text baseline, independent color/text decisions, negative experiences as information, negated claims, unverifiable shooting statements, exact version boundaries and source-backed brand briefs. This is regression coverage, not an independent accuracy evaluation.
- `python3 tests/test_evidence_journey.py`: desktop/mobile evidence-first entry without a required profile, three one-click cases, editing and rerunning rather than preloaded answers, unchanged saved user conditions, unsupported products, separated score labels and downloadable brand action evidence. Segmentation is a test double; text analysis, data loading and recommendation use the real modules.
- `TRUETONE_REAL_CASES=1 python3 tests/test_evidence_journey.py`: same known three cases with verified real BiSeNet weights; additionally writes `data/evaluation/demo_cases_v1.json` as a reproducible measurement record. The website never reads this file as an answer. TLS and model checksums remain verified.

- `node tests/cross-modal.test.mjs`: preserved concurrent upstream warm/cool/saturation comparison, unprovable shooting claims and exact-version nearest-image comparisons; separate from trust probability.
