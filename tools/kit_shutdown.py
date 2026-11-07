"""Explicit Browser extension of the public MIT app-kit shutdown handler.

The Store build verifies the full pinned kit archive first. Local builders
accept only the same one-match handler or this exact already-patched handler.
"""
from pathlib import Path

ORIGINAL = "app.on('shutdown', () => { log.info('shutdown requested by MainApp'); setTimeout(() => process.exit(0), 200); });"
PATCHED = "app.on('shutdown', () => { log.info('shutdown requested by MainApp'); require('../browser_shutdown').run(() => process.exit(0)); });"


def patch_shutdown(kit):
    runtime = Path(kit) / 'runtime' / 'mgu.js'
    source = runtime.read_text(encoding='utf-8')
    if source.count(ORIGINAL) == 0 and source.count(PATCHED) == 1:
        return
    if source.count(ORIGINAL) != 1 or source.count(PATCHED) != 0:
        raise RuntimeError('Unexpected public app-kit shutdown handler; refusing to patch')
    runtime.write_text(source.replace(ORIGINAL, PATCHED, 1), encoding='utf-8')
