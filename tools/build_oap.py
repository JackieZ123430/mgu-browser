"""Build this source against the owner's existing LOCAL BMW SDK. No upload."""
import importlib.util
from pathlib import Path
import shutil
import os
import sys
from kit_shutdown import patch_shutdown
ROOT=Path(__file__).resolve().parents[1]
UPSTREAM=Path(os.environ['MGU_SDK_PATH']).expanduser().resolve() if os.environ.get('MGU_SDK_PATH') else Path.home()/'Desktop/idrive7-apps'
sys.path.insert(0,str(UPSTREAM/'kit/tools'))
module=importlib.util.spec_from_file_location('mgu_build',UPSTREAM/'kit/tools/build.py')
build=importlib.util.module_from_spec(module);module.loader.exec_module(build)
private_kit=ROOT/'.build/kit'
shutil.copytree(UPSTREAM/'kit',private_kit,dirs_exist_ok=True)
patch_shutdown(private_kit)
fonts=ROOT/'.local/browser-fonts'
if not (fonts/'label.json').is_file():raise RuntimeError('Build private Unicode font atlases with tools/build_browser_fonts.py first')
for name in ['label.json','bold.json','light.json','Ubuntu-LICENCE.txt','Ubuntu-COPYRIGHT.txt']:
    shutil.copyfile(fonts/name,private_kit/'runtime/fonts'/name)
for name in ['cjk.json','cjk-titles.json','OFL-NotoSansSC.txt']:
    shutil.copyfile(ROOT/'assets/ui-fonts'/name,private_kit/'runtime/fonts'/name)
build.KIT=str(private_kit)
target=ROOT/'.build/apps/mgu_browser';target.mkdir(parents=True,exist_ok=True)
for p in (ROOT/'apps/mgu_browser').iterdir():
    if p.is_file():shutil.copyfile(p,target/p.name)
for p in (ROOT/'src').glob('*.js'):shutil.copyfile(p,target/p.name)
build.APPS=str(target.parent);build.DIST=str(ROOT/'dist')
sys.argv=['build.py','mgu_browser']
build.main()
