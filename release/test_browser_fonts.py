import hashlib
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from release import browser_fonts


class BrowserFonts(unittest.TestCase):
    def test_bundle_preserves_engine_configuration_and_license(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            cached=root/'.local/browser-fonts/NotoSansSC.ttf'
            cached.parent.mkdir(parents=True)
            cached.write_bytes(b'font fixture')
            notice=root/'assets/ui-fonts/OFL-NotoSansSC.txt'
            notice.parent.mkdir(parents=True)
            notice.write_text('OFL fixture')
            files=root/'package'
            with patch.object(browser_fonts,'SHA256',hashlib.sha256(cached.read_bytes()).hexdigest()):
                record=browser_fonts.bundle(root,files,'/immutable/engine')
            self.assertEqual((files/'fonts/NotoSansSC.ttf').read_bytes(),cached.read_bytes())
            self.assertEqual((files/'fonts/OFL-NotoSansSC.txt').read_text(),'OFL fixture')
            config=(files/'fonts.conf').read_text()
            self.assertIn('<include>/immutable/engine/fonts.conf</include>',config)
            self.assertIn('<dir>/var/opt/mgu-browser/current/fonts</dir>',config)
            self.assertEqual(record['license'],'OFL-1.1')

    def test_changed_cached_font_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            cached=root/'.local/browser-fonts/NotoSansSC.ttf'
            cached.parent.mkdir(parents=True)
            cached.write_bytes(b'untrusted replacement')
            with self.assertRaisesRegex(RuntimeError,'checksum'):
                browser_fonts.bundle(root,root/'package','/immutable/engine')


if __name__=='__main__':
    unittest.main()
