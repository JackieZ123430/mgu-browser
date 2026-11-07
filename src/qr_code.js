'use strict';
// Minimal QR code encoder (ISO/IEC 18004) for the phone remote-control link.
// Byte mode, error correction level M, versions 1-10 (up to 213 bytes).
// No dependencies; runs on the head unit's Node 8.
const ECC_M = [
    // [ec codewords per block, blocks in group 1, data cw g1, blocks g2, data cw g2]
    null,
    [10, 1, 16, 0, 0], [16, 1, 28, 0, 0], [26, 1, 44, 0, 0], [18, 2, 32, 0, 0], [24, 2, 43, 0, 0],
    [16, 4, 27, 0, 0], [18, 4, 31, 0, 0], [22, 2, 38, 2, 39], [22, 3, 36, 2, 37], [26, 4, 43, 1, 44],
];
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
const FORMAT_M = 0;

function gfMul(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
        z = (z << 1) ^ ((z >>> 7) * 0x11d);
        z ^= ((y >>> i) & 1) * x;
    }
    return z & 0xff;
}
function rsDivisor(degree) {
    const result = new Array(degree).fill(0);
    result[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i++) {
        for (let j = 0; j < degree; j++) {
            result[j] = gfMul(result[j], root);
            if (j + 1 < degree) result[j] ^= result[j + 1];
        }
        root = gfMul(root, 0x02);
    }
    return result;
}
function rsRemainder(data, divisor) {
    const result = new Array(divisor.length).fill(0);
    for (const b of data) {
        const factor = b ^ result.shift();
        result.push(0);
        for (let i = 0; i < divisor.length; i++) result[i] ^= gfMul(divisor[i], factor);
    }
    return result;
}
function capacity(version) {
    const e = ECC_M[version];
    return e[1] * e[2] + e[3] * e[4];
}
function encodeData(bytes, version) {
    const bits = [];
    const put = (value, length) => { for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1); };
    put(4, 4);
    put(bytes.length, version < 10 ? 8 : 16);
    for (const b of bytes) put(b, 8);
    const capacityBits = capacity(version) * 8;
    put(0, Math.min(4, capacityBits - bits.length));
    put(0, (8 - bits.length % 8) % 8);
    const out = [];
    for (let i = 0; i < bits.length; i += 8) {
        let v = 0;
        for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
        out.push(v);
    }
    for (let pad = 0xec; out.length < capacity(version); pad ^= 0xec ^ 0x11) out.push(pad);
    return out;
}
function interleave(data, version) {
    const e = ECC_M[version], divisor = rsDivisor(e[0]), blocks = [];
    let at = 0;
    for (let g = 0; g < 2; g++) {
        const count = g ? e[3] : e[1], length = g ? e[4] : e[2];
        for (let i = 0; i < count; i++) {
            const block = data.slice(at, at + length); at += length;
            blocks.push({ data: block, ec: rsRemainder(block, divisor) });
        }
    }
    const result = [], longest = Math.max.apply(null, blocks.map(b => b.data.length));
    for (let i = 0; i < longest; i++) for (const b of blocks) if (i < b.data.length) result.push(b.data[i]);
    for (let i = 0; i < e[0]; i++) for (const b of blocks) result.push(b.ec[i]);
    return result;
}

class Matrix {
    constructor(version) {
        this.version = version; this.size = version * 4 + 17;
        this.modules = new Uint8Array(this.size * this.size);
        this.fixed = new Uint8Array(this.size * this.size);
    }
    get(x, y) { return this.modules[y * this.size + x]; }
    set(x, y, dark, fixed) {
        this.modules[y * this.size + x] = dark ? 1 : 0;
        if (fixed) this.fixed[y * this.size + x] = 1;
    }
    functionPatterns() {
        const s = this.size;
        for (let i = 0; i < s; i++) { this.set(6, i, i % 2 === 0, true); this.set(i, 6, i % 2 === 0, true); }
        for (const c of [[3, 3], [s - 4, 3], [3, s - 4]]) {
            for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
                const x = c[0] + dx, y = c[1] + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
                if (x >= 0 && x < s && y >= 0 && y < s) this.set(x, y, d !== 2 && d !== 4, true);
            }
        }
        const align = ALIGN[this.version], last = align.length - 1;
        for (let i = 0; i <= last; i++) for (let j = 0; j <= last; j++) {
            if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
            for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
                this.set(align[i] + dx, align[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1, true);
        }
        this.format(0);
        if (this.version >= 7) {
            let rem = this.version;
            for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
            const bits = (this.version << 12) | rem;
            for (let i = 0; i < 18; i++) {
                const bit = (bits >>> i) & 1, a = s - 11 + i % 3, b = Math.floor(i / 3);
                this.set(a, b, bit, true); this.set(b, a, bit, true);
            }
        }
    }
    format(mask) {
        const s = this.size, data = (FORMAT_M << 3) | mask;
        let rem = data;
        for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
        const bits = ((data << 10) | rem) ^ 0x5412, bit = i => (bits >>> i) & 1;
        for (let i = 0; i <= 5; i++) this.set(8, i, bit(i), true);
        this.set(8, 7, bit(6), true); this.set(8, 8, bit(7), true); this.set(7, 8, bit(8), true);
        for (let i = 9; i < 15; i++) this.set(14 - i, 8, bit(i), true);
        for (let i = 0; i < 8; i++) this.set(s - 1 - i, 8, bit(i), true);
        for (let i = 8; i < 15; i++) this.set(8, s - 15 + i, bit(i), true);
        this.set(8, s - 8, 1, true);
    }
    codewords(data) {
        const s = this.size;
        let i = 0;
        for (let right = s - 1; right >= 1; right -= 2) {
            if (right === 6) right = 5;
            for (let vert = 0; vert < s; vert++) for (let j = 0; j < 2; j++) {
                const x = right - j, upward = ((right + 1) & 2) === 0, y = upward ? s - 1 - vert : vert;
                if (!this.fixed[y * s + x] && i < data.length * 8) {
                    this.set(x, y, (data[i >>> 3] >>> (7 - (i & 7))) & 1);
                    i++;
                }
            }
        }
    }
    applyMask(mask) {
        const s = this.size;
        for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
            if (this.fixed[y * s + x]) continue;
            let invert;
            switch (mask) {
                case 0: invert = (x + y) % 2 === 0; break;
                case 1: invert = y % 2 === 0; break;
                case 2: invert = x % 3 === 0; break;
                case 3: invert = (x + y) % 3 === 0; break;
                case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
                case 5: invert = x * y % 2 + x * y % 3 === 0; break;
                case 6: invert = (x * y % 2 + x * y % 3) % 2 === 0; break;
                default: invert = ((x + y) % 2 + x * y % 3) % 2 === 0;
            }
            if (invert) this.modules[y * s + x] ^= 1;
        }
    }
    penalty() {
        const s = this.size;
        let score = 0, dark = 0;
        const line = get => {
            let run = 1, prev = get(0);
            const seq = [prev];
            for (let i = 1; i < s; i++) {
                const v = get(i); seq.push(v);
                if (v === prev) run++; else { if (run >= 5) score += run - 2; run = 1; prev = v; }
            }
            if (run >= 5) score += run - 2;
            const text = seq.join('');
            let at = -1;
            while ((at = text.indexOf('1011101', at + 1)) >= 0) {
                const before = text.slice(Math.max(0, at - 4), at), after = text.slice(at + 7, at + 11);
                if ((at < 4 || before === '0000') || (at + 11 > s || after === '0000')) score += 40;
            }
        };
        for (let y = 0; y < s; y++) line(x => this.get(x, y));
        for (let x = 0; x < s; x++) line(y => this.get(x, y));
        for (let y = 0; y < s - 1; y++) for (let x = 0; x < s - 1; x++) {
            const v = this.get(x, y);
            if (v === this.get(x + 1, y) && v === this.get(x, y + 1) && v === this.get(x + 1, y + 1)) score += 3;
        }
        for (let i = 0; i < s * s; i++) dark += this.modules[i];
        score += Math.floor(Math.abs(dark * 20 - s * s * 10) / (s * s)) * 10;
        return score;
    }
}

function encode(text) {
    const bytes = Array.from(Buffer.from(String(text), 'utf8'));
    let version = 1;
    while (version <= 10 && 4 + (version < 10 ? 8 : 16) + bytes.length * 8 > capacity(version) * 8) version++;
    if (version > 10) throw new Error('QR content too long');
    const data = interleave(encodeData(bytes, version), version);
    let best = null;
    for (let mask = 0; mask < 8; mask++) {
        const m = new Matrix(version);
        m.functionPatterns(); m.codewords(data); m.applyMask(mask); m.format(mask);
        const p = m.penalty();
        if (!best || p < best.penalty) best = { matrix: m, penalty: p };
    }
    return { version, size: best.matrix.size, modules: best.matrix.modules };
}

// RGBA image of the code: `scale` pixels per module and a 4-module quiet zone.
function toRGBA(qr, scale, dark, light) {
    const quiet = 4, side = (qr.size + quiet * 2) * scale, out = Buffer.alloc(side * side * 4);
    const d = dark || [0, 0, 0], l = light || [255, 255, 255];
    for (let y = 0; y < side; y++) {
        const my = Math.floor(y / scale) - quiet;
        for (let x = 0; x < side; x++) {
            const mx = Math.floor(x / scale) - quiet;
            const on = mx >= 0 && my >= 0 && mx < qr.size && my < qr.size && qr.modules[my * qr.size + mx];
            const c = on ? d : l, at = (y * side + x) * 4;
            out[at] = c[0]; out[at + 1] = c[1]; out[at + 2] = c[2]; out[at + 3] = 255;
        }
    }
    return { width: side, height: side, rgba: out };
}

module.exports = { encode, toRGBA, rsRemainder, rsDivisor };
