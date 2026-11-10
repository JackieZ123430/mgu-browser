"""Bundle public CJK web fonts with the runtime, keeping the engine immutable."""
import hashlib
from pathlib import Path
import shutil
import urllib.request

URL = 'https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf'
SHA256 = 'a3041811a78c361b1de50f953c805e0244951c21c5bd412f7232ef0d899af0da'
LIMIT = 32 * 1024 * 1024


def bundle(root, files, engine_prefix):
    directory = files / 'fonts'
    directory.mkdir(parents=True, exist_ok=True)
    cached = root / '.local/browser-fonts/NotoSansSC.ttf'
    with (cached.open('rb') if cached.exists() else urllib.request.urlopen(URL, timeout=60)) as source:
        data = source.read(LIMIT + 1)
    if len(data) > LIMIT or hashlib.sha256(data).hexdigest() != SHA256:
        raise RuntimeError('Noto Sans SC checksum or size mismatch')
    (directory / 'NotoSansSC.ttf').write_bytes(data)
    shutil.copyfile(root / 'assets/ui-fonts/OFL-NotoSansSC.txt', directory / 'OFL-NotoSansSC.txt')
    # The existing engine's DejaVu configuration is retained as a fallback.
    (files / 'fonts.conf').write_text(
        '<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig>'
        '<dir>/var/opt/mgu-browser/current/fonts</dir>'
        '<include>' + engine_prefix + '/fonts.conf</include>'
        '</fontconfig>\n', encoding='utf-8')
    return {'source': URL, 'sha256': SHA256, 'license': 'OFL-1.1'}
