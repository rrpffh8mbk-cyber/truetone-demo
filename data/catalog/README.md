# TrueTone data catalog

This directory stores lightweight indexes and derived metadata only.

- Original storage is Alibaba Cloud OSS. The user also uploaded the source ZIPs
  to the public `data_original` GitHub Release (`data_v1`) for this rebuild.
- GitHub should not become the raw media store; this keeps the public demo repository small and avoids exposing the full scraped corpus.
- `source_registry.json` records the OSS prefixes and dataset counts.
- `tag_schema.json` is the single vocabulary used by both user-profile inputs and evidence-library labels.
- `top_reference_candidates_v1.json` is a technical preselection of candidate reference images. It is not the final semantic/personalized ranking.

Final Top Reference ranking should combine:
1. technical image quality;
2. evidence completeness;
3. agreement with the full multi-source dataset;
4. semantic labels (lip / skin / makeup / lighting / application);
5. platform diversity;
6. match to the current user's profile.

Unknown semantic attributes must stay `不确定` rather than being guessed.

Current semantic labels: `sample_tags_v1.json` / `.csv`, covering all 169
samples and the 6 separately identified official images. `labeling_annotations_v1.json`
retains reviewed image observations and folder-linked author-text selections.
Explicit author text overrides conflicting image labels; recommendations,
other commenters, future plans and descriptions of absent photo numbers do not
describe the current wearer. Native lip depth uses only author text. Skin uses
白皙 / 黄皮 / 黑皮; makeup follows the user-requested skin-uniformity/eye rule
when text is absent. Unknown and low-confidence fields add no matching preference.
`app.js` loads this catalog and uses matching medium/high-confidence wearer labels
to order accepted reference images. Official/product graphics are not wearer
evidence. Label preference never changes an image's color similarity score.
All 18 existing color exclusions remain unchanged. There is no measured accuracy
benchmark for these rule labels.

`library-tags.js` now combines four deterministic role assessments into reference
quality (color analyst 40%, reference auditor 30%, consumer reporter 20%, creator
advisor 10%). Eligible wearer images require reference quality >=60 and the
existing color/ROI acceptance. Ranking uses quality 70% plus tag match 30%; when
no profile is supplied, quality alone. Unknown traits are neutral, not matches;
low-confidence traits add no preference. These are configurable rule scores,
not independent model calls or calibrated authenticity probabilities.

Current text: `review_catalog_v2.json` and `evidence_claims_v2.json`. All 2,093
nonempty source text rows are audited by shared conservative rules, with 18
reviewed semantic corrections in `review_audit_overrides_v1.json`. Exact duplicates
leave 1,913 records with all source-file hashes and row references retained.
Identical question/answer exports shared by Cream and Cream Gift become one
family-level record, never two SKU-specific votes. Unknown or other-product
opinions stay in the catalog but do not become current-product claims or
personalized comments. Questions cannot label the respondent. Suitability
opinions cannot label the author. Exact linked-author evidence from the image
labeling task can supplement author tags. Positive and opposing examples link
to these exact reviewed records; historical v1 counts are no longer loaded.

Current color reference: `lip_color_reference_v3.json`. All 169 original
sample files and 6 official photos in the user-uploaded `data_original` Release
have been examined. Official-photo lip colors determine upload similarity;
samples with official CIEDE2000 distance >20, unreliable ROI, unreadable bytes
or within-product/variant duplicates are marked not for color reference.
`sample_usage_v3.json` and `sample_usage_v3.csv` retain every original filename,
usage mark and reason. Only accepted samples enter statistics and media ranking.
The v1 red heuristic and v2 partial-corpus references remain archival only.
See `scripts/README.md` for reproducible processing and threshold limitations.
