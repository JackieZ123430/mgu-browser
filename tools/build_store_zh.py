"""Build the owner-source Chinese frontend; native browser runtime stays separate."""
import json,os,pathlib,subprocess,sys,tempfile
ROOT=pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'localization'))
from package_cn import normalize
app_id=sys.argv[1]
assert app_id=='mgu_browser'
source=ROOT/'apps'/app_id
original=json.loads((source/'app.json').read_text(encoding='utf-8'))
translated=json.loads((source/'app.zh-CN.json').read_text(encoding='utf-8'))
with tempfile.TemporaryDirectory(prefix='mgu-browser-cn-') as tmp:
    args=[sys.executable,str(ROOT/'tools/build_store.py'),'--app',app_id,'--version',original['version'],'--source','apps/'+app_id,'--language','zh-CN']
    if '--release-package' in sys.argv:args.append('--release-package')
    subprocess.run(args,cwd=ROOT,env=dict(os.environ,MGU_OUT=tmp),check=True)
    provenance={'id':app_id,'upstreamVersion':original['version'],'version':translated['version'],'language':'zh-CN','source':'https://github.com/JackieZ123430/mgu-browser','translation':'小白科技杂物社','sdk':'BMW SDK not distributed'}
    normalize(pathlib.Path(tmp)/(app_id+'@'+original['version']+'.tgz'),ROOT/'dist'/(app_id+'@'+translated['version']+'.tgz'),app_id,translated['version'],provenance,ROOT/'LICENSE')
