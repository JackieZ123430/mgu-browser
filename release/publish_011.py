"""Publish only the exact, locally audited 0.11.0 package bytes from Actions.

The host builds packages from the fixed source commit; this control script never
accepts replacement bytes for the versioned release. Catalog publication happens
last, after every versioned asset was downloaded and checked again.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

METADATA = Path(__file__).resolve().parent / '0.11.0'


def digest(file):
    return hashlib.sha256(Path(file).read_bytes()).hexdigest()


def run(args, check=True):
    result = subprocess.run(args, text=True, capture_output=True)
    if check and result.returncode:
        raise RuntimeError('Command failed: ' + ' '.join(str(a) for a in args[:4]) + '\n' + result.stderr.strip())
    return result


def config():
    value = json.loads((METADATA / 'publication.json').read_text())
    assert value['repository'] == 'pllanaio/mgu-browser'
    assert value['tag'] == 'v0.11.0'
    assert value['sourceCommit'] == '9b1a8555ab83d1fc682bc71d16a5ddce0c9387d2'
    return value


def verify(source, output, conf):
    head = run(['git', '-C', str(source), 'rev-parse', 'HEAD']).stdout.strip()
    if head != conf['sourceCommit']:
        raise RuntimeError('Refusing a different source commit')
    for asset in conf['assets']:
        name = asset['name']
        if not re.fullmatch(r'[a-zA-Z0-9_@.\-]+', name):
            raise RuntimeError('Invalid release asset name')
        file = output / name
        if not file.is_file() or file.stat().st_size != asset['size'] or digest(file) != asset['sha256']:
            raise RuntimeError('Audited asset differs: ' + name)
    if (output / 'SHA256SUMS').read_bytes() != (METADATA / 'SHA256SUMS').read_bytes():
        raise RuntimeError('Checksum manifest differs')
    catalog = json.loads((output / 'catalog.json').read_text())
    if catalog['commit'] != conf['sourceCommit']:
        raise RuntimeError('Catalog names a different source commit')


def prepare(source, output, conf):
    # Never replace rebuilt runtime provenance with the committed copy: verify it.
    for name in ['catalog.json', 'test-results.json', 'package-verification.json', 'SHA256SUMS']:
        shutil.copyfile(METADATA / name, output / name)
    verify(source, output, conf)
    print('Exact audited package and metadata hashes verified')


def release(repo, tag):
    # The releases/tags endpoint can omit an unpublished draft whose Git tag
    # does not exist yet. Authenticated releases listing includes our drafts.
    result = run(['gh', 'api', '--paginate', 'repos/' + repo + '/releases?per_page=100',
                  '--jq', '.[] | select(.tag_name == ' + json.dumps(tag) + ')'])
    return json.loads(result.stdout) if result.stdout.strip() else None


def tag_commit(repo, tag):
    result = run(['gh', 'api', 'repos/' + repo + '/git/ref/tags/' + tag], check=False)
    if result.returncode:
        if 'HTTP 404' in result.stderr:
            return None
        raise RuntimeError(result.stderr.strip())
    obj = json.loads(result.stdout)['object']
    for unused in range(4):
        if obj['type'] == 'commit':
            return obj['sha']
        if obj['type'] != 'tag':
            break
        obj = json.loads(run(['gh', 'api', 'repos/' + repo + '/git/tags/' + obj['sha']]).stdout)['object']
    raise RuntimeError('Release tag does not resolve to one commit')


def download_verify(repo, tag, names, output):
    with tempfile.TemporaryDirectory(prefix='mgu-published-check-') as temp:
        args = ['gh', 'release', 'download', tag, '--repo', repo, '--dir', temp]
        for name in names:
            args += ['--pattern', name]
        run(args)
        for name in names:
            if digest(Path(temp) / name) != digest(output / name):
                raise RuntimeError('Uploaded asset differs: ' + name)


def publish(source, output, conf):
    verify(source, output, conf)
    repo, tag = conf['repository'], conf['tag']
    names = [asset['name'] for asset in conf['assets']] + ['SHA256SUMS']
    tagged = tag_commit(repo, tag)
    if tagged is not None and tagged != conf['sourceCommit']:
        raise RuntimeError('Existing Git tag points to a different source commit')
    current = release(repo, tag)
    if current is None:
        run(['gh', 'release', 'create', tag, '--repo', repo, '--target', conf['sourceCommit'],
             '--draft', '--title', conf['title'], '--notes-file', str(METADATA / 'RELEASE_NOTES.md')])
        current = release(repo, tag)
    if current is None or current['target_commitish'] != conf['sourceCommit'] or current['prerelease']:
        raise RuntimeError('Existing release does not match the audited source/tag')
    # A retry may resume our draft, but it cannot overwrite any versioned bytes.
    existing = [asset['name'] for asset in current['assets']]
    if len(existing) != len(set(existing)) or any(name not in names for name in existing):
        raise RuntimeError('Existing release has unexpected assets')
    if existing:
        download_verify(repo, tag, existing, output)
    missing = [name for name in names if name not in existing]
    if missing and not current['draft']:
        raise RuntimeError('Refusing to modify an incomplete published version')
    if missing:
        run(['gh', 'release', 'upload', tag, '--repo', repo] + [str(output / name) for name in missing])
    download_verify(repo, tag, names, output)
    if current['draft']:
        run(['gh', 'release', 'edit', tag, '--repo', repo, '--draft=false', '--latest'])
    published = release(repo, tag)
    if published is None or published['draft']:
        raise RuntimeError('Versioned release was not published')
    if tag_commit(repo, tag) != conf['sourceCommit']:
        raise RuntimeError('Published Git tag does not name the audited source commit')

    # Refuse to overwrite a concurrent maintainer's newer catalog. A retry after
    # successful publication is a no-op when the catalog already matches.
    with tempfile.TemporaryDirectory(prefix='mgu-catalog-backup-') as temp:
        run(['gh', 'release', 'download', 'catalog', '--repo', repo, '--pattern', 'catalog.json', '--dir', temp])
        previous = Path(temp) / 'catalog.json'
        old_hash, new_hash = digest(previous), digest(output / 'catalog.json')
        if old_hash == new_hash:
            print('Versioned release and current Store catalog are already verified')
            return
        if old_hash != conf['previousCatalogSha256']:
            raise RuntimeError('Store catalog changed concurrently; refusing to replace it')
        try:
            run(['gh', 'release', 'upload', 'catalog', '--repo', repo, str(output / 'catalog.json'), '--clobber'])
            download_verify(repo, 'catalog', ['catalog.json'], output)
        except Exception as problem:
            # If uploading fails after gh removed the old asset, restore the exact
            # known prior catalog. The complete versioned release remains valid.
            restored = run(['gh', 'release', 'upload', 'catalog', '--repo', repo, str(previous), '--clobber'], check=False)
            if restored.returncode:
                raise RuntimeError('Catalog upload failed and restoring the prior catalog also failed: ' + restored.stderr.strip()) from problem
            raise
    print('Verified Browser 0.11.0 published; Store catalog updated last')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('operation', choices=['prepare', 'publish'])
    parser.add_argument('--source', required=True, type=Path)
    parser.add_argument('--out', required=True, type=Path)
    args = parser.parse_args()
    conf = config()
    if args.operation == 'prepare':
        prepare(args.source.resolve(), args.out.resolve(), conf)
    else:
        publish(args.source.resolve(), args.out.resolve(), conf)


if __name__ == '__main__':
    main()
