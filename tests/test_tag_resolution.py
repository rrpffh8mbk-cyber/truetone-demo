"""Text priority must also override the specified skin-uniformity heuristic."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts.label_sample_library import resolve_labels

visual={'eye_visible':False,'fields':{
    'skin':{'value':'白皙','basis':'image_observation'},
    'makeup':{'value':'素颜','basis':'user_requested_visual_heuristic'}}}
assert resolve_labels(visual,{})['lip']['value']=='不确定'
assert resolve_labels(visual,{})['skin']['value']=='白皙'
assert resolve_labels(visual,{'skin':{'value':'不确定'}})['skin']['value']=='白皙'
explicit={'skin':{'value':'黄皮'},'makeup':{'value':'淡妆'}}
assert resolve_labels(visual,explicit)['skin']['value']=='黄皮'
assert resolve_labels(visual,explicit)['makeup']['value']=='淡妆'
state={'makeup_state':{'value':'妆后','evidence_quote':'带妆'}}
assert resolve_labels(visual,state)['makeup']['value']=='淡妆'
assert resolve_labels(visual,state)['makeup']['basis']=='comment_made_up_with_eye_rule'
heavy={**visual,'eye_visible':True,'fields':{**visual['fields'],'makeup':{'value':'浓妆'}}}
assert resolve_labels(heavy,state)['makeup']['value']=='浓妆'
assert resolve_labels(heavy,{'makeup':{'value':'素颜'},**state})['makeup']['value']=='素颜'
print('PASS text priority, missing native lips, and explicit made-up state overrides')
