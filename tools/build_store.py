"""Build the Browser frontend in MGU Store's unprivileged Python sandbox.

The Store supplies oap-sdk from the owner's stock donor. Only the pinned,
public idrive7-apps kit is downloaded; no BMW SDK or Chromium is downloaded.
Exactly one frontend .tgz is written to MGU_OUT. Native runtime is separate.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import sys
import tarfile
import tempfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
KIT_COMMIT = '9b5e9cf8a49399939d51d3458fb29b6a3cec8346'
KIT_SHA256 = '153634148de77dfa88b21a3c7d9c1afd6d27ad528f932f79f98666e02dfeb150'
KIT_URL = 'https://codeload.github.com/cauliflowermossgrape/idrive7-apps/tar.gz/' + KIT_COMMIT
ARCHIVE_LIMIT = 64 * 1024 * 1024
TREE_LIMIT = 32 * 1024 * 1024


def kit_archive(destination):
    local = os.environ.get('MGU_KIT_ARCHIVE')  # Optional offline fixture; same mandatory hash.
    source = open(local, 'rb') if local else urllib.request.urlopen(KIT_URL, timeout=40)
    total = 0
    digest = hashlib.sha256()
    with source, destination.open('xb') as output:
        while True:
            chunk = source.read(128 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > ARCHIVE_LIMIT:
                raise RuntimeError('Public kit archive exceeds build budget')
            digest.update(chunk)
            output.write(chunk)
    if digest.hexdigest() != KIT_SHA256:
        raise RuntimeError('Public kit archive checksum differs; refusing to execute it')


def extract_kit(archive, destination):
    prefix = 'idrive7-apps-' + KIT_COMMIT + '/'
    size = count = 0
    with tarfile.open(archive, 'r:gz') as package:
        for member in package:
            if not member.name.startswith(prefix):
                continue
            name = member.name[len(prefix):]
            if not (name.startswith('kit/') or name == 'LICENSE'):
                continue
            parts = PurePosixPath(name)
            if parts.is_absolute() or '..' in parts.parts or '\\' in name:
                raise RuntimeError('Unsafe public kit path')
            if member.isdir():
                continue
            if not member.isfile() or member.size > 16 * 1024 * 1024:
                raise RuntimeError('Unsupported public kit entry')
            size += member.size
            count += 1
            if size > TREE_LIMIT or count > 4096:
                raise RuntimeError('Public kit exceeds build budget')
            target = destination.joinpath(*parts.parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            with package.extractfile(member) as source, target.open('xb') as output:
                shutil.copyfileobj(source, output, 128 * 1024)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--app', required=True)
    parser.add_argument('--version', required=True)
    parser.add_argument('--source', required=True)
    args = parser.parse_args()
    if hasattr(os, 'geteuid') and os.geteuid() == 0:
        raise SystemExit('Run the Store build as an unprivileged user')
    if not re.fullmatch(r'[a-z0-9][a-z0-9_-]{0,63}', args.app):
        raise SystemExit('Invalid app id')
    if not re.fullmatch(r'(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)', args.version):
        raise SystemExit('Invalid app version')
    source = (ROOT / args.source).resolve()
    if source.parent != ROOT / 'apps' or source.is_symlink():
        raise SystemExit('Expected an app folder inside apps/')
    spec = json.loads((source / 'app.json').read_text(encoding='utf-8'))
    if spec.get('id') != args.app or spec.get('version') != args.version:
        raise SystemExit('Store identity differs from app.json')
    sdk = ROOT / 'oap-sdk'
    if not all((sdk / name).is_file() for name in ('index.js', 'package.json')):
        raise SystemExit('MGU Store must supply the local donor SDK with build.sdk')
    if not os.environ.get('MGU_OUT'):
        raise SystemExit('MGU_OUT must name the Store output folder')
    output = Path(os.environ['MGU_OUT']).resolve()
    output.mkdir(parents=True, exist_ok=True)
    if any(output.iterdir()):
        raise SystemExit('MGU_OUT must be empty')
    with tempfile.TemporaryDirectory(prefix='mgu-browser-store-') as temporary:
        work = Path(temporary)
        archive = work / 'kit.tar.gz'
        kit_archive(archive)
        extract_kit(archive, work)
        archive.unlink()
        target = work / 'apps' / args.app
        target.mkdir(parents=True)
        for name in ('app.json', 'main.js', 'chromium_frontend.js'):
            shutil.copyfile(source / name, target / name)
        legacy = {'native_reader.js', 'http_reader.js', 'html_page.js', 'html5_parser.js', 'park_gate.js', 'vehicle_signals.js'}
        for module in (ROOT / 'src').glob('*.js'):
            if module.name not in legacy:
                shutil.copyfile(module, target / module.name)
        tool = work / 'kit' / 'tools' / 'build.py'
        sys.path.insert(0, str(tool.parent))
        module_spec = importlib.util.spec_from_file_location('store_mgu_build', tool)
        build = importlib.util.module_from_spec(module_spec)
        module_spec.loader.exec_module(build)
        build.SDK = str(sdk)
        build.APPS = str(target.parent)
        build.DIST = str(work / 'dist')
        build.build(args.app)
        package = work / 'dist' / args.app / 'source'
        manifest = package / 'package.json'
        metadata = json.loads(manifest.read_text(encoding='utf-8'))
        metadata['mguHmi'] = ['ID7']
        manifest.write_text(json.dumps(metadata, indent=2) + '\n', encoding='utf-8')
        shutil.copyfile(work / 'LICENSE', package / 'javascript' / 'kit' / 'LICENSE.idrive7-apps')
        artifact = output / (args.app + '@' + args.version + '.tgz')
        with tarfile.open(artifact, 'w:gz') as result:
            for entry in sorted(package.iterdir()):
                result.add(entry, arcname=entry.name)
        print('Store frontend package: ' + artifact.name)


if __name__ == '__main__':
    main()
