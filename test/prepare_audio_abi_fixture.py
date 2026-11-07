#!/usr/bin/env python3
"""Download/extract pinned public Ubuntu 18 libraries for an audio ABI test.

This is a test fixture, never a runtime/Store asset or a host installation.
Run unprivileged with --out .local/audio-abi-test/root. Then test the actual
packaged helper through test/chromium_vehicle_audio_smoke.js, setting:
  MGU_AUDIO_BRIDGE=<unpacked-package>/files/audio-bridge
  MGU_AUDIO_LOADER=<out>/lib/x86_64-linux-gnu/ld-2.27.so
  MGU_AUDIO_LIBRARY_PATH=<out>/lib/x86_64-linux-gnu:<out>/usr/lib/x86_64-linux-gnu
Only the helper receives the old library path; Node and Chromium keep theirs.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import tempfile
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
LOCAL = ROOT / '.local'
BASE = 'https://archive.ubuntu.com/ubuntu/'
PACKAGES = (
    {'package': 'libc6', 'version': '2.27-3ubuntu1.6', 'architecture': 'amd64',
     'filename': 'pool/main/g/glibc/libc6_2.27-3ubuntu1.6_amd64.deb',
     'size': 2831000,
     'sha256': '5b813d4512491cd8fb30b2eb9192349ee75ffe3c9f21ae136cc7b2429f70c3b2'},
    {'package': 'libasound2', 'version': '1.1.3-5ubuntu0.6', 'architecture': 'amd64',
     'filename': 'pool/main/a/alsa-lib/libasound2_1.1.3-5ubuntu0.6_amd64.deb',
     'size': 359884,
     'sha256': '9f708b08cd507d61a26e350b4d421681131b0e283f3b65ff41b05e737b21e79a'},
)
# Pins checked against a cryptographically verified Ubuntu InRelease on
# 2026-11-07. The archive key fingerprint, not its display name, was checked.
# The signed Packages index then supplied each exact .deb size and SHA-256.
PROVENANCE = {
    'inReleaseUrl': BASE + 'dists/bionic-updates/InRelease',
    'inReleaseSha256': '87c730e09c78f2c40ab8ea92e897e5868f1db1427d1f770432e6547e1bd5dda8',
    'releaseDate': '2026-11-06T21:00:57Z',
    'signerFingerprint': '790BC7277767219C42C86F933B4FE6ACC0B21F32',
    'keyUrl': 'https://keyserver.ubuntu.com/pks/lookup?op=get&search=0x790BC7277767219C42C86F933B4FE6ACC0B21F32',
    'packagesUrl': BASE + 'dists/bionic-updates/main/binary-amd64/Packages.xz',
    'packagesSize': 3092476,
    'packagesSha256': 'c0ad42b92b0efa5f65fb51f56b1d39e12330982a5e85304fe152db782a985eb0',
    'verification': 'Pinned from Ubuntu signed InRelease and its SHA-256 Packages index; downloads rechecked by exact size and SHA-256',
}


def local_path(value):
    """Keep all extraction/download output inside the repository's ignored tree."""
    raw = Path(value)
    if raw.is_symlink():
        raise RuntimeError('Fixture output must not be a symbolic link')
    path = raw.resolve()
    if LOCAL.resolve() not in path.parents:
        raise RuntimeError('Fixture output must be inside this repository .local directory')
    return path


def verify(file, package):
    info = file.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_size != package['size']:
        raise RuntimeError('Unexpected fixture archive size/type: ' + file.name)
    if hashlib.sha256(file.read_bytes()).hexdigest() != package['sha256']:
        raise RuntimeError('Fixture archive SHA-256 differs: ' + file.name)


def archive(package, cache):
    file = cache / Path(package['filename']).name
    if file.exists() or file.is_symlink():
        verify(file, package)
        return file
    with tempfile.NamedTemporaryFile(prefix='ubuntu-audio-', dir=cache, delete=False) as target:
        temporary = Path(target.name)
        try:
            with urllib.request.urlopen(BASE + package['filename'], timeout=40) as response:
                final = urllib.parse.urlparse(response.geturl())
                if final.scheme != 'https' or final.hostname != 'archive.ubuntu.com':
                    raise RuntimeError('Unexpected Ubuntu archive redirect')
                target.write(response.read(package['size'] + 1))
            target.flush()
            verify(temporary, package)
            temporary.replace(file)
        finally:
            if temporary.exists():
                temporary.unlink()
    return file


def prepare(output, cache):
    if os.geteuid() == 0:
        raise RuntimeError('Run the test fixture as an unprivileged user')
    output, cache = local_path(output), local_path(cache)
    if output.exists() and any(output.iterdir()):
        raise RuntimeError('Fixture output must be empty')
    cache.mkdir(parents=True, exist_ok=True)
    archives = [archive(package, cache) for package in PACKAGES]
    # dpkg-deb only extracts files. It runs no maintainer scripts and does not
    # register/install a package, change ld.so configuration, or replace libc.
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='audio-abi-extract-', dir=output.parent) as stage:
        stage = Path(stage)
        for file in archives:
            subprocess.run(['dpkg-deb', '-x', str(file), str(stage)], check=True)
        for required in ('lib/x86_64-linux-gnu/ld-2.27.so',
                         'lib/x86_64-linux-gnu/libc-2.27.so',
                         'lib/x86_64-linux-gnu/libdl-2.27.so',
                         'usr/lib/x86_64-linux-gnu/libasound.so.2.0.0'):
            if not (stage / required).is_file():
                raise RuntimeError('Incomplete old ABI fixture: ' + required)
        record = {'purpose': 'CI test only; never distributed with the application',
                  'provenance': PROVENANCE,
                  'packages': [dict(package, url=BASE + package['filename']) for package in PACKAGES]}
        (stage / 'audio-abi-fixture.json').write_text(json.dumps(record, indent=2) + '\n')
        output.mkdir(exist_ok=True)
        shutil.copytree(stage, output, symlinks=True, dirs_exist_ok=True)
    return {'root': str(output),
            'loader': str(output / 'lib/x86_64-linux-gnu/ld-2.27.so'),
            'libraryPath': str(output / 'lib/x86_64-linux-gnu') + ':' + str(output / 'usr/lib/x86_64-linux-gnu'),
            'provenance': PROVENANCE}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', required=True, type=Path)
    parser.add_argument('--cache', default=LOCAL / 'audio-abi-cache', type=Path)
    args = parser.parse_args()
    print(json.dumps(prepare(args.out, args.cache), indent=2))
