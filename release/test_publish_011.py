"""Offline publisher regression tests. No GitHub calls or token access."""
import copy
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import publish_011 as publisher


class PublisherTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.output = Path(self.temp.name)
        (self.output / 'catalog.json').write_bytes(b'new catalog')
        self.conf = publisher.config()
        self.conf['previousCatalogSha256'] = hashlib.sha256(b'old catalog').hexdigest()
        self.calls = []
        self.draft = {'target_commitish': self.conf['sourceCommit'], 'draft': True, 'prerelease': False, 'assets': []}
        self.published = dict(self.draft, draft=False)

    def fake_run(self, args, check=True):
        self.calls.append(args)
        if args[:4] == ['gh', 'release', 'download', 'catalog']:
            (Path(args[args.index('--dir') + 1]) / 'catalog.json').write_bytes(b'old catalog')
        return subprocess.CompletedProcess(args, 0, '', '')

    def fake_verify(self, repo, tag, names, output):
        self.calls.append(['verify', tag])

    def test_listing_includes_draft_without_git_tag(self):
        with patch.object(publisher, 'run', return_value=subprocess.CompletedProcess([], 0, json.dumps(self.draft), '')) as run:
            self.assertTrue(publisher.release('pllanaio/mgu-browser', 'v0.11.0')['draft'])
            self.assertIn('--paginate', run.call_args.args[0])
            self.assertIn('repos/pllanaio/mgu-browser/releases?per_page=100', run.call_args.args[0])

    def test_assets_verified_before_publication_and_catalog_is_last(self):
        with patch.object(publisher, 'verify'), patch.object(publisher, 'tag_commit', side_effect=[None, self.conf['sourceCommit']]), patch.object(publisher, 'release', side_effect=[None, self.draft, self.published]), patch.object(publisher, 'run', side_effect=self.fake_run), patch.object(publisher, 'download_verify', side_effect=self.fake_verify):
            publisher.publish(self.output, self.output, self.conf)
        create = next(c for c in self.calls if c[:3] == ['gh', 'release', 'create'])
        self.assertIn('--draft', create)
        self.assertEqual(create[create.index('--target') + 1], self.conf['sourceCommit'])
        uploaded = next(c for c in self.calls if c[:4] == ['gh', 'release', 'upload', 'v0.11.0'])
        self.assertNotIn('--clobber', uploaded)
        edited = next(c for c in self.calls if c[:3] == ['gh', 'release', 'edit'])
        catalog = next(c for c in self.calls if c[:4] == ['gh', 'release', 'upload', 'catalog'])
        self.assertLess(self.calls.index(['verify', 'v0.11.0']), self.calls.index(edited))
        self.assertLess(self.calls.index(edited), self.calls.index(catalog))
        self.assertEqual(self.calls[-1], ['verify', 'catalog'])

    def test_unexpected_existing_asset_is_never_overwritten(self):
        draft = dict(self.draft, assets=[{'name': 'unknown.tgz'}])
        with patch.object(publisher, 'verify'), patch.object(publisher, 'tag_commit', return_value=self.conf['sourceCommit']), patch.object(publisher, 'release', return_value=draft), patch.object(publisher, 'run', side_effect=self.fake_run):
            with self.assertRaisesRegex(RuntimeError, 'unexpected assets'):
                publisher.publish(self.output, self.output, self.conf)
        self.assertFalse(self.calls)

    def test_failed_version_upload_never_publishes_or_changes_catalog(self):
        def fail_upload(args, check=True):
            self.calls.append(args)
            if args[:3] == ['gh', 'release', 'upload']:
                raise RuntimeError('simulated upload failure')
            return subprocess.CompletedProcess(args, 0, '', '')
        with patch.object(publisher, 'verify'), patch.object(publisher, 'tag_commit', return_value=self.conf['sourceCommit']), patch.object(publisher, 'release', return_value=self.draft), patch.object(publisher, 'run', side_effect=fail_upload):
            with self.assertRaisesRegex(RuntimeError, 'simulated upload failure'):
                publisher.publish(self.output, self.output, self.conf)
        self.assertFalse(any(c[:3] == ['gh', 'release', 'edit'] for c in self.calls))
        self.assertFalse(any('catalog' in c for c in self.calls))

    def test_concurrent_catalog_change_is_preserved(self):
        conf = copy.deepcopy(self.conf)
        conf['previousCatalogSha256'] = hashlib.sha256(b'other previous catalog').hexdigest()
        with patch.object(publisher, 'verify'), patch.object(publisher, 'tag_commit', return_value=self.conf['sourceCommit']), patch.object(publisher, 'release', side_effect=[self.draft, self.published]), patch.object(publisher, 'run', side_effect=self.fake_run), patch.object(publisher, 'download_verify', side_effect=self.fake_verify):
            with self.assertRaisesRegex(RuntimeError, 'changed concurrently'):
                publisher.publish(self.output, self.output, conf)
        self.assertFalse(any(c[:4] == ['gh', 'release', 'upload', 'catalog'] for c in self.calls))

    def test_changed_package_bytes_fail_before_any_publication(self):
        conf = copy.deepcopy(self.conf)
        conf['assets'] = [{'name': 'package.tgz', 'size': 3, 'sha256': hashlib.sha256(b'old').hexdigest()}]
        (self.output / 'package.tgz').write_bytes(b'new')
        result = subprocess.CompletedProcess([], 0, conf['sourceCommit'] + '\n', '')
        with patch.object(publisher, 'run', return_value=result):
            with self.assertRaisesRegex(RuntimeError, 'Audited asset differs'):
                publisher.verify(self.output, self.output, conf)


if __name__ == '__main__':
    unittest.main()
