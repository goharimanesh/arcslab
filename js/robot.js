/* ==========================================================
   robot.js — the large animated continuum robot on the home page
   ----------------------------------------------------------
   A planar 3-section continuum robot (piecewise constant
   curvature) whose tip continuously tracks a figure-8 (∞) path.
   CONTROL  resolved-rate (Jacobian) control with feedforward:
            ẋ_cmd = ẋ_desired + Kp·(x_desired − x)
            q̇ = J⁺ ẋ_cmd + (I − J⁺J)(−k₀ q)     (damped least squares)
   There are no buttons — it simply runs. Settings are in P.
   ========================================================== */
(function () {
  const canvas = document.getElementById("robotCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const P = {
    L: 86,               // length of each of the 3 sections [mm]
    kMax: 2.6 / 86,      // curvature limit [1/mm]
    qdMax: 2.4 / 86,     // actuator speed limit [1/(mm·s)]
    lambda: 6,           // damping of the least-squares inverse
    k0: 2.5,             // null-space pull towards a straight robot
    kp: 6,               // feedback gain
    period: 9,           // seconds per lap of the ∞ path
    center: [0, 172],    // centre of the ∞ [mm]
    width: 74, height: 42,
  };
  const C = { blue: "#1f3d5c", blue2: "#2c5a86", olive: "#6e7b3c", oliveSoft: "rgba(110,123,60,.55)" };
  const S = { q: [0.002, 0.001, -0.001], s: 0, trail: [] };

  /* ---------- kinematics ---------- */
  function fk(q, samples = 0) {
    let x = 0, y = 0, th = Math.PI / 2; const pts = [[0, 0]], ang = [Math.PI / 2];
    for (let i = 0; i < 3; i++) {
      const k = q[i], m = Math.max(samples, 1);
      for (let j = 1; j <= m; j++) {
        const l = P.L * j / m, t = th + k * l;
        const px = Math.abs(k) < 1e-7 ? x + l * Math.cos(th) : x + (Math.sin(t) - Math.sin(th)) / k;
        const py = Math.abs(k) < 1e-7 ? y + l * Math.sin(th) : y + (Math.cos(th) - Math.cos(t)) / k;
        if (samples) { pts.push([px, py]); ang.push(t); }
        if (j === m) { x = px; y = py; }
      }
      th += k * P.L;
    }
    return { tip: [x, y], pts, ang };
  }
  function jacobian(q) {
    const h = 1e-6, f0 = fk(q).tip, J = [[0, 0, 0], [0, 0, 0]];
    for (let i = 0; i < 3; i++) { const qq = q.slice(); qq[i] += h; const f = fk(qq).tip; J[0][i] = (f[0] - f0[0]) / h; J[1][i] = (f[1] - f0[1]) / h; }
    return J;
  }
  function pinv(J) {
    const a = J[0][0] ** 2 + J[0][1] ** 2 + J[0][2] ** 2 + P.lambda ** 2;
    const b = J[0][0] * J[1][0] + J[0][1] * J[1][1] + J[0][2] * J[1][2];
    const d = J[1][0] ** 2 + J[1][1] ** 2 + J[1][2] ** 2 + P.lambda ** 2;
    const det = a * d - b * b, inv = [[d / det, -b / det], [-b / det, a / det]];
    return [0, 1, 2].map(i => [J[0][i] * inv[0][0] + J[1][i] * inv[1][0], J[0][i] * inv[0][1] + J[1][i] * inv[1][1]]);
  }

  /* ---------- the ∞ path ---------- */
  const eight = s => { const t = 2 * Math.PI * s; return [P.center[0] + P.width * Math.sin(t), P.center[1] + P.height * Math.sin(2 * t)]; };

  function step(dt) {
    S.s = (S.s + dt / P.period) % 1;
    const xd = eight(S.s), b = eight((S.s + 1e-3) % 1);
    const vd = [(b[0] - xd[0]) / (1e-3 * P.period), (b[1] - xd[1]) / (1e-3 * P.period)];
    const x = fk(S.q).tip, v = [vd[0] + P.kp * (xd[0] - x[0]), vd[1] + P.kp * (xd[1] - x[1])];
    const J = jacobian(S.q), Jp = pinv(J);
    const qd = [0, 1, 2].map(i => Jp[i][0] * v[0] + Jp[i][1] * v[1]);
    const z = S.q.map(k => -P.k0 * k);
    const Jz = [J[0][0] * z[0] + J[0][1] * z[1] + J[0][2] * z[2], J[1][0] * z[0] + J[1][1] * z[1] + J[1][2] * z[2]];
    for (let i = 0; i < 3; i++) qd[i] += z[i] - (Jp[i][0] * Jz[0] + Jp[i][1] * Jz[1]);
    const peak = Math.max(...qd.map(Math.abs)), sc = peak > P.qdMax ? P.qdMax / peak : 1;
    for (let i = 0; i < 3; i++) S.q[i] = Math.max(-P.kMax, Math.min(P.kMax, S.q[i] + qd[i] * sc * dt));
    S.tick = (S.tick || 0) + 1;
    if (S.tick % 3 === 0) { S.trail.push(fk(S.q).tip); if (S.trail.length > 560) S.trail.shift(); }
  }

  /* ---------- drawing ---------- */
  let W = 0, H = 0, scale = 1, ox = 0, oy = 0;
  function resize() {
    const d = Math.min(window.devicePixelRatio || 1, 2), r = canvas.getBoundingClientRect();
    W = r.width; H = r.height; canvas.width = Math.round(W * d); canvas.height = Math.round(H * d);
    ctx.setTransform(d, 0, 0, d, 0, 0);
    scale = Math.min((H - 70) / 270, (W - 20) / 250); ox = W / 2; oy = H - 40;
  }
  const X = p => [ox + p[0] * scale, oy - p[1] * scale];

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const c = X(P.center);

    // soft halo + rings behind the path
    const g = ctx.createRadialGradient(c[0], c[1], 10, c[0], c[1], 125 * scale);
    g.addColorStop(0, "rgba(232,238,244,.95)"); g.addColorStop(1, "rgba(232,238,244,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c[0], c[1], 125 * scale, 0, 7); ctx.fill();
    ctx.strokeStyle = "#d9dee3"; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(c[0], c[1], 98 * scale, 0, 7); ctx.stroke();
    ctx.setLineDash([3, 7]); ctx.beginPath(); ctx.arc(c[0], c[1], 80 * scale, 0, 7); ctx.stroke(); ctx.setLineDash([]);

    // the ∞ reference path
    ctx.strokeStyle = C.oliveSoft; ctx.lineWidth = 2; ctx.setLineDash([6, 7]); ctx.beginPath();
    for (let i = 0; i <= 240; i++) { const p = X(eight(i / 240)); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }
    ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);

    // trail of the tip (fades out)
    ctx.lineCap = "round";
    for (let i = 1; i < S.trail.length; i++) {
      const a = X(S.trail[i - 1]), b = X(S.trail[i]), f = i / S.trail.length;
      ctx.strokeStyle = `rgba(31,61,92,${0.85 * f})`; ctx.lineWidth = 1.2 + 2.6 * f;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }

    // robot body
    const k = fk(S.q, 30), n = k.pts.length, w0 = 26, w1 = 12;   // body half-widths in mm (base → tip)
    const half = i => (w0 + (w1 - w0) * i / (n - 1)) / 2;
    const side = (i, s) => { const p = k.pts[i], a = k.ang[i]; return X([p[0] - Math.sin(a) * s, p[1] + Math.cos(a) * s]); };
    // tendons
    for (const sg of [-0.78, 0.78]) {
      ctx.strokeStyle = C.olive; ctx.lineWidth = 1.6; ctx.globalAlpha = .85; ctx.beginPath();
      for (let i = 0; i < n; i++) { const q = side(i, sg * half(i)); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }
      ctx.stroke(); ctx.globalAlpha = 1;
    }
    // backbone
    ctx.strokeStyle = C.blue; ctx.lineWidth = Math.max(3, 3.4 * scale); ctx.beginPath();
    k.pts.forEach((p, i) => { const q = X(p); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.stroke();
    // disks (section ends drawn in olive)
    for (let i = 5; i < n; i += 5) {
      const end = i % 30 === 0, a = side(i, half(i) * (end ? 1.15 : 1)), b = side(i, -half(i) * (end ? 1.15 : 1));
      ctx.strokeStyle = end ? C.olive : C.blue; ctx.lineWidth = (end ? 6.5 : 4.5) * Math.min(scale, 1.6);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }
    // base pedestal
    const b0 = X([0, 0]), bw = 110 * scale / 1.6;
    ctx.fillStyle = C.blue; roundRect(b0[0] - bw / 2, b0[1], bw, 15, 6); ctx.fill();
    ctx.fillStyle = "rgba(31,61,92,.18)"; roundRect(b0[0] - bw * 0.72, b0[1] + 15, bw * 1.44, 9, 4); ctx.fill();

    // tip: small gripper + glowing marker
    const tip = X(k.tip), ta = k.ang[n - 1], ux = Math.cos(ta), uy = -Math.sin(ta);
    ctx.strokeStyle = C.blue; ctx.lineWidth = 3;
    for (const sgn of [-1, 1]) {
      const px = tip[0] - uy * sgn * 7, py = tip[1] + ux * sgn * 7;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo(px + ux * 10 - uy * sgn * 4, py + uy * 10 + ux * sgn * 4, px + ux * 16, py + uy * 16); ctx.stroke();
    }
    ctx.fillStyle = "rgba(110,123,60,.25)"; ctx.beginPath(); ctx.arc(tip[0], tip[1], 11, 0, 7); ctx.fill();
    ctx.fillStyle = C.olive; ctx.beginPath(); ctx.arc(tip[0], tip[1], 5, 0, 7); ctx.fill();

    // small caption
    ctx.font = "12px ui-monospace, Menlo, monospace"; ctx.fillStyle = "#8a96a3"; ctx.textAlign = "right";
    ctx.fillText("live · continuum robot tracking ∞", W - 8, 18);
  }
  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  /* ---------- loop (pauses off-screen; static for reduced motion) ---------- */
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // warm up so the first frame already shows a nice trail
  for (let i = 0; i < 3600; i++) step(1 / 400);
  let last = 0, visible = true;
  new IntersectionObserver(e => { visible = e[0].isIntersecting; if (visible) { last = 0; requestAnimationFrame(loop); } }).observe(canvas);
  function loop(t) {
    if (!visible) return;
    const dt = last ? Math.min((t - last) / 1000, 0.04) : 0; last = t;
    if (!still) for (let i = 0; i < 4; i++) step(dt / 4);
    draw();
    if (!still) requestAnimationFrame(loop);
  }
  window.addEventListener("resize", () => { resize(); draw(); });
  resize(); draw(); requestAnimationFrame(loop);
})();
