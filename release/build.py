"""Build SDK-free frontend, native runtime and versioned Debian Chromium tools.

Linux build host only. Reads APT-installed public packages, writes only --out
and temporary staging. No vehicle connection, credentials or profiles.
"""
import argparse
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tarfile
import tempfile

ROOT = Path(__file__).resolve().parents[1]
VERSION = '0.10.0'
ENGINE_VERSION = '0.1.0'
ENGINE_PREFIX = '/var/opt/mgu-browser-engine/versions/' + ENGINE_VERSION + '/engine'


def sha(file):
    value = hashlib.sha256()
    with Path(file).open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            value.update(chunk)
    return value.hexdigest()


def run(args, **kwargs):
    return subprocess.check_output([str(a) for a in args], text=True, **kwargs).strip()


def tool(stage, metadata, output):
    rows = []
    for file in sorted((stage / 'files').rglob('*')):
        if file.is_file():
            rows.append({'path': file.relative_to(stage / 'files').as_posix(), 'mode': format(file.stat().st_mode & 0o7777, '04o'), 'sha256': sha(file)})
    metadata['files'] = rows
    (stage / 'component.json').write_text(json.dumps(metadata, indent=2) + '\n')
    # Tar needs only regular entries; intermediate directories are created on extraction.
    artifact = output / (metadata['id'] + '@' + metadata['version'] + '.tgz')
    with artifact.open('wb') as raw, gzip.GzipFile(fileobj=raw, filename='', mode='wb', mtime=0, compresslevel=3) as gz, tarfile.open(fileobj=gz, mode='w') as archive:
        for file in sorted(stage.rglob('*')):
            if file.is_dir():
                continue
            if file.is_symlink() or not file.is_file():
                raise RuntimeError('Nonregular tool payload')
            item = tarfile.TarInfo(file.relative_to(stage).as_posix())
            item.size = file.stat().st_size
            item.mode = file.stat().st_mode & 0o7777
            item.uid = item.gid = item.mtime = 0
            with file.open('rb') as source:
                archive.addfile(item, source)
    return {'id': metadata['id'], 'kind': 'tool', 'version': metadata['version'], 'title': metadata['title'], 'mguHmi': ['ID7'], 'artifact': {'name': artifact.name, 'size': artifact.stat().st_size, 'sha256': sha(artifact)}, 'requires': metadata.get('requires', {}), 'uninstallable': True}


def copy(source, destination, mode=0o644):
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, destination)
    destination.chmod(mode)


def owner(file):
    candidates = [str(file)]
    if str(file).startswith('/usr/lib/'):
        candidates.append(str(file)[4:])
    elif str(file).startswith('/lib/'):
        candidates.append('/usr' + str(file))
    for candidate in candidates:
        p = subprocess.run(['dpkg-query', '-S', candidate], capture_output=True, text=True)
        if p.returncode == 0:
            return p.stdout.split(': ')[0]
    raise RuntimeError('No Debian package owns ' + str(file))


def provenance(packages):
    result = []
    for package in sorted(packages):
        fields = run(['dpkg-query', '-W', '-f=${binary:Package}\t${Version}\t${source:Package}\t${source:Version}', package]).split('\t')
        if len(fields) != 4:
            raise RuntimeError('Missing package source identity')
        result.append(dict(zip(['binary', 'version', 'source', 'sourceVersion'], fields)))
    return result


def build_engine(work, output):
    stage = work / 'engine-tool'
    engine = stage / 'files' / 'engine'
    source = Path('/usr/lib/chromium')
    shutil.copytree(source, engine, symlinks=False)
    if any('widevine' in p.name.lower() for p in engine.rglob('*')):
        raise RuntimeError('Proprietary CDM must not be redistributed')
    executables = [p for p in engine.rglob('*') if p.is_file() and p.open('rb').read(4) == b'\x7fELF']
    libraries = {}
    inputs = {}
    dynamic = []
    for name in ['libsoftokn3.so', 'libfreeblpriv3.so', 'libnssckbi.so', 'libnssdbm3.so', 'libdl.so.2', 'libpthread.so.0', 'librt.so.1']:
        p = Path('/usr/lib/x86_64-linux-gnu') / name
        if p.is_file():
            libraries[name] = p
            dynamic.append(p)
    for file in executables + dynamic:
        text = run(['ldd', file])
        if 'not found' in text:
            raise RuntimeError('Missing library for ' + file.name)
        for name in re.findall(r'(?:=>\s*)?(/[^\s()]+)', text):
            p = Path(name)
            if p.is_file():
                libraries[p.name] = p
    packages = {'chromium', 'chromium-common', 'chromium-sandbox', 'fonts-dejavu-core'}
    for name, file in sorted(libraries.items()):
        copy(file, engine / 'lib' / name)
        packages.add(owner(file))
        inputs['lib/' + name] = {'sha256': sha(file), 'package': owner(file)}
    for file in executables:
        original = source / file.relative_to(engine)
        inputs[file.relative_to(engine).as_posix()] = {'sha256': sha(original), 'package': owner(original)}
        if subprocess.run(['patchelf', '--print-interpreter', str(file)], capture_output=True).returncode == 0:
            run(['patchelf', '--set-interpreter', ENGINE_PREFIX + '/lib/ld-linux-x86-64.so.2', file])
        run(['patchelf', '--force-rpath', '--set-rpath', ENGINE_PREFIX + '/lib', file])
    for file in (engine / 'lib').iterdir():
        if file.name != 'ld-linux-x86-64.so.2':
            run(['patchelf', '--force-rpath', '--set-rpath', ENGINE_PREFIX + '/lib', file])
    for file in engine.rglob('*'):
        file.chmod(0o755 if file.is_dir() or file in executables else 0o644)
    (engine / 'lib/ld-linux-x86-64.so.2').chmod(0o755)
    (engine / 'chrome-sandbox').chmod(0o4755)
    copy('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', engine / 'fonts/DejaVuSans.ttf')
    (engine / 'fonts.conf').write_text('<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><dir>' + ENGINE_PREFIX + '/fonts</dir><cachedir>/var/opt/mgu-browser/work/cache/fonts</cachedir></fontconfig>\n')
    package_info = provenance(packages)
    notices = engine / 'licenses'
    notices.mkdir()
    for p in package_info:
        name = p['binary'].split(':')[0]
        notice = Path('/usr/share/doc') / name / 'copyright'
        if not notice.is_file():
            raise RuntimeError('Missing copyright file for ' + name)
        copy(notice, notices / (name + '.copyright'))
    for notice in Path('/usr/share/common-licenses').iterdir():
        if notice.is_file():
            copy(notice, notices / notice.name)
    version = run(['dpkg-query', '-W', '-f=${Version}', 'chromium'])
    record = {'enginePackage': 'Debian chromium', 'engineVersion': version, 'componentVersion': ENGINE_VERSION, 'enginePrefix': ENGINE_PREFIX, 'inputs': inputs, 'packages': package_info, 'patches': 'PT_INTERP and DT_RPATH only; release/build.py', 'chromiumSha256': sha(engine / 'chromium'), 'widevineIncluded': False}
    (engine / 'build-provenance.json').write_text(json.dumps(record, indent=2) + '\n')
    (output / 'engine-provenance.json').write_text(json.dumps(record, indent=2) + '\n')
    copy(ROOT / 'release/engine_check.sh', stage / 'files/check.sh', 0o755)
    copy(ROOT / 'release/engine_activate.js', stage / 'files/activate.js')
    copy(ROOT / 'release/engine_deactivate.js', stage / 'files/deactivate.js')
    copy(ROOT / 'LICENSE', stage / 'files/LICENSE')
    return tool(stage, {'id': 'mgu-browser-engine', 'kind': 'tool', 'version': ENGINE_VERSION, 'title': 'Browser Chromium engine (experimental)', 'mguHmi': ['ID7'], 'requires': {'mgu-deploy': '0.7.17'}, 'check': ['check.sh'], 'activate': ['node', 'activate.js'], 'deactivate': ['node', 'deactivate.js'], 'crashNames': ['chromium', 'chrome-sandbox', 'chrome_crashpad']}, output)


def build_runtime(work, output):
    stage = work / 'runtime-tool'
    files = stage / 'files'
    legacy = {'native_reader.js', 'http_reader.js', 'html_page.js', 'html5_parser.js', 'park_gate.js', 'vehicle_signals.js'}
    for file in (ROOT / 'src').glob('*.js'):
        if file.name not in legacy:
            copy(file, files / 'backend' / file.name)
    copy(ROOT / 'backend/server.js', files / 'backend/server.js')
    for name in ['control.js', 'uplink_adapter.js', 'wifi_profile.js']:
        copy(ROOT / 'network' / name, files / 'network' / name)
    for file in (ROOT / 'runtime').glob('*.js'):
        copy(file, files / 'runtime' / file.name)
    for name in ['backend_launch', 'browser_launch']:
        run(['musl-gcc', '-static', '-O2', '-Wall', '-Wextra', '-Werror', '-ffile-prefix-map=' + str(ROOT) + '=.', ROOT / 'native' / (name + '.c'), '-o', files / name.replace('_', '-')])
        (files / name.replace('_', '-')).chmod(0o755)
    for name in ['peer_uid', 'jpeg_frame']:
        args = ['gcc', '-shared', '-fPIC', '-O2', '-Wall', '-Wextra', '-DNAPI_VERSION=3', '-ffile-prefix-map=' + str(ROOT) + '=.', '-I/usr/include/node', ROOT / 'native' / (name + '.c'), '-o', files / 'backend' / (name + '.node')]
        if name == 'jpeg_frame':
            args += ['-ljpeg', '-Wl,-rpath,$ORIGIN/codec']
        run(args)
    copy('/usr/lib/x86_64-linux-gnu/libjpeg.so.62', files / 'backend/codec/libjpeg.so.62')
    copy('/usr/share/doc/libjpeg62-turbo/copyright', files / 'backend/codec/COPYRIGHT.libjpeg-turbo')
    copy('/usr/share/doc/musl/copyright', files / 'LICENSE.musl')
    copy(ROOT / 'LICENSE', files / 'LICENSE')
    copy(ROOT / 'release/runtime_check.sh', files / 'check.sh', 0o755)
    units = ['mgu-browser-backend.service', 'mgu-browser-wifi.service']
    for name in units:
        copy(ROOT / ('backend' if 'backend' in name else 'network') / name, stage / 'units' / name)
    return tool(stage, {'id': 'mgu-browser', 'kind': 'tool', 'version': VERSION, 'title': 'Browser runtime (experimental)', 'mguHmi': ['ID7'], 'internet': True, 'uids': [3911], 'requires': {'mgu-browser-engine': ENGINE_VERSION, 'mgu-uplink': '0.7.3', 'mgu-deploy': '0.7.17'}, 'units': [{'name': n} for n in units], 'enable': [{'unit': n, 'target': 'multi-user.target'} for n in units], 'recmgr': ['mgu-browser-backend', 'mgu-browser-wifi'], 'crashNames': ['backend-launch', 'browser-launch'], 'restart': units, 'check': ['check.sh']}, output)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', required=True)
    args = parser.parse_args()
    if os.name != 'posix' or os.uname().machine != 'x86_64':
        raise SystemExit('Linux x86_64 build host required')
    output = Path(args.out).resolve()
    output.mkdir(parents=True, exist_ok=True)
    if list(output.iterdir()):
        raise SystemExit('Release output must be empty')
    with tempfile.TemporaryDirectory(prefix='mgu-browser-release-') as temporary:
        work = Path(temporary)
        entries = [build_engine(work, output), build_runtime(work, output)]
    (output / 'components.json').write_text(json.dumps(entries, indent=2) + '\n')
    print(json.dumps(entries, indent=2))


if __name__ == '__main__':
    main()
