'use strict';
// Root-only, once per service start: remove what the private 0.9.x
// installation left behind and nothing else uses. The 0.9.x Chromium engine
// lived inside the runtime folder (/var/opt/mgu-browser/engine, ~180 MB);
// since 0.10 the versioned Store engine under /var/opt/mgu-browser-engine is
// used. It is removed only when that Store engine is installed and valid.
const fs = require('fs'), path = require('path');
const LEGACY = '/var/opt/mgu-browser/engine';
const STORE_ENGINE = '/var/opt/mgu-browser-engine/current/engine';
function remove(target) {
    // Never follow links; delete only what lies inside the legacy folder.
    const st = fs.lstatSync(target);
    if (st.isDirectory() && !st.isSymbolicLink()) {
        for (const name of fs.readdirSync(target)) remove(path.join(target, name));
        fs.rmdirSync(target);
    } else fs.unlinkSync(target);
}
function storeEngineReady(storeEngine, pattern) {
    try {
        const engine = fs.realpathSync(storeEngine);
        if (!pattern.test(engine)) return false;
        const io = fs;
        const sandbox = io.lstatSync(engine + '/chrome-sandbox'), chromium = io.lstatSync(engine + '/chromium');
        return sandbox.isFile() && chromium.isFile();
    } catch (e) { return false; }
}
// options (tests only): { legacy, storeEngine, pattern, owner }
function cleanup(options) {
    const o = Object.assign({ legacy: LEGACY, storeEngine: STORE_ENGINE, owner: 0,
        pattern: /^\/var\/opt\/mgu-browser-engine\/versions\/[0-9]+\.[0-9]+\.[0-9]+\/engine$/ }, options || {});
    let st;
    try { st = fs.lstatSync(o.legacy); } catch (e) { return { removed: false, reason: 'absent' }; }
    if (!st.isDirectory() || st.isSymbolicLink() || st.uid !== o.owner) return { removed: false, reason: 'not-a-root-directory' };
    if (!storeEngineReady(o.storeEngine, o.pattern)) return { removed: false, reason: 'store-engine-missing' };
    remove(o.legacy);
    return { removed: true };
}
module.exports = { cleanup, storeEngineReady, LEGACY, STORE_ENGINE };
