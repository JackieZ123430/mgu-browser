"""Offline release ordering/immutability regressions; never contacts GitHub."""
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import publish as publisher


class PublishTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.output = Path(self.temp.name)
        (self.output / 'catalog.json').write_bytes(b'new catalog')
        (self.output / 'RELEASE_NOTES.md').write_text('audited release')
        (self.output / 'package.tgz').write_bytes(b'package')
        self.sha = publisher.sha(self.output / 'package.tgz')
        self.new_catalog = publisher.sha(self.output / 'catalog.json')
        self.conf = {'sourceCommit': 'a' * 40, 'version': '0.12.0', 'tag': 'v0.12.0',
                     'title': 'release', 'previousCatalogSha256': hashlib.sha256(b'old catalog').hexdigest()}
        self.assets = [{'name': 'package.tgz', 'sha256': self.sha}]
        self.draft = {'id': 7, 'assets': [], 'target_commitish': 'a' * 40, 'draft': True, 'prerelease': False}
        self.published = dict(self.draft, draft=False)
        self.calls = []

    def fake_api(self, endpoint, method='GET', body=None):
        self.calls.append(('api', endpoint, method, body))
        if method == 'POST' and endpoint.endswith('/releases'):
            return self.draft
        if method == 'PATCH' and endpoint.endswith('/releases/7'):
            return self.published
        if '/git/ref/tags/' in endpoint:
            return {'object': {'type': 'commit', 'sha': 'a' * 40}}
        if endpoint.endswith('/releases/tags/catalog'):
            return {'id': 20, 'assets': [{'id': 30, 'name': 'catalog.json'}]}
        if '/releases/assets/' in endpoint and method == 'PATCH':
            return {'id': int(endpoint.rsplit('/', 1)[1]), 'name': body['name']}
        self.fail('Unexpected API command ' + endpoint)

    def fake_upload(self, release_id, file, name=None):
        name = name or file.name
        self.calls.append(('upload', release_id, name))
        return {'id': 40 if release_id == 20 else 10, 'name': name}

    def fake_download(self, asset, expected):
        self.calls.append(('download', asset['id'], expected))
        if asset['id'] == 30 and expected == self.new_catalog:
            raise RuntimeError('Current catalog has old contents')

    def context(self, existing=None):
        return [patch.object(publisher, 'verify', return_value=self.assets),
                patch.object(publisher, 'check_existing_tag'),
                patch.object(publisher, 'list_release', return_value=existing),
                patch.object(publisher, 'wait_release', return_value=self.published),
                patch.object(publisher, 'api', side_effect=self.fake_api),
                patch.object(publisher, 'upload_asset', side_effect=self.fake_upload),
                patch.object(publisher, 'check_download', side_effect=self.fake_download)]

    def test_creation_response_id_avoids_draft_list_race_and_catalog_switches_last(self):
        patches = self.context()
        for p in patches:
            p.start();self.addCleanup(p.stop)
        publisher.publish(self.output, self.output, self.output, self.conf)
        self.assertIn(('upload', 7, 'package.tgz'), self.calls)
        verified = self.calls.index(('download', 10, self.sha))
        published = next(i for i,c in enumerate(self.calls) if c[0]=='api' and c[1].endswith('/releases/7'))
        pending = self.calls.index(('upload', 20, 'catalog-0.12.0.pending.json'))
        self.assertLess(verified, published)
        self.assertLess(published, pending)
        self.assertEqual(self.calls[-1], ('download', 40, self.new_catalog))

    def test_existing_versioned_bytes_cannot_be_replaced(self):
        existing = dict(self.draft, assets=[{'id': 10, 'name': 'package.tgz'}])
        patches = self.context(existing)
        for p in patches:
            p.start();self.addCleanup(p.stop)
        with patch.object(publisher, 'check_download', side_effect=RuntimeError('different existing asset')):
            with self.assertRaisesRegex(RuntimeError, 'different existing asset'):
                publisher.publish(self.output, self.output, self.output, self.conf)
        self.assertFalse(any(c[0]=='upload' for c in self.calls))

    def test_concurrent_catalog_is_preserved(self):
        patches = self.context()
        for p in patches:
            p.start();self.addCleanup(p.stop)
        def changed(asset, expected):
            if asset['id']==30:
                raise RuntimeError('concurrent catalog differs')
        with patch.object(publisher, 'check_download', side_effect=changed):
            with self.assertRaisesRegex(RuntimeError, 'concurrent catalog'):
                publisher.publish(self.output, self.output, self.output, self.conf)
        self.assertFalse(any(c[0]=='upload' and c[1]==20 for c in self.calls))

    def test_failed_catalog_switch_restores_previous_name(self):
        patches = self.context()
        for p in patches:
            p.start();self.addCleanup(p.stop)
        original = self.fake_api
        def failure(endpoint, method='GET', body=None):
            if endpoint.endswith('/releases/assets/40') and body=={'name':'catalog.json'}:
                raise RuntimeError('simulated rename failure')
            return original(endpoint,method,body)
        with patch.object(publisher,'api',side_effect=failure):
            with self.assertRaisesRegex(RuntimeError,'rename failure'):
                publisher.publish(self.output,self.output,self.output,self.conf)
        self.assertTrue(self.calls[-1][1].endswith('/releases/assets/30'))
        self.assertEqual(self.calls[-1][3],{'name':'catalog.json'})

    def test_changed_built_bytes_are_rejected_before_upload(self):
        source=self.output/'source';source.mkdir();(source/'a.js').write_text('source')
        inputs={'a.js':publisher.sha(source/'a.js')}
        (self.output/'source-inputs.json').write_text(json.dumps(inputs))
        self.conf['sourceInputsSha256']=publisher.sha(self.output/'source-inputs.json')
        record={'sourceCommit':self.conf['sourceCommit'],'version':'0.12.0','assets':[{'name':'package.tgz','size':7,'sha256':self.sha}]}
        (self.output/'publication-build.json').write_text(json.dumps(record))
        (self.output/'package.tgz').write_bytes(b'changed')
        with patch.object(publisher,'run',return_value=subprocess.CompletedProcess([],0,'a'*40+'\n','')):
            with self.assertRaisesRegex(RuntimeError,'Built asset changed'):
                publisher.verify(source,self.output,self.output,self.conf)

    def test_wrong_existing_tag_is_rejected_before_creating_a_release(self):
        result=subprocess.CompletedProcess([],0,json.dumps({'object':{'type':'commit','sha':'b'*40}}),'')
        with patch.object(publisher,'verify',return_value=self.assets),patch.object(publisher,'run',return_value=result),patch.object(publisher,'api') as api:
            with self.assertRaisesRegex(RuntimeError,'Existing tag'):
                publisher.publish(self.output,self.output,self.output,self.conf)
        api.assert_not_called()

    def test_published_state_waits_for_stale_draft_response(self):
        with patch.object(publisher,'api',side_effect=[self.draft,self.published]) as api,patch.object(publisher.time,'sleep'):
            self.assertFalse(publisher.wait_release(7)['draft'])
        self.assertEqual(api.call_count,2)

    def test_published_tag_retries_only_missing_tag(self):
        valid={'object':{'type':'commit','sha':self.conf['sourceCommit']}}
        with patch.object(publisher,'api',side_effect=[RuntimeError('HTTP 404'),valid]) as api,patch.object(publisher.time,'sleep'):
            publisher.check_published_tag(self.conf)
        self.assertEqual(api.call_count,2)

    def test_wrong_published_tag_fails_without_retry(self):
        wrong={'object':{'type':'commit','sha':'b'*40}}
        with patch.object(publisher,'api',return_value=wrong) as api,patch.object(publisher.time,'sleep') as sleep:
            with self.assertRaisesRegex(RuntimeError,'differs from the audited commit'):
                publisher.check_published_tag(self.conf)
        self.assertEqual(api.call_count,1)
        sleep.assert_not_called()


if __name__=='__main__':
    unittest.main()
