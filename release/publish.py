"""Source-locked Store publication for releases that compile new MIT helpers.

The audited inputs and compiler/ABI provenance are verified before tests. Final
archive hashes are generated from that CI build, then checked again after every
upload. Existing versioned assets are immutable; the Store catalog switches last.
"""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import tarfile
import tempfile
import time
from urllib.parse import quote

REPOSITORY = 'pllanaio/mgu-browser'
SEMVER = re.compile(r'(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)')
STORE_COMMIT = '8cfae23db27e51d86f84e65b13ce0592668d8df9'


def sha(file):
    return hashlib.sha256(Path(file).read_bytes()).hexdigest()


def run(args, check=True):
    result = subprocess.run([str(a) for a in args], text=True, capture_output=True)
    if check and result.returncode:
        raise RuntimeError('Command failed: ' + ' '.join(str(a) for a in args[:4]) + '\n' + result.stderr.strip())
    return result


def api(endpoint, method='GET', body=None):
    args = ['gh', 'api', '--method', method, endpoint]
    if body is None:
        return json.loads(run(args).stdout)
    with tempfile.TemporaryDirectory(prefix='mgu-api-body-') as work:
        file = Path(work) / 'request.json'
        file.write_text(json.dumps(body))
        return json.loads(run(args + ['--input', file]).stdout)


def config(metadata):
    conf = json.loads((metadata / 'publication.json').read_text())
    if conf['repository'] != REPOSITORY or not SEMVER.fullmatch(conf['version']) or conf['tag'] != 'v' + conf['version']:
        raise RuntimeError('Unexpected publication identity')
    if not re.fullmatch('[0-9a-f]{40}', conf['sourceCommit']):
        raise RuntimeError('Publication must lock one complete source commit')
    return conf


def source_paths(source):
    paths = run(['git', '-C', source, 'ls-files']).stdout.splitlines()
    prefixes = ('src/', 'apps/mgu_browser/', 'runtime/', 'network/', 'native/', 'backend/', 'assets/ui-fonts/')
    exact = {'release/build.py', 'release/native_build.py', 'release/runtime_check.sh', 'tools/build_store.py', 'tools/kit_shutdown.py', 'package.json', 'mgu-repo.json'}
    return [p for p in paths if p.startswith(prefixes) or p in exact]


def lock_inputs(source, metadata, version):
    if not SEMVER.fullmatch(version):
        raise RuntimeError('Version must be x.y.z')
    paths = source_paths(source)
    if run(['git', '-C', source, 'diff', '--quiet', 'HEAD', '--'] + paths, check=False).returncode:
        raise RuntimeError('Commit distributed sources before locking publication inputs')
    metadata.mkdir(parents=True, exist_ok=True)
    previous = metadata / 'previous-catalog.json'
    if not previous.is_file():
        raise RuntimeError('Save the current public catalog as previous-catalog.json first')
    commit = run(['git', '-C', source, 'rev-parse', 'HEAD']).stdout.strip()
    inputs = {p: sha(source / p) for p in paths}
    (metadata / 'source-inputs.json').write_text(json.dumps(inputs, indent=2) + '\n')
    conf = {'repository': REPOSITORY, 'version': version, 'tag': 'v' + version,
            'sourceCommit': commit, 'storeCommit': STORE_COMMIT,
            'title': 'MGU Browser ' + version + ' — experimental ID7 audio/media update',
            'previousCatalogSha256': sha(previous), 'sourceInputsSha256': sha(metadata / 'source-inputs.json')}
    (metadata / 'publication.json').write_text(json.dumps(conf, indent=2) + '\n')
    print('Locked audited source ' + commit + ' for ' + version)


def verify_source(source, metadata, conf):
    if run(['git', '-C', source, 'rev-parse', 'HEAD']).stdout.strip() != conf['sourceCommit']:
        raise RuntimeError('Refusing a different source commit')
    if sha(metadata / 'source-inputs.json') != conf['sourceInputsSha256']:
        raise RuntimeError('Source input manifest differs')
    inputs = json.loads((metadata / 'source-inputs.json').read_text())
    for name, expected in inputs.items():
        if Path(name).is_absolute() or '..' in Path(name).parts or sha(source / name) != expected:
            raise RuntimeError('Audited source input differs: ' + name)


def prepare(source, metadata, output, conf):
    verify_source(source, metadata, conf)
    version = conf['version']
    runtime_name, frontend_name = 'mgu-browser@' + version + '.tgz', 'mgu_browser@' + version + '.tgz'
    runtime, frontend = output / runtime_name, output / frontend_name
    provenance = json.loads((output / 'runtime-provenance.json').read_text())
    if provenance['version'] != version or provenance['engineComponent'] != '0.1.0' or not provenance.get('builtNative'):
        raise RuntimeError('Expected freshly built audio helpers and immutable engine dependency')
    with tarfile.open(runtime) as archive:
        manifest = json.load(archive.extractfile('component.json'))
        if manifest['id'] != 'mgu-browser' or manifest['version'] != version:
            raise RuntimeError('Unexpected runtime identity')
        if archive.extractfile('files/build-provenance.json').read() != (output / 'runtime-provenance.json').read_bytes():
            raise RuntimeError('Packaged native provenance differs')
        for name in ['backend-launch', 'audio-bridge']:
            record = provenance['builtNative']['helpers'][name]
            if hashlib.sha256(archive.extractfile('files/' + name).read()).hexdigest() != record['sha256']:
                raise RuntimeError('Packaged helper differs from compiler output')
            if sha(source / record['source']) != record['sourceSha256']:
                raise RuntimeError('Helper source differs from audited inputs')
    with tarfile.open(frontend) as archive:
        app = json.load(archive.extractfile('package.json'))
        if app['name'] != 'mgu_browser' or app['version'] != version:
            raise RuntimeError('Unexpected frontend identity')
        if any(m.name.startswith('node_modules/oap-sdk/') for m in archive):
            raise RuntimeError('Proprietary SDK cannot be published')
    for name in ['test-results.json', 'source-inputs.json']:
        shutil.copyfile(metadata / name, output / name)
    if json.loads((output / 'test-results.json').read_text())['sourceCommit'] != conf['sourceCommit']:
        raise RuntimeError('Local validation report names a different source commit')
    previous = json.loads((metadata / 'previous-catalog.json').read_text())
    if sha(metadata / 'previous-catalog.json') != conf['previousCatalogSha256']:
        raise RuntimeError('Previous catalog differs')
    catalog = copy.deepcopy(previous)
    for row in catalog['components']:
        if row['id'] not in ('mgu_browser', 'mgu-browser'):
            continue
        name = frontend_name if row['id'] == 'mgu_browser' else runtime_name
        file = output / name
        row['version'] = version
        row['artifact'] = {'name': name, 'size': file.stat().st_size, 'sha256': sha(file),
                           'url': 'https://github.com/' + REPOSITORY + '/releases/download/' + conf['tag'] + '/' + quote(name, safe='')}
        if row['id'] == 'mgu_browser':
            row['requires']['mgu-browser'] = version
            row['description'] = 'Experimental iDrive browser with BMW audio integration and support for an owner-provided CDM; hardware/provider qualification remains required.'
    catalog['commit'] = conf['sourceCommit']
    (output / 'catalog.json').write_text(json.dumps(catalog, indent=2) + '\n')
    report = {'sourceCommit': conf['sourceCommit'], 'sourceInputsSha256': conf['sourceInputsSha256'],
              'compiler': provenance['builtNative']['compiler'], 'binutils': provenance['builtNative']['binutils'],
              'verification': 'Audited source, native ABI, functional fixtures and source-byte equality; compiled binary bytes may differ across trusted compiler versions',
              'newNativeHelpers': provenance['builtNative']['helpers']}
    (output / 'build-verification.json').write_text(json.dumps(report, indent=2) + '\n')
    names = [frontend_name, runtime_name, 'runtime-provenance.json', 'source-inputs.json', 'test-results.json', 'build-verification.json', 'catalog.json']
    assets = [{'name': name, 'size': (output / name).stat().st_size, 'sha256': sha(output / name)} for name in names]
    (output / 'SHA256SUMS').write_text(''.join(a['sha256'] + '  ' + a['name'] + '\n' for a in assets))
    record = {'sourceCommit': conf['sourceCommit'], 'version': version, 'assets': assets}
    (output / 'publication-build.json').write_text(json.dumps(record, indent=2) + '\n')
    print('Prepared source-verified CI artifacts and their exact final archive hashes')


def verify(source, metadata, output, conf):
    verify_source(source, metadata, conf)
    record = json.loads((output / 'publication-build.json').read_text())
    if record['sourceCommit'] != conf['sourceCommit'] or record['version'] != conf['version']:
        raise RuntimeError('Build record names a different source/version')
    for asset in record['assets']:
        name = asset['name']
        if not re.fullmatch(r'[a-zA-Z0-9_@.\-]+', name):
            raise RuntimeError('Unsafe release asset name')
        file = output / name
        if file.stat().st_size != asset['size'] or sha(file) != asset['sha256']:
            raise RuntimeError('Built asset changed after verification: ' + name)
    expected = ''.join(a['sha256'] + '  ' + a['name'] + '\n' for a in record['assets'])
    if (output / 'SHA256SUMS').read_text() != expected:
        raise RuntimeError('Checksum manifest differs from the verified build')
    return record['assets'] + [{'name': 'SHA256SUMS', 'sha256': sha(output / 'SHA256SUMS')}]


def list_release(tag):
    result = run(['gh', 'api', '--paginate', 'repos/' + REPOSITORY + '/releases?per_page=100',
                  '--jq', '.[] | select(.tag_name == ' + json.dumps(tag) + ')']).stdout.strip()
    return json.loads(result) if result else None


def wait_release(release_id):
    for attempt in range(5):
        try:
            current = api('repos/' + REPOSITORY + '/releases/' + str(release_id))
            if not current['draft']:
                return current
        except RuntimeError as error:
            if 'HTTP 404' not in str(error):
                raise
        if attempt == 4:
            raise RuntimeError('Published release state did not appear; Store catalog was not changed')
        time.sleep(0.5 * (attempt + 1))


def check_published_tag(conf):
    for attempt in range(5):
        try:
            tag = api('repos/' + REPOSITORY + '/git/ref/tags/' + conf['tag'])['object']
        except RuntimeError as error:
            if 'HTTP 404' not in str(error):
                raise
        else:
            if tag['type'] != 'commit' or tag['sha'] != conf['sourceCommit']:
                raise RuntimeError('Published version tag differs from the audited commit')
            return
        if attempt == 4:
            raise RuntimeError('Published source tag did not appear; Store catalog was not changed')
        time.sleep(0.5 * (attempt + 1))


def check_existing_tag(conf):
    endpoint = 'repos/' + REPOSITORY + '/git/ref/tags/' + conf['tag']
    result = run(['gh', 'api', endpoint], check=False)
    if result.returncode:
        if 'HTTP 404' in result.stderr:
            return
        raise RuntimeError(result.stderr.strip())
    obj = json.loads(result.stdout)['object']
    if obj['type'] != 'commit' or obj['sha'] != conf['sourceCommit']:
        raise RuntimeError('Existing tag must point directly to the audited source; no release was changed')


def upload_asset(release_id, file, name=None):
    name = name or file.name
    url = 'https://uploads.github.com/repos/' + REPOSITORY + '/releases/' + str(release_id) + '/assets?name=' + quote(name, safe='')
    return json.loads(run(['gh', 'api', url, '--method', 'POST', '--input', file,
                          '--header', 'Content-Type: application/octet-stream',
                          '--header', 'Content-Length: ' + str(file.stat().st_size)]).stdout)


def check_download(asset, expected):
    with tempfile.TemporaryDirectory(prefix='mgu-asset-check-') as work:
        file = Path(work) / 'asset'
        with file.open('wb') as target:
            result = subprocess.run(['gh', 'api', 'repos/' + REPOSITORY + '/releases/assets/' + str(asset['id']),
                                     '--header', 'Accept: application/octet-stream'], stdout=target, stderr=subprocess.PIPE)
        if result.returncode:
            raise RuntimeError('Asset download failed: ' + result.stderr.decode('utf-8', 'replace'))
        if sha(file) != expected:
            raise RuntimeError('Uploaded asset differs: ' + asset['name'])


def publish(source, metadata, output, conf):
    assets = verify(source, metadata, output, conf)
    check_existing_tag(conf)
    current = list_release(conf['tag'])
    if current is None:
        # Use the creation response directly: a new draft can be absent from an
        # immediately following release-list response, and its tag may not exist.
        current = api('repos/' + REPOSITORY + '/releases', 'POST',
                      {'tag_name': conf['tag'], 'target_commitish': conf['sourceCommit'], 'draft': True,
                       'name': conf['title'], 'body': (metadata / 'RELEASE_NOTES.md').read_text()})
    if current['target_commitish'] != conf['sourceCommit'] or current['prerelease']:
        raise RuntimeError('Existing version names a different source/tag')
    expected = {a['name']: a for a in assets}
    existing = {a['name']: a for a in current['assets']}
    if len(existing) != len(current['assets']) or any(name not in expected for name in existing):
        raise RuntimeError('Existing version has unexpected assets; no overwrite allowed')
    for name, item in expected.items():
        if name in existing:
            asset = existing[name]
        else:
            if not current['draft']:
                raise RuntimeError('Refusing to change an incomplete published version')
            asset = upload_asset(current['id'], output / name)
        check_download(asset, item['sha256'])
    if current['draft']:
        current = api('repos/' + REPOSITORY + '/releases/' + str(current['id']), 'PATCH', {'draft': False, 'make_latest': 'true'})
    current = wait_release(current['id'])
    if current['draft']:
        raise RuntimeError('Versioned release was not published')
    check_published_tag(conf)

    catalog_release = api('repos/' + REPOSITORY + '/releases/tags/catalog')
    active = next(a for a in catalog_release['assets'] if a['name'] == 'catalog.json')
    new_hash = sha(output / 'catalog.json')
    try:
        check_download(active, new_hash)
        print('Versioned release and Store catalog already match the verified build')
        return
    except RuntimeError:
        check_download(active, conf['previousCatalogSha256'])
    pending_name = 'catalog-' + conf['version'] + '.pending.json'
    pending = next((a for a in catalog_release['assets'] if a['name'] == pending_name), None)
    if pending is None:
        pending = upload_asset(catalog_release['id'], output / 'catalog.json', pending_name)
    check_download(pending, new_hash)
    backup_name = 'catalog-before-' + conf['version'] + '.json'
    if any(a['name'] == backup_name for a in catalog_release['assets']):
        raise RuntimeError('Catalog backup name already exists; refusing an overwrite')
    previous_id = active['id']
    api('repos/' + REPOSITORY + '/releases/assets/' + str(previous_id), 'PATCH', {'name': backup_name})
    try:
        active = api('repos/' + REPOSITORY + '/releases/assets/' + str(pending['id']), 'PATCH', {'name': 'catalog.json'})
        check_download(active, new_hash)
    except Exception:
        try:
            api('repos/' + REPOSITORY + '/releases/assets/' + str(pending['id']), 'PATCH', {'name': pending_name})
        finally:
            api('repos/' + REPOSITORY + '/releases/assets/' + str(previous_id), 'PATCH', {'name': 'catalog.json'})
        raise
    print('Published verified ' + conf['version'] + ' assets; Store catalog switched last, prior catalog retained')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('operation', choices=['lock-inputs', 'prepare', 'publish'])
    parser.add_argument('--source', required=True, type=Path)
    parser.add_argument('--metadata', required=True, type=Path)
    parser.add_argument('--out', type=Path)
    parser.add_argument('--version')
    args = parser.parse_args()
    source, metadata = args.source.resolve(), args.metadata.resolve()
    if args.operation == 'lock-inputs':
        lock_inputs(source, metadata, args.version or '')
    else:
        if args.out is None:
            parser.error('--out is required')
        conf = config(metadata)
        if args.operation == 'prepare':
            prepare(source, metadata, args.out.resolve(), conf)
        else:
            publish(source, metadata, args.out.resolve(), conf)


if __name__ == '__main__':
    main()
