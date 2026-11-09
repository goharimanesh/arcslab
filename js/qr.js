/* ================================================================
   qr.js — tiny QR-code generator (no external library, works offline)
   ----------------------------------------------------------------
   Usage:  QR.svg("https://doi.org/10.1000/xyz", { size: 120 })
   returns an <svg> string. Byte mode, error-correction level M,
   versions 1–15 (up to ~410 characters — plenty for a DOI link).
   Implements ISO/IEC 18004: Reed–Solomon codes, interleaving,
   zig-zag placement and the 8 mask patterns with penalty scoring.
   You do not need to edit this file.
   ================================================================ */
window.QR = (function () {
  // [ecCodewordsPerBlock, [count, dataCodewords], [count, dataCodewords]] for level M
  const BLOCKS = [null,
    [10, [1, 16]], [16, [1, 28]], [26, [1, 44]], [18, [2, 32]], [24, [2, 43]],
    [16, [4, 27]], [18, [4, 31]], [22, [2, 38], [2, 39]], [22, [3, 36], [2, 37]], [26, [4, 43], [1, 44]],
    [30, [1, 50], [4, 51]], [22, [6, 36], [2, 37]], [22, [8, 37], [1, 38]], [24, [4, 40], [5, 41]], [24, [5, 41], [5, 42]]];
  const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46],
    [6, 28, 50], [6, 30, 54], [6, 32, 58], [6, 34, 62], [6, 26, 46, 66], [6, 26, 48, 70]];

  /* ---- Galois field GF(256) ---- */
  const EXP = new Array(512), LOG = new Array(256);
  for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  const mul = (a, b) => (a && b) ? EXP[LOG[a] + LOG[b]] : 0;

  function rsGenerator(n) {
    let g = [1];
    for (let i = 0; i < n; i++) {
      const next = new Array(g.length + 1).fill(0);
      for (let j = 0; j < g.length; j++) { next[j] ^= g[j]; next[j + 1] ^= mul(g[j], EXP[i]); }
      g = next;
    }
    return g;
  }
  function rsRemainder(data, n) {
    const gen = rsGenerator(n), res = data.concat(new Array(n).fill(0));
    for (let i = 0; i < data.length; i++) {
      const f = res[i];
      if (f) for (let j = 0; j < gen.length; j++) res[i + j] ^= mul(gen[j], f);
    }
    return res.slice(data.length);
  }

  function utf8(s) { return Array.from(new TextEncoder().encode(s)); }

  function dataCapacity(v) { const b = BLOCKS[v]; return b.slice(1).reduce((s, g) => s + g[0] * g[1], 0); }

  function encode(text) {
    const bytes = utf8(text);
    let v = 1;
    for (; v <= 15; v++) {
      const bits = 4 + (v < 10 ? 8 : 16) + 8 * bytes.length;
      if (bits <= dataCapacity(v) * 8) break;
    }
    if (v > 15) throw new Error("QR: text too long");
    const cap = dataCapacity(v) * 8, bits = [];
    const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    put(4, 4); put(bytes.length, v < 10 ? 8 : 16); bytes.forEach(b => put(b, 8));
    put(0, Math.min(4, cap - bits.length));
    while (bits.length % 8) bits.push(0);
    for (let p = 0xec; bits.length < cap; p ^= 0xec ^ 0x11) put(p, 8);
    const cw = []; for (let i = 0; i < bits.length; i += 8) cw.push(parseInt(bits.slice(i, i + 8).join(""), 2));

    // split into blocks, add error correction, interleave
    const [ec, ...groups] = BLOCKS[v], blocks = [];
    let k = 0;
    groups.forEach(([count, n]) => { for (let i = 0; i < count; i++) { blocks.push(cw.slice(k, k + n)); k += n; } });
    const ecs = blocks.map(b => rsRemainder(b, ec)), out = [];
    const maxLen = Math.max(...blocks.map(b => b.length));
    for (let i = 0; i < maxLen; i++) blocks.forEach(b => { if (i < b.length) out.push(b[i]); });
    for (let i = 0; i < ec; i++) ecs.forEach(e => out.push(e[i]));
    return { v, codewords: out };
  }

  function matrix(text) {
    const { v, codewords } = encode(text), n = v * 4 + 17;
    const M = Array.from({ length: n }, () => new Array(n).fill(null)); // null = free
    const fn = Array.from({ length: n }, () => new Array(n).fill(false)); // function patterns
    const set = (r, c, val) => { M[r][c] = val; fn[r][c] = true; };

    // finder patterns + separators
    [[0, 0], [0, n - 7], [n - 7, 0]].forEach(([r0, c0]) => {
      for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
        const rr = r0 + r, cc = c0 + c;
        if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
        const on = r >= 0 && r <= 6 && c >= 0 && c <= 6 && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
        set(rr, cc, on);
      }
    });
    // timing patterns
    for (let i = 8; i < n - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    // alignment patterns
    const pos = ALIGN[v];
    const last = pos[pos.length - 1];
    pos.forEach(r => pos.forEach(c => {
      if ((r === 6 && c === 6) || (r === 6 && c === last) || (r === last && c === 6)) return; // finder corners
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++)
        set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
    }));
    // dark module + reserve format areas
    set(n - 8, 8, true);
    for (let i = 0; i < 9; i++) { if (!fn[8][i]) set(8, i, false); if (!fn[i][8]) set(i, 8, false); }
    for (let i = 0; i < 8; i++) { if (!fn[8][n - 1 - i]) set(8, n - 1 - i, false); if (!fn[n - 1 - i][8]) set(n - 1 - i, 8, false); }
    // version information (v >= 7)
    if (v >= 7) {
      let rem = v; for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      const vb = (v << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const bit = ((vb >>> i) & 1) === 1, a = n - 11 + (i % 3), b = Math.floor(i / 3);
        set(a, b, bit); set(b, a, bit);
      }
    }
    // data placement (zig-zag)
    const bits = []; codewords.forEach(c => { for (let i = 7; i >= 0; i--) bits.push((c >>> i) & 1); });
    let bi = 0, up = true;
    for (let col = n - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      for (let i = 0; i < n; i++) {
        const r = up ? n - 1 - i : i;
        for (let d = 0; d < 2; d++) {
          const c = col - d;
          if (!fn[r][c]) M[r][c] = bi < bits.length ? bits[bi++] === 1 : false;
        }
      }
      up = !up;
    }

    // masks
    const MASKS = [(r, c) => (r + c) % 2 === 0, r => r % 2 === 0, (r, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0,
      (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, (r, c) => (r * c) % 2 + (r * c) % 3 === 0,
      (r, c) => ((r * c) % 2 + (r * c) % 3) % 2 === 0, (r, c) => ((r + c) % 2 + (r * c) % 3) % 2 === 0];

    function withMask(m) {
      const G = M.map((row, r) => row.map((val, c) => fn[r][c] ? val : (MASKS[m](r, c) ? !val : val)));
      // format information: level M = 00
      let data = (0 << 3) | m, rem = data;
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const fb = ((data << 10) | rem) ^ 0x5412;
      const bit = i => ((fb >>> i) & 1) === 1;
      for (let i = 0; i <= 5; i++) G[i][8] = bit(i);
      G[7][8] = bit(6); G[8][8] = bit(7); G[8][7] = bit(8);
      for (let i = 9; i < 15; i++) G[8][14 - i] = bit(i);
      for (let i = 0; i < 8; i++) G[8][n - 1 - i] = bit(i);
      for (let i = 8; i < 15; i++) G[n - 15 + i][8] = bit(i);
      G[n - 8][8] = true;
      return G;
    }
    function penalty(G) {
      let p = 0;
      for (let pass = 0; pass < 2; pass++) for (let i = 0; i < n; i++) {   // N1 runs, N3 finder-like
        let run = 1, line = [];
        for (let j = 0; j < n; j++) line.push(pass ? G[j][i] : G[i][j]);
        for (let j = 1; j < n; j++) {
          if (line[j] === line[j - 1]) { run++; if (j === n - 1 && run >= 5) p += run - 2; }
          else { if (run >= 5) p += run - 2; run = 1; }
        }
        const s = line.map(x => x ? 1 : 0).join("");
        for (let j = s.indexOf("1011101"); j !== -1; j = s.indexOf("1011101", j + 1)) {
          if (s.slice(Math.max(0, j - 4), j) === "0000" && j >= 4) p += 40;
          else if (s.slice(j + 7, j + 11) === "0000" && j + 11 <= n) p += 40;
        }
      }
      for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) {          // N2 2x2 blocks
        const x = G[r][c]; if (x === G[r + 1][c] && x === G[r][c + 1] && x === G[r + 1][c + 1]) p += 3;
      }
      let dark = 0; G.forEach(row => row.forEach(x => { if (x) dark++; }));       // N4 balance
      p += Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n)) * 10;
      return p;
    }
    let best = null, bestP = Infinity, bestMask = 0;
    for (let m = 0; m < 8; m++) { const G = withMask(m), pp = penalty(G); if (pp < bestP) { best = G; bestP = pp; bestMask = m; } }
    return { modules: best, version: v, mask: bestMask, withMask };
  }

  function svg(text, opt = {}) {
    const { modules } = matrix(text), n = modules.length, q = 2, size = opt.size || 120;
    let d = "";
    modules.forEach((row, r) => row.forEach((on, c) => { if (on) d += `M${c + q},${r + q}h1v1h-1z`; }));
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + 2 * q} ${n + 2 * q}" width="${size}" height="${size}" shape-rendering="crispEdges" role="img" aria-label="QR code">` +
      `<rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="${opt.color || "#1b2430"}"/></svg>`;
  }

  return { svg, matrix };
})();
