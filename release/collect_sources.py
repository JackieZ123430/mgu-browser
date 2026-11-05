"""Mirror exact corresponding Debian sources beside the published binaries.

Uses the APT source index already authenticated by apt-get update. Downloads
are HTTPS and checked against its SHA-256 and size; no source is executed.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tarfile
import urllib.request


def records(text):
    result = []
    for stanza in text.split('\n\n'):
        fields = {}
        key = None
        for line in stanza.splitlines():
            if line.startswith((' ', '\t')) and key:
                fields[key] += '\n' + line.strip()
            elif ':' in line:
                key, value = line.split(':', 1)
                fields[key] = value.lstrip()
        if fields:
            result.append(fields)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', required=True)
    parser.add_argument('--sources-list', required=True)
    args = parser.parse_args()
    output = Path(args.out).resolve()
    engine = json.loads((output / 'engine-provenance.json').read_text())
    needed = {(p['source'], p['sourceVersion']) for p in engine['packages']}
    for binary in ['libjpeg62-turbo', 'musl']:
        s = subprocess.check_output(['dpkg-query', '-W', '-f=${source:Package}\t${source:Version}', binary], text=True)
        needed.add(tuple(s.split('\t')))
    options = ['-o', 'Dir::Etc::sourcelist=' + str(Path(args.sources_list).resolve()), '-o', 'Dir::Etc::sourceparts=-']
    index = []
    plans = []
    for name, version in sorted(needed):
        text = subprocess.check_output(['apt-cache'] + options + ['showsrc', name], text=True)
        matches = [r for r in records(text) if r.get('Package') == name and r.get('Version') == version]
        if not matches:
            raise SystemExit('Exact source missing from signed APT metadata: ' + name + '=' + version)
        record = matches[0]
        directory = record['Directory']
        if not re.fullmatch(r'pool/(?:updates/)?[a-zA-Z0-9+./_-]+', directory) or '..' in directory:
            raise RuntimeError('Unsafe Debian source directory')
        host = 'https://deb.debian.org/debian-security/' if directory.startswith('pool/updates/') else 'https://deb.debian.org/debian/'
        files = []
        for row in record['Checksums-Sha256'].splitlines():
            if not row.strip():
                continue
            digest, size, filename = row.split()
            if not re.fullmatch(r'[a-zA-Z0-9+._~-]+', filename) or not re.fullmatch(r'[a-f0-9]{64}', digest):
                raise RuntimeError('Unsafe source metadata')
            size = int(size)
            if size > 2 * 1024 * 1024 * 1024:
                raise RuntimeError('Source asset exceeds GitHub asset bound')
            files.append({'name': filename, 'size': size, 'sha256': digest, 'url': host + directory + '/' + filename})
        plans.extend(files)
        index.append({'source': name, 'version': version, 'files': files})
    if sum(p['size'] for p in plans) > 10 * 1024 * 1024 * 1024:
        raise RuntimeError('Source mirror exceeds release budget')
    cache = output / 'corresponding-source'
    cache.mkdir(exist_ok=True)
    for p in plans:
        target = cache / p['name']
        if target.exists() and target.stat().st_size == p['size']:
            with target.open('rb') as f:
                h = hashlib.file_digest(f, 'sha256').hexdigest()
            if h == p['sha256']:
                continue
            raise RuntimeError('Existing source cache has wrong checksum')
        temporary = target.with_name(target.name + '.partial')
        if temporary.exists():
            temporary.unlink()
        print('Downloading source: ' + p['name'] + ' (' + str(p['size']) + ' bytes)', flush=True)
        value = hashlib.sha256()
        total = 0
        with urllib.request.urlopen(p['url'], timeout=90) as response, temporary.open('xb') as file:
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > p['size']:
                    raise RuntimeError('Source response exceeds authenticated size')
                value.update(chunk)
                file.write(chunk)
        if total != p['size'] or value.hexdigest() != p['sha256']:
            raise RuntimeError('Source checksum mismatch')
        temporary.rename(target)
    (cache / 'SOURCE_INDEX.json').write_text(json.dumps({'provenance': 'Signed Debian APT Sources metadata; exact installed package versions', 'packages': index}, indent=2) + '\n')
    bundle = output / 'corresponding-source-0.10.0.tar'
    with tarfile.open(bundle, 'w') as archive:
        for file in sorted(cache.iterdir()):
            item = tarfile.TarInfo(file.name)
            item.uid = item.gid = item.mtime = 0
            item.mode = 0o644
            item.size = file.stat().st_size
            with file.open('rb') as f:
                archive.addfile(item, f)
    print('Source bundle complete: ' + str(bundle.stat().st_size) + ' bytes', flush=True)


if __name__ == '__main__':
    main()
