"""Prepare an isolated, laptop-only SDK emulator in WSL. Never connects to a car."""
import hashlib,json,os,pwd,shutil,subprocess,sys
from pathlib import Path

project=Path(sys.argv[1]).resolve()
upstream=Path(sys.argv[2]).resolve()
account='mgu-dev'
if os.geteuid()!=0:raise SystemExit('Run preparation as WSL root')
try:user=pwd.getpwnam(account)
except KeyError:
    subprocess.run(['useradd','--create-home','--shell','/bin/bash',account],check=True)
    user=pwd.getpwnam(account)
if user.pw_uid==0:raise SystemExit('Development account must be unprivileged')
state=Path(user.pw_dir)/'bmw-emulator'
state.mkdir(mode=0o700,exist_ok=True)
if state.is_symlink() or state.resolve().parent!=Path(user.pw_dir).resolve():raise SystemExit('Unexpected development directory')
for command in ['node','python3','gcc','chromium']:
    if not shutil.which(command):raise SystemExit('Missing WSL dependency: '+command)
for part in ['kit','oap-sdk']:
    if not (upstream/part).is_dir():raise SystemExit('Missing local SDK kit: '+part)
# Keep proprietary SDK files in the user's private Linux directory.
kit=state/'kit'
if not (kit/'tools/emu.js').exists():
    shutil.copytree(upstream/'kit',kit,dirs_exist_ok=True)
sys.path.insert(0,str(project/'tools'))
from kit_shutdown import patch_shutdown
patch_shutdown(kit)
# Respect an app's explicit touch claim in the former HMI back-column area.
emu=kit/'tools/emu.js';text=emu.read_text()
old='const col = x < BACK_COL.w && y < BACK_COL.h;'
new='const col = !mine && x < BACK_COL.w && y < BACK_COL.h;'
if old in text:emu.write_text(text.replace(old,new,1))
elif new not in text:raise SystemExit('Unexpected SDK emulator touch routing')
fonts=project/'.local/browser-fonts'
if not (fonts/'label.json').is_file():raise SystemExit('Generate Unicode fonts with tools/build_browser_fonts.py first')
for name in ['label.json','bold.json','light.json','Ubuntu-LICENCE.txt','Ubuntu-COPYRIGHT.txt']:
    shutil.copyfile(fonts/name,kit/'runtime/fonts'/name)
sdk=state/'oap-sdk';sdk.mkdir(exist_ok=True)
for name in ['index.js','package.json']:
    shutil.copyfile(upstream/'oap-sdk'/name,sdk/name)
for name in ['apps/mgu_browser','backend/codec','data/profiles','run','dist','preview']:
    (state/name).mkdir(parents=True,exist_ok=True)
node_include='/usr/include/node'
for name in ['peer_uid','jpeg_frame']:
    command=['gcc','-shared','-fPIC','-O3','-I'+node_include,str(project/'native'/(name+'.c')),'-o',str(state/'backend'/(name+'.node'))]
    if name=='jpeg_frame':command.extend(['-ljpeg','-Wl,-rpath,$ORIGIN/codec'])
    subprocess.run(command,check=True)
shutil.copyfile('/usr/lib/x86_64-linux-gnu/libjpeg.so.62',state/'backend/codec/libjpeg.so.62')
shutil.copyfile('/usr/share/doc/libjpeg62-turbo/copyright',state/'backend/codec/COPYRIGHT.libjpeg-turbo')
chrome=Path('/opt/google/chrome/chrome')
cdm=Path('/opt/google/chrome/WidevineCdm/manifest.json')
engine=str(chrome) if chrome.is_file() and cdm.is_file() else '/usr/lib/chromium/chromium'
config={'project':str(project),'upstream':str(upstream),'state':str(state),'uid':user.pw_uid,'port':8077,'chromium':engine}
if engine==str(chrome):config['widevineVersion']=json.loads(cdm.read_text())['version']
(state/'config.json').write_text(json.dumps(config,indent=2))
(state/'provenance.json').write_text(json.dumps({'upstreamEmulatorSHA256':hashlib.sha256((upstream/'kit/tools/emu.js').read_bytes()).hexdigest(),'sdkIsLocal':True},indent=2))
for directory,dirs,files in os.walk(state):
    os.chown(directory,user.pw_uid,user.pw_gid)
    for name in files:os.chown(Path(directory)/name,user.pw_uid,user.pw_gid)
os.chmod(state,0o700);os.chmod(state/'run',0o700);os.chmod(state/'data',0o700);os.chmod(state/'data/profiles',0o700)
print(json.dumps({'prepared':str(state),'account':account,'uid':user.pw_uid,'url':'http://localhost:8077','vehicleAccess':False}))
