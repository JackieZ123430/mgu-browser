"""Compile our Windows DPAPI key wrapper with the installed Microsoft .NET compiler."""
from pathlib import Path
import os,subprocess
ROOT=Path(__file__).resolve().parents[1]
if os.name!='nt':raise SystemExit('Build the Windows key wrapper from Windows Python')
compiler=Path(os.environ.get('WINDIR','C:/Windows'))/'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
target=ROOT/'.local/browser-dpapi.exe';target.parent.mkdir(exist_ok=True)
subprocess.run([str(compiler),'/nologo','/target:exe','/reference:System.Security.dll','/out:'+str(target),str(ROOT/'native/browser_dpapi.cs')],check=True)
print('Local Windows DPAPI helper built; binary remains in .local')
