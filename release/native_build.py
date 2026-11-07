"""Build the browser's own audio helpers without redistributing firmware libraries.

The changed privilege launcher uses pinned public Debian musl development files.
The audio bridge uses the stock headunit loader/libc and resolves firmware ALSA
at runtime. Its ELF imports are checked before it can enter a Store artifact.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import urllib.request

MUSL_URL = 'https://deb.debian.org/debian/pool/main/m/musl/musl-dev_1.2.3-1_amd64.deb'
MUSL_SHA256 = '7c34f29a0c1aa12f6da1d25ed6de6fe6bbd9e048ee76b3dcb88c5e51fb65507f'
MUSL_SIZE = 587336
FIRMWARE_LOADER = '/lib/ld-linux-x86-64.so.2'


def sha(file):
    return hashlib.sha256(Path(file).read_bytes()).hexdigest()


def run(args):
    return subprocess.check_output([str(a) for a in args], text=True).strip()


def prepare_sysroot(output, archive=None):
    output = Path(output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    if any(output.iterdir()):
        raise RuntimeError('Native sysroot output must be empty')
    if archive is None:
        archive = output / 'musl-dev.deb'
        with urllib.request.urlopen(MUSL_URL, timeout=40) as source, archive.open('xb') as target:
            data = source.read(MUSL_SIZE + 1)
            target.write(data)
    archive = Path(archive).resolve()
    if archive.stat().st_size != MUSL_SIZE or sha(archive) != MUSL_SHA256:
        raise RuntimeError('Pinned Debian musl development archive differs')
    run(['dpkg-deb', '-x', archive, output])
    record = {'package': 'musl-dev', 'version': '1.2.3-1', 'sourcePackage': 'musl',
              'url': MUSL_URL, 'sha256': MUSL_SHA256, 'size': MUSL_SIZE,
              'verification': 'SHA-256 pinned from Debian signed bookworm Packages index'}
    (output / 'toolchain-input.json').write_text(json.dumps(record, indent=2) + '\n')
    return record


def musl_specs(sysroot, work):
    sysroot = Path(sysroot).resolve()
    record = json.loads((sysroot / 'toolchain-input.json').read_text())
    if record.get('sha256') != MUSL_SHA256 or record.get('version') != '1.2.3-1':
        raise RuntimeError('Unexpected native sysroot provenance')
    # Paths only select the verified public headers/static libc; nothing in the
    # headunit's system libraries is copied or replaced.
    text = (sysroot / 'usr/lib/x86_64-linux-musl/musl-gcc.specs').read_text()
    text = text.replace('/usr/include/x86_64-linux-musl', str(sysroot / 'usr/include/x86_64-linux-musl'))
    text = text.replace('/usr/lib/x86_64-linux-musl', str(sysroot / 'usr/lib/x86_64-linux-musl'))
    output = Path(work) / 'musl-local.specs'
    output.write_text(text)
    return output, record


def audit_elf(file, static=False):
    file = Path(file)
    header = run(['readelf', '-h', file])
    if 'ELF64' not in header or 'Advanced Micro Devices X86-64' not in header:
        raise RuntimeError('Native helper must be Linux x86_64 ELF64')
    program = run(['readelf', '-lW', file])
    dynamic = run(['readelf', '-dW', file])
    versions = run(['readelf', '--dyn-syms', '--wide', file])
    required = sorted(set(re.findall(r'GLIBC_(\d+(?:\.\d+)+)', versions)), key=lambda v: tuple(map(int, v.split('.'))))
    needed = re.findall(r'\(NEEDED\).*?\[([^\]]+)\]', dynamic)
    interpreters = re.findall(r'Requesting program interpreter: ([^\]]+)\]', program)
    if static:
        if needed or interpreters or required:
            raise RuntimeError('Privilege launcher must be fully static')
    else:
        if interpreters != [FIRMWARE_LOADER]:
            raise RuntimeError('Audio bridge must use the stock MGU interpreter')
        if any(tuple(map(int, version.split('.'))) > (2, 27) for version in required):
            raise RuntimeError('Audio bridge imports newer than headunit GLIBC 2.27')
        if not needed or any(name not in ('libc.so.6', 'libdl.so.2', 'libpthread.so.0', 'libm.so.6') for name in needed):
            raise RuntimeError('Unexpected audio bridge shared-library dependency')
        if 'libdl.so.2' not in needed:
            raise RuntimeError('Audio bridge must load stock libdl explicitly for pre-2.34 glibc')
        if '(RPATH)' in dynamic or '(RUNPATH)' in dynamic:
            raise RuntimeError('Audio bridge cannot inherit a private engine library path')
    return {'sha256': sha(file), 'size': file.stat().st_size, 'static': static,
            'interpreter': interpreters[0] if interpreters else None,
            'needed': needed, 'glibcVersions': required, 'glibcCeiling': '2.27'}


def build_additions(root, files, work, sysroot):
    root, files, work = Path(root).resolve(), Path(files), Path(work)
    specs, toolchain = musl_specs(sysroot, work)
    common = ['-O2', '-Wall', '-Wextra', '-Werror', '-ffile-prefix-map=' + str(root) + '=.']
    backend = files / 'backend-launch'
    backend_flags = ['-specs=' + str(specs), '-static'] + common
    run(['gcc'] + backend_flags + [root / 'native/backend_launch.c', '-o', backend])
    backend.chmod(0o755)
    bridge = files / 'audio-bridge'
    bridge_flags = common + ['-Wl,--dynamic-linker=' + FIRMWARE_LOADER, '-Wl,--wrap=__libc_start_main']
    bridge_link = ['-Wl,--no-as-needed', '-l:libdl.so.2', '-Wl,--as-needed']
    run(['gcc'] + bridge_flags + [root / 'native/audio_bridge.c'] + bridge_link + ['-o', bridge])
    bridge.chmod(0o755)
    records = {'backend-launch': audit_elf(backend, static=True), 'audio-bridge': audit_elf(bridge)}
    for name, source, flags in [('backend-launch', 'backend_launch.c', backend_flags), ('audio-bridge', 'audio_bridge.c', bridge_flags + bridge_link)]:
        records[name].update({'source': 'native/' + source, 'sourceSha256': sha(root / 'native' / source),
                              'compilerFlags': [flag.replace(str(specs), '<verified-musl-specs>').replace(str(root), '.') for flag in flags]})
    return {'compiler': run(['gcc', '--version']).splitlines()[0],
            'binutils': run(['readelf', '--version']).splitlines()[0],
            'muslInput': toolchain, 'helpers': records}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', required=True, type=Path)
    parser.add_argument('--archive', type=Path, help='Optional offline copy; the same SHA-256/size pin is required')
    args = parser.parse_args()
    print(json.dumps(prepare_sysroot(args.out, args.archive), indent=2))


if __name__ == '__main__':
    main()
