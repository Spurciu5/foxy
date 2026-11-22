// Foxy's fox, drawn with canvas paths: the same shapes as the Windows app (mascot.rs),
// plus a few things for touch: ears that twitch, leaning into a hand, chin up, purring.
"use strict";

const TAU = Math.PI * 2;

function rgba(c, a = 1) {
  return `rgba(${c[0]},${c[1]},${c[2]},${(c.length > 3 ? c[3] : 1) * a})`;
}

function lerpCol(a, b, k) {
  return [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * k);
}

function palette(skin) {
  return SKINS[skin] || SKINS[0];
}

/** Fill a path built by `build(ctx)` */
function fillPath(ctx, col, build) {
  ctx.beginPath();
  build(ctx);
  ctx.closePath();
  ctx.fillStyle = col;
  ctx.fill();
}

function strokePath(ctx, col, w, build) {
  ctx.beginPath();
  build(ctx);
  ctx.strokeStyle = col;
  ctx.lineWidth = w;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
}

function circle(ctx, x, y, r, col) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(r, 0.0001), 0, TAU);
  ctx.fillStyle = col;
  ctx.fill();
}

function strokeCircle(ctx, x, y, r, col, w) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.strokeStyle = col;
  ctx.lineWidth = w;
  ctx.stroke();
}

function ellipse(ctx, x, y, rx, ry, col) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(rx, 0.0001), Math.max(ry, 0.0001), 0, 0, TAU);
  ctx.fillStyle = col;
  ctx.fill();
}

function polyline(ctx, pts, col, w) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.strokeStyle = col;
  ctx.lineWidth = w;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
}

function rrect(ctx, l, t, r, b, rad, col) {
  ctx.beginPath();
  ctx.roundRect(l, t, r - l, b - t, rad);
  ctx.fillStyle = col;
  ctx.fill();
}

function runCmds(ctx, cmds) {
  for (const c of cmds) {
    if (c[0] === "M") ctx.moveTo(c[1], c[2]);
    else if (c[0] === "L") ctx.lineTo(c[1], c[2]);
    else if (c[0] === "Q") ctx.quadraticCurveTo(c[1], c[2], c[3], c[4]);
    else if (c[0] === "C") ctx.bezierCurveTo(c[1], c[2], c[3], c[4], c[5], c[6]);
  }
}

/** Unit heart (center x,y, size s) */
function heart(ctx, x, y, s, col) {
  const p = (a, b) => [x + a * s, y + b * s];
  fillPath(ctx, col, (c) => {
    c.moveTo(...p(0, 0.35));
    c.bezierCurveTo(...p(-0.1, 0.25), ...p(-0.55, -0.05), ...p(-0.5, -0.32));
    c.bezierCurveTo(...p(-0.45, -0.6), ...p(-0.08, -0.62), ...p(0, -0.32));
    c.bezierCurveTo(...p(0.08, -0.62), ...p(0.45, -0.6), ...p(0.5, -0.32));
    c.bezierCurveTo(...p(0.55, -0.05), ...p(0.1, 0.25), ...p(0, 0.35));
  });
}

function star4(ctx, x, y, r, col) {
  fillPath(ctx, col, (c) => {
    const pts = [[x, y - r], [x + r * 0.28, y - r * 0.28], [x + r, y], [x + r * 0.28, y + r * 0.28], [x, y + r], [x - r * 0.28, y + r * 0.28], [x - r, y], [x - r * 0.28, y - r * 0.28]];
    c.moveTo(...pts[0]);
    for (const q of pts.slice(1)) c.lineTo(...q);
  });
}

/** Skin effects (head coordinates) */
function sparkles(ctx, skin, t, a) {
  const tw = (k) => 0.55 + 0.45 * Math.sin(t * 2.2 + k);
  const white = (al) => `rgba(255,252,240,${al})`;
  switch (skin) {
    case 6:
      [[-0.5, -0.3], [0.55, -0.15], [0.1, -0.45]].forEach(([x, y], i) => {
        const k = tw(i * 2.1);
        star4(ctx, x, y, 0.09 * (0.7 + 0.3 * k), white(a * k));
      });
      break;
    case 7:
      [[-0.6, -0.2, 0.025], [-0.35, -0.42, 0.018], [0, -0.48, 0.022], [0.4, -0.38, 0.018], [0.66, -0.12, 0.025], [0.25, -0.25, 0.014], [-0.15, -0.28, 0.014]].forEach(([x, y, r], i) => {
        circle(ctx, x, y, r, `rgba(255,255,255,${a * tw(i * 1.3)})`);
      });
      star4(ctx, 0.45, -0.22, 0.08, white(a * tw(0.7)));
      break;
    case 5: {
      const bob = Math.sin(t * 1.6) * 0.04;
      const cx = 0.74, cy = -0.78 + bob;
      fillPath(ctx, `rgba(255,236,160,${a})`, (c) => {
        for (let i = 0; i <= 15; i++) {
          const an = Math.PI / 2 + (i / 15) * Math.PI;
          const px = cx + Math.cos(an) * 0.13, py = cy + Math.sin(an) * 0.13;
          i === 0 ? c.moveTo(px, py) : c.lineTo(px, py);
        }
        for (let i = 15; i >= 0; i--) {
          const an = Math.PI / 2 + (i / 15) * Math.PI;
          c.lineTo(cx + 0.05 + Math.cos(an) * 0.09, cy + Math.sin(an) * 0.12);
        }
      });
      star4(ctx, -0.7, -0.75 + bob * 0.5, 0.05, white(a * tw(1.1)));
      break;
    }
    case 9:
      for (let k = 0; k < 2; k++) {
        const an = t * 0.9 + k * Math.PI;
        const cx = Math.cos(an) * 0.95, cy = -0.35 + Math.sin(an) * 0.25;
        const rot = an * 1.5, s = Math.sin(rot), co = Math.cos(rot);
        const p = (x, y) => [cx + x * co - y * s, cy + x * s + y * co];
        fillPath(ctx, `rgba(110,205,150,${a * 0.95})`, (c) => {
          c.moveTo(...p(-0.1, 0));
          c.quadraticCurveTo(...p(0, -0.08), ...p(0.1, 0));
          c.quadraticCurveTo(...p(0, 0.08), ...p(-0.1, 0));
        });
        polyline(ctx, [p(-0.09, 0), p(0.08, 0)], `rgba(70,160,110,${a})`, 0.015);
      }
      break;
    case 11:
      for (let i = 0; i < 3; i++) {
        const p = (t * 0.55 + i / 3) % 1;
        const cx = 0.78 + Math.sin(p * 7 + i) * 0.06, cy = 0.45 - p * 1.3;
        const r = 0.045 + (0.03 * i) / 2;
        const al = a * (1 - p) * Math.min(p * 5, 1);
        strokeCircle(ctx, cx, cy, r, `rgba(200,235,255,${al})`, 0.018);
        circle(ctx, cx - r * 0.35, cy - r * 0.35, r * 0.25, `rgba(255,255,255,${al})`);
      }
      break;
    case 12: {
      const glow = 0.5 + 0.5 * Math.sin(t * 2);
      for (const s of [-1, 1]) circle(ctx, s * 0.36, 0.04, 0.24, `rgba(255,214,90,${a * (0.1 + 0.1 * glow)})`);
      for (let k = 0; k < 3; k++) {
        const an = t * 1.4 + (k * TAU) / 3;
        for (let j = 0; j < 4; j++) {
          const b = an - j * 0.18;
          circle(ctx, Math.cos(b), -0.2 + Math.sin(b) * 0.55, 0.06 - j * 0.012, `rgba(170,120,255,${a * (0.6 - j * 0.13)})`);
        }
      }
      break;
    }
    case 14:
      for (const [k, side] of [[0, -1], [0.5, 1]]) {
        const ph = (t * 1.6 + k) % 1;
        if (ph < 0.32) {
          const al = a * (1 - ph / 0.32);
          const ox = side * 0.98, oy = -0.62;
          const z = [[ox, oy - 0.18], [ox - side * 0.08, oy - 0.02], [ox + side * 0.03, oy], [ox - side * 0.05, oy + 0.18]];
          polyline(ctx, z, `rgba(255,255,255,${al * 0.5})`, 0.07);
          polyline(ctx, z, `rgba(255,236,90,${al})`, 0.035);
        }
      }
      for (let i = 0; i < 4; i++) {
        const a0 = t * 2.3 + i * 1.57;
        const flick = Math.max(0, Math.sin(t * 11 + i * 2));
        circle(ctx, Math.cos(a0) * 0.75, -0.75 + Math.sin(a0) * 0.18, 0.03, `rgba(200,245,255,${a * flick})`);
      }
      break;
    case 13:
      for (let i = 0; i < 3; i++) {
        const p = (t * 0.8 + i / 3) % 1;
        circle(ctx, -0.45 + i * 0.45 + Math.sin(p * 6) * 0.05, -0.35 - p * 0.55, 0.035 * (1 - p * 0.5), `rgba(255,200,90,${a * (1 - p)})`);
      }
      break;
    case 8:
      strokeCircle(ctx, -0.8, -0.06, 0.085, `rgba(255,204,70,${a})`, 0.035);
      star4(ctx, -0.86, -0.12, 0.05, white(a * tw(0.3)));
      break;
    case 15: {
      const ph = t % 4.2;
      const mx = 0, my = 0.52;
      if (ph < 2.4) {
        const p = ph / 2.4;
        const r = 0.06 + 0.3 * p * p * (3 - 2 * p);
        const cx = mx + 0.04 * p, cy = my + r * 0.55;
        circle(ctx, cx, cy, r, `rgba(255,120,186,${a * 0.88})`);
        circle(ctx, cx - r * 0.38, cy - r * 0.38, r * 0.2, `rgba(255,255,255,${a * 0.7})`);
      } else if (ph < 2.75) {
        const p = (ph - 2.4) / 0.35;
        for (let k = 0; k < 6; k++) {
          const an = (k * TAU) / 6 + 0.3, d = 0.18 + 0.22 * p;
          circle(ctx, mx + 0.04 + Math.cos(an) * d, my + 0.2 + Math.sin(an) * d * 0.8, 0.045 * (1 - p), `rgba(255,120,186,${a * (1 - p)})`);
        }
      }
      for (let i = 0; i < 2; i++) {
        const p = (t * 0.4 + i * 0.5) % 1;
        const side = i === 0 ? -1 : 1;
        heart(ctx, side * (0.86 + Math.sin(p * 6) * 0.05), 0.1 - p * 1.1, 0.16 + 0.05 * (1 - p), `rgba(255,110,170,${a * (1 - p) * Math.min(p * 5, 1)})`);
      }
      break;
    }
  }
}

/** Paint: a color [r,g,b,a] or a gradient {lin|rad:[...], stops:[[pos,[r,g,b,a]],...]} (head coordinates) */
function paint(ctx, p, a) {
  if (Array.isArray(p)) return rgba(p, a);
  const g = p.lin
    ? ctx.createLinearGradient(p.lin[0], p.lin[1], p.lin[2], p.lin[3])
    : ctx.createRadialGradient(p.rad[0], p.rad[1], 0, p.rad[0], p.rad[1], Math.max(p.rad[2], p.rad[3]));
  for (const [pos, c] of p.stops) g.addColorStop(Math.min(1, Math.max(0, pos)), rgba(c, a));
  return g;
}

const sinT = (v, t) => (v ? v[0] * Math.sin(t * v[1] + v[2]) : 0);

/** Draws generated shapes (accessories, skin layers), with animated groups */
function drawShapes(ctx, shapes, t, a) {
  for (const s of shapes) {
    if (s[0] === "group") {
      const g = s[1];
      const [cx, cy] = g.c || [0, 0];
      let ang = (g.angle || 0) + (g.spin ? (t * g.spin) % TAU : 0) + sinT(g.rot, t);
      const k = 1 + sinT(g.scale, t);
      const [sx, sy] = g.sxy || [1, 1];
      let dx = 0, dy = 0;
      if (g.move) {
        const m = g.move;
        const w = Math.sin(t * m[2] + m[3]);
        dx = m[0] * w;
        dy = m[1] * w;
      }
      let ga = a;
      if (g.fade) ga = a * (g.fade[0] + (g.fade[1] - g.fade[0]) * (0.5 + 0.5 * Math.sin(t * g.fade[2] + g.fade[3])));
      ctx.save();
      ctx.translate(cx + dx, cy + dy);
      ctx.rotate(ang);
      ctx.scale(sx * k, sy * k);
      ctx.translate(-cx, -cy);
      drawShapes(ctx, s[2], t, ga);
      ctx.restore();
      continue;
    }
    const col = paint(ctx, s[1], a);
    switch (s[0]) {
      case "path":
        fillPath(ctx, col, (c) => runCmds(c, s[2]));
        break;
      case "spath":
        strokePath(ctx, col, s[2], (c) => runCmds(c, s[3]));
        break;
      case "circle":
        circle(ctx, s[2], s[3], s[4], col);
        break;
      case "ellipse":
        ellipse(ctx, s[2], s[3], s[4], s[5], col);
        break;
      case "scircle":
        strokeCircle(ctx, s[2], s[3], s[4], col, s[5]);
        break;
      case "rrect":
        rrect(ctx, s[2], s[3], s[4], s[5], s[6], col);
        break;
      case "line":
        polyline(ctx, s[3], col, s[2]);
        break;
    }
  }
}

function accessory(ctx, acc, t, a) {
  if (acc === 14) {
    const bob = Math.sin(t * 2) * 0.04;
    for (const [col, w] of [[`rgba(255,220,90,${0.35 * a})`, 0.16], [`rgba(255,214,80,${a})`, 0.07]]) {
      ctx.beginPath();
      ctx.ellipse(0, -1.2 + bob, 0.42, 0.12, 0, 0, TAU);
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.stroke();
    }
    return;
  }
  if (ACCS[acc]) drawShapes(ctx, ACCS[acc], t, a);
}

/**
 * Draws the fox around (cx, cy), `size` px tall. `m` (all optional):
 *  sleeping, happy, pet (0..1 squish-and-hop), hearts, blush (0..1), lean (-1..1),
 *  skin, acc, angry (0..1), hug (0..1), earL/earR (twitch, radians), chin (0..1 head up),
 *  purr (0..1 tiny shake), surprise (0..1 wide eyes), squish (-1..1 cheek pushed from a side)
 */
function drawFox(ctx, cx, cy, size, t, m = {}) {
  const pal = palette(m.skin | 0);
  const a = m.alpha == null ? 1 : m.alpha;
  const fur = rgba(pal.fur, a), earCol = rgba(pal.dark, a), earIn = rgba(pal.ear_in, a);
  const cream = rgba(pal.cream, a), ink = rgba(pal.ink, a);
  const angry = Math.min(1, Math.max(0, m.angry || 0));
  const hug = Math.min(1, Math.max(0, m.hug || 0));
  const pet = m.pet || 0;
  const loving = m.hearts || pet > 0;
  const happy = (m.happy || pet > 0 || hug > 0.3) && angry < 0.3;
  const u = size * 0.5;

  let tilt, lift;
  if (m.happy) {
    tilt = Math.sin(t * 2.4) * 0.09;
    lift = 0;
  } else {
    tilt = Math.sin(t * 0.7) * 0.05;
    lift = Math.sin(t * 1.8) * 0.06;
  }
  if (m.sleeping) lift = Math.sin(t * 1.2) * 0.035;
  tilt += (m.lean || 0) * 0.22 + Math.sin(t * 38) * 0.035 * angry;
  const purr = m.purr || 0;
  const shake = purr * 0.012 * Math.sin(t * 55);
  const chin = m.chin || 0;
  lift -= chin * 0.1;

  ctx.save();
  let sx = u, sy = u, yoff = 0.04;
  if (hug > 0 && pet <= 0) {
    const sq = 0.07 * hug;
    sx = u * (1 + sq);
    sy = u * (1 - sq);
    yoff += sq * 0.5;
  } else if (pet > 0) {
    const p = Math.min(1, pet);
    const sq = Math.sin(p * Math.PI * 3) * (1 - p) * 0.14;
    const hop = -Math.abs(Math.sin(p * Math.PI * 2)) * (1 - p) * 0.25;
    sx = u * (1 + sq);
    sy = u * (1 - sq);
    yoff += hop + sq * 0.5;
  }
  // Pressing down on the head squishes it a bit
  const press = m.press || 0;
  sx *= 1 + press * 0.06;
  sy *= 1 - press * 0.06;
  yoff += press * 0.05;
  ctx.translate(cx + shake * u, cy + (lift + yoff) * u);
  ctx.rotate(tilt - chin * 0.08 * Math.sign(m.lean || 0.0001));
  ctx.scale(sx, sy);
  const lw = (w, px) => Math.max(w, px / u);

  const skin = m.skin | 0;
  const fx = typeof SKIN_FX !== "undefined" ? SKIN_FX[skin] : null;
  if (fx) drawShapes(ctx, fx.back, t, a);
  if (m.acc && typeof ACCS_BACK !== "undefined" && ACCS_BACK[m.acc]) drawShapes(ctx, ACCS_BACK[m.acc], t, a);
  // Gradient fur on the endgame skins
  let furFill = fur;
  if (pal.fur2) {
    furFill = ctx.createLinearGradient(0, -0.75, 0, 0.8);
    furFill.addColorStop(0, fur);
    furFill.addColorStop(1, rgba(pal.fur2, a));
  }
  // Ears (rounded tips), each can twitch around its base
  for (const s of [-1, 1]) {
    const tw = (s < 0 ? m.earL : m.earR) || 0;
    ctx.save();
    ctx.translate(s * 0.5, -0.45);
    ctx.rotate(s * tw);
    ctx.translate(-s * 0.5, 0.45);
    fillPath(ctx, earCol, (c) => {
      c.moveTo(s * 0.88, -0.18);
      c.quadraticCurveTo(s * 0.92, -0.95, s * 0.6, -1.02);
      c.quadraticCurveTo(s * 0.38, -0.86, s * 0.18, -0.58);
    });
    fillPath(ctx, earIn, (c) => {
      c.moveTo(s * 0.74, -0.3);
      c.quadraticCurveTo(s * 0.78, -0.8, s * 0.6, -0.84);
      c.quadraticCurveTo(s * 0.46, -0.72, s * 0.34, -0.55);
    });
    if (fx) drawShapes(ctx, s < 0 ? fx.earL : fx.earR, t, a);
    ctx.restore();
  }
  // Head
  fillPath(ctx, furFill, (c) => {
    c.moveTo(-0.92, 0.05);
    c.bezierCurveTo(-0.95, -0.78, 0.95, -0.78, 0.92, 0.05);
    c.bezierCurveTo(0.98, 0.3, 0.8, 0.42, 0.7, 0.46);
    c.bezierCurveTo(0.45, 0.8, -0.45, 0.8, -0.7, 0.46);
    c.bezierCurveTo(-0.8, 0.42, -0.98, 0.3, -0.92, 0.05);
  });
  // Cheek fluff (pushed in a little on the side being squished)
  for (const s of [-1, 1]) {
    const sq = m.squish && Math.sign(m.squish) === s ? Math.abs(m.squish) * 0.08 : 0;
    fillPath(ctx, furFill, (c) => {
      c.moveTo(s * (0.86 - sq), 0.18);
      c.lineTo(s * (1.02 - sq), 0.3);
      c.lineTo(s * (0.84 - sq), 0.36);
      c.lineTo(s * (0.96 - sq), 0.45);
      c.lineTo(s * 0.7, 0.46);
    });
  }
  // Cream face
  fillPath(ctx, cream, (c) => {
    c.moveTo(-0.74, 0.24);
    c.quadraticCurveTo(-0.36, -0.02, 0, 0.22);
    c.quadraticCurveTo(0.36, -0.02, 0.74, 0.24);
    c.bezierCurveTo(0.66, 0.62, 0.32, 0.76, 0, 0.76);
    c.bezierCurveTo(-0.32, 0.76, -0.66, 0.62, -0.74, 0.24);
  });
  if (fx) drawShapes(ctx, fx.marks, t, a);
  // Cheeks
  const bl = Math.max(Math.min(1, m.blush || 0), hug, angry * 0.6);
  const cheekC = lerpCol([255, 150, 160], [255, 84, 112], bl);
  const cheekA = (loving ? 0.95 : 0.75) * (1 - bl) + bl;
  for (const s of [-1, 1]) {
    const sq = m.squish && Math.sign(m.squish) === s ? Math.abs(m.squish) : 0;
    ellipse(ctx, s * 0.58, 0.36, 0.14 * (1 + 0.45 * bl) * (1 + sq * 0.25), 0.08 * (1 + 0.6 * bl), rgba(cheekC, cheekA * a));
    if (bl > 0.05) {
      for (let k = 0; k < 3; k++) {
        const x = s * 0.58 + (k - 1) * 0.07;
        polyline(ctx, [[x + 0.03, 0.3], [x - 0.03, 0.42]], `rgba(220,50,80,${a * bl * 0.8})`, 0.025);
      }
    }
  }
  // Eyes
  const blink = !happy && !m.hearts && !m.surprise && t % 4.2 < 0.14;
  for (const s of [-1, 1]) {
    const ex = s * 0.36, ey = 0.04;
    if (m.hearts) {
      const beat = 1 + 0.12 * Math.max(0, Math.sin(t * 7));
      heart(ctx, ex, ey, 0.42 * beat, `rgba(240,56,92,${a})`);
      circle(ctx, ex - 0.07, ey - 0.07, 0.035, `rgba(255,255,255,${0.8 * a})`);
      continue;
    }
    if (happy || m.sleeping) {
      const dy = happy ? -0.16 : 0.1;
      strokePath(ctx, ink, lw(0.075, 1.3), (c) => {
        c.moveTo(ex - 0.14, ey + 0.03);
        c.quadraticCurveTo(ex, ey + dy, ex + 0.14, ey + 0.03);
      });
    } else if (blink) {
      strokePath(ctx, ink, lw(0.07, 1.2), (c) => {
        c.moveTo(ex - 0.13, ey);
        c.quadraticCurveTo(ex, ey + 0.08, ex + 0.13, ey);
      });
    } else {
      const big = 1 + (m.surprise || 0) * 0.18;
      const lx = (m.lookX || 0) * 0.04, ly = (m.lookY || 0) * 0.04;
      ellipse(ctx, ex + lx * 0.5, ey + ly * 0.5, 0.135 * big, 0.17 * big, ink);
      if (pal.iris) {
        const ig = ctx.createLinearGradient(0, ey - 0.1, 0, ey + 0.15);
        ig.addColorStop(0, ink);
        ig.addColorStop(1, rgba(pal.iris, a));
        ellipse(ctx, ex + lx * 0.5, ey + 0.02 + ly * 0.5, 0.11 * big, 0.135 * big, ig);
      }
      circle(ctx, ex + 0.045 + lx, ey - 0.06 + ly, 0.06 * big, `rgba(255,255,255,${a})`);
      circle(ctx, ex - 0.04 + lx, ey + 0.06 + ly, 0.028, `rgba(255,255,255,${a})`);
      if (angry > 0.3) {
        polyline(ctx, [[ex - s * 0.15, ey - 0.22], [ex + s * 0.12, ey - 0.3]], ink, lw(0.055, 1));
      }
    }
  }
  // Nose and mouth
  ellipse(ctx, 0, 0.33, 0.085, 0.06, ink);
  if (angry > 0.3) {
    strokePath(ctx, ink, lw(0.05, 1), (c) => {
      c.moveTo(-0.12, 0.52);
      c.quadraticCurveTo(0, 0.42, 0.12, 0.52);
    });
  } else if (m.surprise > 0.4) {
    ellipse(ctx, 0, 0.5, 0.06, 0.075, `rgba(170,70,70,${a})`);
  } else if (happy) {
    fillPath(ctx, `rgba(170,70,70,${a})`, (c) => {
      c.moveTo(-0.12, 0.44);
      c.quadraticCurveTo(0, 0.62, 0.12, 0.44);
    });
  } else {
    strokePath(ctx, ink, lw(0.05, 1), (c) => {
      c.moveTo(-0.14, 0.44);
      c.quadraticCurveTo(-0.07, 0.52, 0, 0.42);
      c.quadraticCurveTo(0.07, 0.52, 0.14, 0.44);
    });
  }
  // Paws holding the cheeks (hug)
  if (hug > 0.05) {
    for (const s of [-1, 1]) {
      const x = s * (0.95 - 0.17 * hug), y = 0.52;
      circle(ctx, x, y, 0.19, rgba(pal.fur, a * hug));
      circle(ctx, x - s * 0.06, y - 0.08, 0.045, rgba(pal.ear_in, a * hug));
      circle(ctx, x - s * 0.1, y + 0.01, 0.045, rgba(pal.ear_in, a * hug));
    }
  }
  // Anger mark
  if (angry > 0.05) {
    const x = 0.62, y = -0.58, red = `rgba(235,40,50,${a * angry})`;
    for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      strokePath(ctx, red, lw(0.06, 1.2), (c) => {
        c.moveTo(x + dx * 0.05, y + dy * 0.17);
        c.quadraticCurveTo(x + dx * 0.05, y + dy * 0.05, x + dx * 0.17, y + dy * 0.05);
      });
    }
  }
  sparkles(ctx, skin, t, a);
  if (fx) drawShapes(ctx, fx.front, t, a);
  if (m.acc) accessory(ctx, m.acc, t, a);
  ctx.restore();
}

/** Converts a point on screen into the fox's head coordinates (unit = half its size) */
function foxLocal(px, py, cx, cy, size) {
  const u = size * 0.5;
  return [(px - cx) / u, (py - cy) / u - 0.04];
}

window.drawFox = drawFox;
window.foxLocal = foxLocal;
window.foxHeart = heart;
