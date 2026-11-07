#!/usr/bin/env python3
"""Check fullscreen pixels and real-time PCM using exact Store packages.

Uses a digest-pinned Ubuntu 18 container, pinned Node 8/public ALSA inputs,
immutable engine 0.1.0 and the actual runtime's backend, native JPEG addon and
audio helper. Only fixed test/package inputs are mounted read-only. Docker uses
isolated namespaces and no network; SYS_ADMIN supports Chromium's own sandbox.
This is no physical BMW speaker, provider or firmware qualification.
"""
import argparse
import json
from pathlib import Path
import shutil
import subprocess
import uuid

import prepare_audio_abi_fixture as alsa
import runtime_service_smoke as startup

ROOT = Path(__file__).resolve().parents[1]
MARKER = 'PACKAGED_FULLSCREEN_RESULT '


def clip_file(cache, supplied):
    if supplied:
        clip = startup.regular(supplied)
    else:
        ffmpeg = shutil.which('ffmpeg')
        if not ffmpeg:
            raise RuntimeError('Host ffmpeg is required to generate the authored clip, or supply --clip')
        clip = cache / 'authored-video.webm'
        if clip.exists() or clip.is_symlink():
            startup.regular(clip)
        command = [ffmpeg, '-hide_banner', '-loglevel', 'error', '-f', 'lavfi',
                   '-i', 'testsrc2=size=320x180:rate=30', '-f', 'lavfi',
                   '-i', 'sine=frequency=440:sample_rate=48000', '-t', '12',
                   '-c:v', 'libvpx', '-b:v', '180k', '-c:a', 'libopus',
                   '-b:a', '48k', '-f', 'webm', 'pipe:1']
        data = subprocess.check_output(command, timeout=45)
        if not 0 < len(data) < 3 * 1024 * 1024:
            raise RuntimeError('Authored clip is not bounded')
        with clip.open('wb') as output:
            output.write(data)
        print(subprocess.check_output([ffmpeg, '-version'], text=True, timeout=5).splitlines()[0], flush=True)
    if not 0 < clip.stat().st_size < 3 * 1024 * 1024:
        raise RuntimeError('Expected a nonempty authored clip smaller than 3 MiB')
    return startup.regular(clip)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', required=True, type=Path)
    parser.add_argument('--engine', required=True, type=Path)
    parser.add_argument('--node-archive', type=Path)
    parser.add_argument('--clip', type=Path, help='Optional authored 320x180 VP8/Opus clip; default generates one with host ffmpeg')
    parser.add_argument('--cache', type=Path, default=ROOT / '.local/fullscreen-package-cache')
    args = parser.parse_args()
    runtime, engine = startup.regular(args.runtime), startup.regular(args.engine)
    if engine.stat().st_size != startup.ENGINE_SIZE or startup.digest(engine) != startup.ENGINE_SHA256:
        raise RuntimeError('Immutable public engine 0.1.0 size/SHA-256 differs')
    environment = startup.verify_local_docker()
    cache = startup.local_cache(args.cache);cache.mkdir(parents=True, exist_ok=True)
    node = startup.prepare_node(cache, args.node_archive)
    alsa_cache = cache / 'alsa';alsa_cache.mkdir(exist_ok=True)
    archive = alsa.archive(alsa.PACKAGES[1], alsa_cache)
    clip = clip_file(cache, args.clip)
    unconfined = 'name=apparmor' in environment['securityOptions']
    environment['fixtureAppArmor'] = 'unconfined' if unconfined else 'unchanged'
    name = 'mgu-browser-fullscreen-' + uuid.uuid4().hex[:16]
    command = ['docker', 'run', '--rm', '--name', name, '--platform', 'linux/amd64',
               '--network', 'none', '--cap-add', 'SYS_ADMIN']
    if unconfined:
        command += ['--security-opt', 'apparmor=unconfined']
    inputs = [(ROOT / 'test/fullscreen_audio_package_fixture.js', '/fixture.js'),
              (ROOT / 'test/chromium_fullscreen_audio_smoke.js', '/fullscreen-smoke.js'),
              (ROOT / 'test/media_fullscreen_smoke.js', '/media-fullscreen-smoke.js'),
              (ROOT / 'test/controller_video_smoke.js', '/controller-video-smoke.js'),
              (node, '/usr/bin/node'), (runtime, '/runtime.tgz'),
              (engine, '/engine.tgz'), (archive, '/old-alsa.deb'), (clip, '/clip.webm')]
    for source, target in inputs:
        source = startup.regular(source)
        if ',' in str(source):
            raise RuntimeError('Docker bind input path must not contain a comma')
        command += ['--mount', 'type=bind,src=' + str(source) + ',dst=' + target + ',readonly']
    command += [startup.IMAGE, '/usr/bin/node', '/fixture.js']
    try:
        result = subprocess.run(command, text=True, stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT, timeout=150)
    except subprocess.TimeoutExpired:
        subprocess.run(['docker', 'rm', '-f', name], stdout=subprocess.DEVNULL,
                       stderr=subprocess.DEVNULL, check=False, timeout=10)
        raise
    print(result.stdout, end='', flush=True)
    records = [json.loads(line[len(MARKER):]) for line in result.stdout.splitlines() if line.startswith(MARKER)]
    if result.returncode or len(records) != 1 or not records[0].get('success'):
        raise RuntimeError('Exact packaged fullscreen/video/audio test failed')
    print(json.dumps({'purpose': 'Actual packaged video/PCM continuity; no physical vehicle qualification',
                      'runtimeSha256': startup.digest(runtime), 'engineSha256': startup.ENGINE_SHA256,
                      'nodeArchiveSha256': startup.NODE_SHA256, 'image': startup.IMAGE,
                      'alsa': alsa.PACKAGES[1], 'clipSha256': startup.digest(clip),
                      'clipSize': clip.stat().st_size, 'environment': environment,
                      'result': records[0]}, indent=2))


if __name__ == '__main__':
    main()
