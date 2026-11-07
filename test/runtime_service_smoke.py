#!/usr/bin/env python3
"""Start a packaged backend in an isolated Ubuntu 18 / Node 8 container.

Requires local Linux x86_64 Docker with permission for --cap-add SYS_ADMIN.
No --privileged, host namespaces, devices, host-write mounts, vehicle connection,
SDK or credentials are used. Fixture/package inputs are mounted read only. The
default synthetic engine only satisfies pre-IPC checks; --engine additionally
requires a real sandboxed Chromium frame using the exact public engine archive.
This verifies the actual root launcher, mounts, privilege drop, native Node
addons and authenticated socket. It does not run systemd or qualify the vehicle.

Example:
  python3 test/runtime_service_smoke.py --runtime /path/mgu-browser@0.13.3.tgz

To demonstrate the old failure and isolate the native fix with published JS:
  ... --runtime /path/mgu-browser@0.13.2.tgz --cases baseline --expect-exit 125
  ... --runtime /path/mgu-browser@0.13.2.tgz --launcher-override /path/fixed-helper
The override is a differential test only; final validation should omit it.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import tarfile
import tempfile
import urllib.parse
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[1]
LOCAL = ROOT / '.local'
IMAGE = 'ubuntu@sha256:152dc042452c496007f07ca9127571cb9c29697f42acbfad72324b2bb2e43c98'
NODE_URL = 'https://nodejs.org/dist/v8.16.2/node-v8.16.2-linux-x64.tar.xz'
NODE_SHA256 = '88617a293f5828cc94ee99c94a43fbea12b989e34fe643fc14885a14748a8da6'
NODE_SIZE = 11334816
NODE_MEMBER = 'node-v8.16.2-linux-x64/bin/node'
ENGINE_SHA256 = '0b6a73c964354214262d01f2d9bec2d0ab253cac8d27de04708912e804ef0874'
ENGINE_SIZE = 181048639
MARKER = 'RUNTIME_SERVICE_RESULT '


def regular(path):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
        raise RuntimeError('Expected a regular, single-link input: ' + str(path))
    return path.resolve()


def digest(path):
    hasher = hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            hasher.update(block)
    return hasher.hexdigest()


def verified_node_archive(path):
    regular(path)
    if path.stat().st_size != NODE_SIZE or digest(path) != NODE_SHA256:
        raise RuntimeError('Official Node 8 archive size/SHA-256 differs')
    return path


def prepare_node(cache, supplied):
    cache.mkdir(parents=True, exist_ok=True)
    archive = supplied or cache / 'node-v8.16.2-linux-x64.tar.xz'
    if not archive.exists():
        if supplied:
            raise RuntimeError('Supplied Node archive does not exist')
        with tempfile.NamedTemporaryFile(dir=cache, prefix='node-download-', delete=False) as target:
            temporary = Path(target.name)
            try:
                with urllib.request.urlopen(NODE_URL, timeout=40) as response:
                    final = urllib.parse.urlparse(response.geturl())
                    if final.scheme != 'https' or final.hostname != 'nodejs.org':
                        raise RuntimeError('Unexpected Node archive redirect')
                    target.write(response.read(NODE_SIZE + 1))
                target.flush()
                verified_node_archive(temporary)
                temporary.replace(archive)
            finally:
                temporary.unlink(missing_ok=True)
    verified_node_archive(archive)
    # Extract only the named, verified executable; never invoke tar against the
    # host filesystem or run an install/maintainer script.
    executable = cache / ('node-' + NODE_SHA256[:16])
    with tarfile.open(archive, 'r:xz') as source:
        member = source.getmember(NODE_MEMBER)
        if not member.isfile():
            raise RuntimeError('Node binary archive member is not a regular file')
        payload = source.extractfile(member).read()
    if executable.exists():
        regular(executable)
        if executable.read_bytes() != payload:
            raise RuntimeError('Cached Node executable differs')
    else:
        with executable.open('xb') as target:
            target.write(payload)
        executable.chmod(0o755)
    return executable.resolve()


def local_cache(value):
    if value.is_symlink():
        raise RuntimeError('Fixture cache must not be a symlink')
    result = value.resolve()
    if LOCAL.resolve() not in result.parents:
        raise RuntimeError('Fixture cache must be below this repository .local directory')
    return result


def docker_output(*args):
    return subprocess.check_output(['docker', *args], text=True).strip()


def verify_local_docker():
    # Prevent an accidental Docker context from running this fixture against a
    # remote host. The Docker API is trusted to provide isolated local mounts.
    endpoint = (os.environ.get('DOCKER_HOST') if not os.environ.get('DOCKER_CONTEXT') else None) or docker_output(
        'context', 'inspect', '--format', '{{(index .Endpoints "docker").Host}}')
    if not endpoint.startswith('unix:///'):
        raise RuntimeError('This test requires a local Unix-socket Docker endpoint')
    info = json.loads(docker_output('info', '--format', '{{json .}}'))
    if info.get('OSType') != 'linux' or info.get('Architecture') not in ('x86_64', 'amd64'):
        raise RuntimeError('This test requires a local Linux x86_64 Docker daemon')
    return {'endpoint': endpoint, 'securityOptions': info.get('SecurityOptions', []),
            'cgroupVersion': info.get('CgroupVersion'),
            'systemdAndResourceLimitsTested': False}


def run_case(runtime, node, case, launcher, expected_exit, engine, unconfined_apparmor):
    name = 'mgu-browser-start-fixture-' + uuid.uuid4().hex[:16]
    command = ['docker', 'run', '--rm', '--name', name, '--platform', 'linux/amd64',
               '--network', 'none', '--cap-add', 'SYS_ADMIN']
    if unconfined_apparmor:
        # docker-default denies mount even with SYS_ADMIN. Only this disposable
        # fixture needs mounts; Docker seccomp and Chromium's sandbox stay on.
        command += ['--security-opt', 'apparmor=unconfined']
    values = {'APP_UID': str(case['appUid']), 'AUDIO_FIXTURE': '1' if case['audio'] else '0',
              'LEGACY_DIR': 'all' if case['legacy'] else ''}
    if expected_exit is not None:
        values['EXPECT_LAUNCH_EXIT'] = str(expected_exit)
    inputs = [(ROOT / 'test/runtime_service_fixture.js', '/fixture.js'),
              (node, '/usr/bin/node'), (runtime, '/runtime.tgz')]
    if launcher:
        values['HELPER_OVERRIDE'] = '1'
        inputs.append((launcher, '/fixed-helper'))
    if engine:
        values['ENGINE_FIXTURE'] = '1'
        inputs.append((engine, '/engine.tgz'))
    for key, value in values.items():
        command += ['--env', key + '=' + value]
    for source, target in inputs:
        if ',' in str(source):
            raise RuntimeError('Docker bind input path must not contain a comma')
        command += ['--mount', 'type=bind,src=' + str(source) + ',dst=' + target + ',readonly']
    command += [IMAGE, '/usr/bin/node', '/fixture.js']
    try:
        completed = subprocess.run(command, text=True, stdout=subprocess.PIPE,
                                   stderr=subprocess.STDOUT, timeout=90 if engine else 45)
    except subprocess.TimeoutExpired:
        subprocess.run(['docker', 'rm', '-f', name], stdout=subprocess.DEVNULL,
                       stderr=subprocess.DEVNULL, check=False, timeout=10)
        raise
    print(completed.stdout, end='', flush=True)
    records = [json.loads(line[len(MARKER):]) for line in completed.stdout.splitlines()
               if line.startswith(MARKER)]
    if completed.returncode or len(records) != 1 or not records[0].get('success'):
        raise RuntimeError('Packaged root startup fixture failed: ' + json.dumps(case))
    return records[0]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', required=True, type=Path)
    parser.add_argument('--node-archive', type=Path,
                        help='Optional cached official Node tar.xz; exact size/hash enforced')
    parser.add_argument('--cache', type=Path, default=LOCAL / 'runtime-service-cache')
    parser.add_argument('--launcher-override', type=Path,
                        help='Differential test only: replace just the packaged backend-launch')
    parser.add_argument('--cases', choices=('baseline', 'migration', 'all'), default='all')
    parser.add_argument('--engine', type=Path,
                        help='Optional exact public engine 0.1.0 archive: require a real sandboxed Chromium IPC frame')
    parser.add_argument('--expect-exit', type=int,
                        help='Regression proof: expect the old launcher to exit before socket creation')
    args = parser.parse_args()
    runtime = regular(args.runtime)
    launcher = regular(args.launcher_override) if args.launcher_override else None
    engine = regular(args.engine) if args.engine else None
    if engine and (engine.stat().st_size != ENGINE_SIZE or digest(engine) != ENGINE_SHA256):
        raise RuntimeError('Immutable public engine 0.1.0 size/SHA-256 differs')
    environment = verify_local_docker()
    unconfined_apparmor = 'name=apparmor' in environment['securityOptions']
    environment['fixtureAppArmor'] = 'unconfined' if unconfined_apparmor else 'unchanged'
    node = prepare_node(local_cache(args.cache), args.node_archive)
    cases = [{'appUid': uid, 'audio': audio, 'legacy': legacy}
             for legacy in (False, True)
             for uid, audio in ((13001, False), (14876, True))
             if args.cases == 'all' or (args.cases == 'migration') == legacy]
    result = {'purpose': 'Packaged startup, no physical headunit or systemd qualification',
              'runtime': {'path': str(runtime), 'sha256': digest(runtime)},
              'node': {'url': NODE_URL, 'archiveSha256': NODE_SHA256,
                       'pinSource': 'https://nodejs.org/dist/v8.16.2/SHASUMS256.txt'},
              'image': IMAGE, 'environment': environment,
              'launcherOverride': {'path': str(launcher), 'sha256': digest(launcher)} if launcher else None,
              'engine': {'sha256': ENGINE_SHA256, 'version': '0.1.0',
                         'url': 'https://github.com/pllanaio/mgu-browser/releases/download/v0.10.0/mgu-browser-engine%400.1.0.tgz'} if engine else None,
              'cases': [run_case(runtime, node, case, launcher, args.expect_exit, engine,
                                 unconfined_apparmor) for case in cases]}
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
