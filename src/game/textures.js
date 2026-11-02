import * as THREE from 'three';

/* ------------------------------------------------------------------ *
 * Procedural texture set for the shooter. Everything is generated on
 * canvases from deterministic pseudo-random values, so a reload always
 * produces exactly the same surfaces. All maps tile in both axes.
 * ------------------------------------------------------------------ */

const TAU = Math.PI * 2;

/* ----------------------------- random ----------------------------- */

function mulberry32(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x, y, seed) {
  let n = Math.imul(x | 0, 374761393) ^
    Math.imul(y | 0, 668265263) ^
    Math.imul(seed | 0, 69069);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/* -------------------------- tiling noise -------------------------- */

/**
 * Tileable value-noise fBm. Frequencies are powers of two and the
 * lattice wraps, so the resulting field can be sampled at the texture
 * edge without a visible seam.
 */
function fbmField(size, seed, baseFreq = 4, octaves = 4, gain = 0.55) {
  const out = new Float32Array(size * size);
  const rng = mulberry32(seed);
  const sizeMask = size - 1;
  let freq = baseFreq;
  let amp = 1;
  let total = 0;

  for (let o = 0; o < octaves && freq <= size; o++) {
    const grid = new Float32Array(freq * freq);
    for (let i = 0; i < grid.length; i++) grid[i] = rng();

    const step = freq / size;
    const cell = new Int32Array(size);
    const weight = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      const u = i * step;
      const i0 = u | 0;
      const f = u - i0;
      cell[i] = i0;
      weight[i] = f * f * (3 - 2 * f);
    }

    const freqMask = freq - 1;
    for (let y = 0; y < size; y++) {
      const v = y * step;
      const j0 = v | 0;
      const fy = v - j0;
      const sy = fy * fy * (3 - 2 * fy);
      const row0 = (j0 & freqMask) * freq;
      const row1 = ((j0 + 1) & freqMask) * freq;
      const rowOffset = y * size;

      for (let x = 0; x < size; x++) {
        const i0 = cell[x];
        const i1 = (i0 + 1) & freqMask;
        const sx = weight[x];
        const a = grid[row0 + i0];
        const b = grid[row0 + i1];
        const c = grid[row1 + i0];
        const d = grid[row1 + i1];
        const top = a + (b - a) * sx;
        const bottom = c + (d - c) * sx;
        out[rowOffset + x] += (top + (bottom - top) * sy) * amp;
      }
    }

    total += amp;
    amp *= gain;
    freq *= 2;
  }

  const inv = 1 / total;
  for (let i = 0; i < out.length; i++) out[i] *= inv;
  return out;
}

function grainField(size, seed) {
  const rng = mulberry32(seed);
  const out = new Float32Array(size * size);
  for (let i = 0; i < out.length; i++) out[i] = rng();
  return out;
}

/* --------------------------- canvases ----------------------------- */

function createCanvas(width, height) {
  if (typeof OffscreenCanvas !== 'undefined') {
    try {
      return new OffscreenCanvas(width, height);
    } catch {
      /* fall through to a DOM canvas */
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function get2d(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Unable to create a 2D canvas context');
  ctx.imageSmoothingEnabled = true;
  return ctx;
}

function makeSurface(size, fillColor) {
  const canvas = createCanvas(size, size);
  const ctx = get2d(canvas);
  ctx.fillStyle = fillColor;
  ctx.fillRect(0, 0, size, size);
  return { canvas, ctx };
}

function makeHeightSurface(size, base = 0.5) {
  const canvas = createCanvas(size, size);
  const ctx = get2d(canvas);
  const v = Math.round(clamp01(base) * 255);
  ctx.fillStyle = `rgb(${v},${v},${v})`;
  ctx.fillRect(0, 0, size, size);
  return { canvas, ctx };
}

function gray(v) {
  const c = Math.round(clamp01(v) * 255);
  return `rgb(${c},${c},${c})`;
}

/* --------------------- wrapping draw helpers ---------------------- */

/**
 * Invokes cb for the original position and, when the shape touches an
 * edge, for the wrapped copies one tile away. This is what keeps
 * pebbles, stains, scratches and cracks continuous across UV seams.
 */
function forEachWrap(size, x, y, margin, cb) {
  const ox = [];
  const oy = [];
  if (x < margin) ox.push(size);
  else if (x > size - margin) ox.push(-size);
  if (y < margin) oy.push(size);
  else if (y > size - margin) oy.push(-size);

  cb(0, 0);
  for (let i = 0; i < ox.length; i++) cb(ox[i], 0);
  for (let i = 0; i < oy.length; i++) cb(0, oy[i]);
  for (let i = 0; i < ox.length; i++) {
    for (let j = 0; j < oy.length; j++) cb(ox[i], oy[j]);
  }
}

function wrapEllipse(ctx, size, x, y, rx, ry, rotation, fill, stroke = null, lineWidth = 1) {
  const margin = Math.max(rx, ry) + Math.max(lineWidth, 1) + 1;
  const nearX = x < margin || x > size - margin;
  const nearY = y < margin || y > size - margin;
  const draw = () => {
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(rx, 0.2), Math.max(ry, 0.2), rotation, 0, TAU);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
  };

  if (!nearX && !nearY) {
    draw();
    return;
  }

  forEachWrap(size, x, y, margin, (ox, oy) => {
    if (ox === 0 && oy === 0) {
      draw();
    } else {
      ctx.save();
      ctx.translate(ox, oy);
      draw();
      ctx.restore();
    }
  });
}

function wrapBlob(ctx, size, x, y, rx, ry, stops, rotation = 0) {
  const margin = Math.max(rx, ry) + 2;
  const draw = (ox, oy) => {
    ctx.save();
    ctx.translate(x + ox, y + oy);
    ctx.rotate(rotation);
    ctx.scale(rx, ry);
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    for (let i = 0; i < stops.length; i++) gradient.addColorStop(stops[i][0], stops[i][1]);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, TAU);
    ctx.fill();
    ctx.restore();
  };

  if (x >= margin && x <= size - margin && y >= margin && y <= size - margin) {
    draw(0, 0);
    return;
  }
  forEachWrap(size, x, y, margin, draw);
}

function wrapStroke(ctx, size, points, color, width, alpha = 1) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }

  const margin = Math.max(1, width) + 2;
  const nearX = minX < margin || maxX > size - margin;
  const nearY = minY < margin || maxY > size - margin;

  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = alpha;

  const draw = (ox, oy) => {
    ctx.beginPath();
    ctx.moveTo(points[0][0] + ox, points[0][1] + oy);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i][0] + ox, points[i][1] + oy);
    }
    ctx.stroke();
  };

  if (!nearX && !nearY) {
    draw(0, 0);
    ctx.globalAlpha = 1;
    return;
  }

  const ox = [0];
  const oy = [0];
  if (minX < margin) ox.push(size);
  if (maxX > size - margin) ox.push(-size);
  if (minY < margin) oy.push(size);
  if (maxY > size - margin) oy.push(-size);
  for (let ix = 0; ix < ox.length; ix++) {
    for (let iy = 0; iy < oy.length; iy++) draw(ox[ix], oy[iy]);
  }
  ctx.globalAlpha = 1;
}

/**
 * Collects many ellipses and fills them a colour at a time. Large numbers of
 * tiny aggregate/pit shapes are dramatically cheaper as one path per colour.
 */
function ellipseBatch(ctx, size) {
  const groups = new Map();
  const order = [];

  function add(x, y, rx, ry, rotation, fill) {
    let group = groups.get(fill);
    if (!group) {
      group = [];
      groups.set(fill, group);
      order.push(fill);
    }
    const margin = Math.max(rx, ry) + 2;
    forEachWrap(size, x, y, margin, (ox, oy) => {
      group.push(x + ox, y + oy, Math.max(rx, 0.2), Math.max(ry, 0.2), rotation);
    });
  }

  function flush() {
    for (let i = 0; i < order.length; i++) {
      const fill = order[i];
      const group = groups.get(fill);
      ctx.fillStyle = fill;
      ctx.beginPath();
      for (let j = 0; j < group.length; j += 5) {
        ctx.ellipse(group[j], group[j + 1], group[j + 2], group[j + 3], group[j + 4], 0, TAU);
      }
      ctx.fill();
    }
    groups.clear();
    order.length = 0;
  }

  return { add, flush };
}

/**
 * Same idea for short straight strokes, used for brushed metal and fibres.
 */
function lineBatch(ctx, size) {
  const groups = new Map();
  const order = [];

  function add(x1, y1, x2, y2, color, width, alpha = 1) {
    const key = `${color}|${width}|${alpha}`;
    let group = groups.get(key);
    if (!group) {
      group = { color, width, alpha, points: [] };
      groups.set(key, group);
      order.push(key);
    }
    const margin = width + 2;
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    const ox = [0];
    const oy = [0];
    if (minX < margin) ox.push(size);
    if (maxX > size - margin) ox.push(-size);
    if (minY < margin) oy.push(size);
    if (maxY > size - margin) oy.push(-size);
    for (let i = 0; i < ox.length; i++) {
      for (let j = 0; j < oy.length; j++) {
        group.points.push(x1 + ox[i], y1 + oy[j], x2 + ox[i], y2 + oy[j]);
      }
    }
  }

  function flush() {
    for (let i = 0; i < order.length; i++) {
      const group = groups.get(order[i]);
      ctx.strokeStyle = group.color;
      ctx.lineWidth = group.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = group.alpha;
      ctx.beginPath();
      for (let j = 0; j < group.points.length; j += 4) {
        ctx.moveTo(group.points[j], group.points[j + 1]);
        ctx.lineTo(group.points[j + 2], group.points[j + 3]);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    groups.clear();
    order.length = 0;
  }

  return { add, flush };
}

/* ------------------------- feature helpers ------------------------ */

function crackPath(rng, x, y, angle, length, segments, wobble = 0.75) {
  const points = [[x, y]];
  const step = length / Math.max(1, segments);
  let a = angle;
  let px = x;
  let py = y;
  for (let i = 0; i < segments; i++) {
    a += (rng() - 0.5) * wobble;
    px += Math.cos(a) * step;
    py += Math.sin(a) * step;
    points.push([px, py]);
  }
  return points;
}

function drawCrackCluster(ctx, heightCtx, size, rng, options) {
  const {
    x, y, angle, length, segments = 12,
    color = 'rgba(35,35,32,0.8)',
    width = 1.1,
    heightColor = 'rgb(46,46,46)',
    bevel = true
  } = options;

  const main = crackPath(rng, x, y, angle, length, segments);
  const paths = [main];
  const branches = 1 + ((rng() * 3) | 0);

  for (let b = 0; b < branches; b++) {
    const at = 2 + ((rng() * Math.max(1, main.length - 4)) | 0);
    const source = main[Math.min(at, main.length - 1)];
    const branchAngle = angle + (rng() < 0.5 ? -1 : 1) * (0.45 + rng() * 0.9);
    const branchLength = length * (0.16 + rng() * 0.32);
    paths.push(crackPath(rng, source[0], source[1], branchAngle, branchLength, Math.max(4, segments >> 1), 0.9));
  }

  if (bevel) {
    wrapStroke(ctx, size, main, 'rgba(205,203,192,0.13)', width + 2.2, 1);
  }
  for (let i = 0; i < paths.length; i++) {
    wrapStroke(ctx, size, paths[i], color, width, 0.95);
    if (heightCtx) wrapStroke(heightCtx, size, paths[i], heightColor, width, 1);
  }
}

/* ------------------------- normal mapping ------------------------- */

function normalTexture(heightCanvas, size, strength, anisotropy) {
  const heightCtx = get2d(heightCanvas);
  const source = heightCtx.getImageData(0, 0, size, size).data;
  const height = new Float32Array(size * size);
  for (let i = 0, p = 0; i < height.length; i++, p += 4) {
    height[i] = source[p] * (1 / 255);
  }

  const canvas = createCanvas(size, size);
  const ctx = get2d(canvas);
  const image = ctx.createImageData(size, size);
  const data = image.data;
  const mask = size - 1;

  for (let y = 0; y < size; y++) {
    const rowUp = ((y - 1) & mask) * size;
    const row = y * size;
    const rowDown = ((y + 1) & mask) * size;

    for (let x = 0; x < size; x++) {
      const xm = (x - 1) & mask;
      const xp = (x + 1) & mask;

      const tl = height[rowUp + xm];
      const tc = height[rowUp + x];
      const tr = height[rowUp + xp];
      const ml = height[row + xm];
      const mr = height[row + xp];
      const bl = height[rowDown + xm];
      const bc = height[rowDown + x];
      const br = height[rowDown + xp];

      // Sobel gradients, sampled with wrap-around for a seamless map.
      const dx = ((tr + 2 * mr + br) - (tl + 2 * ml + bl)) * 0.125;
      const dy = ((bl + 2 * bc + br) - (tl + 2 * tc + tr)) * 0.125;

      let nx = -dx * strength;
      let ny = dy * strength;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      nx *= inv;
      ny *= inv;

      const p = (row + x) * 4;
      data[p] = (nx * 0.5 + 0.5) * 255;
      data[p + 1] = (ny * 0.5 + 0.5) * 255;
      data[p + 2] = (inv * 0.5 + 0.5) * 255;
      data[p + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.name = 'procedural-normal';
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = anisotropy;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/* ----------------------------- sand ------------------------------- */

function buildSand(size) {
  const seed = 0x51a9d3;
  const rng = mulberry32(seed);
  const color = makeSurface(size, '#c9a96e');
  const height = makeHeightSurface(size, 0.5);
  const cctx = color.ctx;
  const hctx = height.ctx;

  const broad = fbmField(size, seed ^ 0x1a2b3c, 4, 4, 0.58);
  const grain = grainField(size, seed ^ 0x3c4d5e);

  const cimage = cctx.getImageData(0, 0, size, size);
  const himage = hctx.getImageData(0, 0, size, size);
  const cd = cimage.data;
  const hd = himage.data;

  const rippleY = (TAU * 13) / size;
  const rippleX = (TAU * 2) / size;

  for (let y = 0, i = 0, p = 0; y < size; y++) {
    for (let x = 0; x < size; x++, i++, p += 4) {
      const n = broad[i];
      const g = grain[i];
      const phase = y * rippleY + x * rippleX + (n - 0.5) * 3.4 + Math.sin(x * rippleX) * 0.8;
      const wave = Math.sin(phase);
      const crest = 0.5 + 0.5 * wave;

      const shade = (n - 0.5) * 27 + (crest - 0.5) * 15 + (g - 0.5) * 9;
      let r = 201 + shade * 1.06;
      let gg = 169 + shade * 0.94;
      let b = 110 + shade * 0.73;

      // Sparse darker/lighter mineral grains.
      if (g > 0.988) {
        r -= 27;
        gg -= 25;
        b -= 20;
      } else if (g < 0.006) {
        r += 17;
        gg += 15;
        b += 11;
      }

      cd[p] = r;
      cd[p + 1] = gg;
      cd[p + 2] = b;

      const hv = 0.5 + (n - 0.5) * 0.32 + (crest - 0.5) * 0.13 + (g - 0.5) * 0.035;
      hd[p] = hv * 255;
      hd[p + 1] = hv * 255;
      hd[p + 2] = hv * 255;
    }
  }

  cctx.putImageData(cimage, 0, 0);
  hctx.putImageData(himage, 0, 0);

  // Wind-polished grains and pebbles.
  const pebbleColors = ['#8a7a60', '#9c8a6c', '#6f6552', '#ad9a78', '#786b55', '#5f5747'];
  const colorBatch = ellipseBatch(cctx, size);
  const heightBatch = ellipseBatch(hctx, size);

  for (let k = 0; k < 165; k++) {
    const x = rng() * size;
    const y = rng() * size;
    const large = rng() > 0.87;
    const rx = large ? 2.2 + rng() * 3.8 : 0.55 + rng() * 1.65;
    const ry = rx * (0.6 + rng() * 0.55);
    const rotation = rng() * Math.PI;
    const body = pebbleColors[(rng() * pebbleColors.length) | 0];
    const hv = 0.68 + ((rng() * 5) | 0) * 0.035;

    colorBatch.add(x + 1.1, y + 1.3, rx * 1.05, ry * 1.05, rotation, 'rgba(28,22,16,0.18)');
    colorBatch.add(x, y, rx, ry, rotation, body);
    colorBatch.add(x - rx * 0.22, y - ry * 0.22, rx * 0.42, ry * 0.32, rotation, 'rgba(245,232,202,0.22)');
    heightBatch.add(x + 0.8, y + 1, rx * 1.03, ry * 1.03, rotation, gray(0.39));
    heightBatch.add(x, y, rx, ry, rotation, gray(hv));
  }

  // A handful of bigger, flatter stones.
  for (let k = 0; k < 8; k++) {
    const x = rng() * size;
    const y = rng() * size;
    const rx = 4 + rng() * 6;
    const ry = rx * (0.5 + rng() * 0.3);
    const rotation = rng() * Math.PI;
    colorBatch.add(x + 1.8, y + 2.2, rx, ry, rotation, 'rgba(45,35,24,0.26)');
    colorBatch.add(x, y, rx, ry, rotation, '#756a56');
    colorBatch.add(x - rx * 0.22, y - ry * 0.25, rx * 0.58, ry * 0.45, rotation, '#94866b');
    colorBatch.add(x - rx * 0.34, y - ry * 0.35, rx * 0.24, ry * 0.2, rotation, 'rgba(238,224,190,0.3)');
    heightBatch.add(x + 1.2, y + 1.4, rx, ry, rotation, gray(0.3));
    heightBatch.add(x, y, rx, ry, rotation, gray(0.72));
  }

  colorBatch.flush();
  heightBatch.flush();

  // Faint wind streaks following the ripple direction.
  for (let k = 0; k < 14; k++) {
    const y0 = rng() * size;
    const amplitude = 2 + rng() * 4;
    const waves = 1 + ((rng() * 3) | 0);
    const points = [];
    for (let s = 0; s <= 16; s++) {
      const t = s / 16;
      points.push([
        t * size,
        y0 + Math.sin(t * TAU * waves + rng() * 0.15) * amplitude
      ]);
    }
    wrapStroke(
      cctx, size, points,
      rng() > 0.5 ? 'rgba(245,228,190,0.055)' : 'rgba(103,82,51,0.05)',
      1.5 + rng() * 2.5
    );
  }

  return { color: color.canvas, height: height.canvas };
}

/* --------------------------- concrete ----------------------------- */

function buildConcrete(size, options) {
  const {
    seed,
    base = [146, 143, 134],
    wet = false
  } = options;

  const rng = mulberry32(seed);
  const color = makeSurface(size, `rgb(${base[0]},${base[1]},${base[2]})`);
  const height = makeHeightSurface(size, 0.5);
  const cctx = color.ctx;
  const hctx = height.ctx;

  const broad = fbmField(size, seed ^ 0x7a11c3, 4, 4, 0.58);
  const grain = grainField(size, seed ^ 0x5e6f77);

  const cimage = cctx.getImageData(0, 0, size, size);
  const himage = hctx.getImageData(0, 0, size, size);
  const cd = cimage.data;
  const hd = himage.data;

  for (let y = 0, i = 0, p = 0; y < size; y++) {
    for (let x = 0; x < size; x++, i++, p += 4) {
      const n = broad[i];
      const g = grain[i];
      const shade = (n - 0.5) * (wet ? 30 : 24) + (g - 0.5) * 12;

      let r = base[0] + shade * 1.03;
      let gg = base[1] + shade * 1.0;
      let b = base[2] + shade * 0.94;

      if (wet) {
        // Damp concrete picks up a slight green/blue cast.
        gg += (n - 0.5) * 4.5;
        b += (n - 0.5) * 4;
      }

      // Small aggregate flecks.
      if (g > 0.992) {
        r += 22;
        gg += 21;
        b += 18;
      } else if (g < 0.012) {
        r -= 23;
        gg -= 22;
        b -= 19;
      }

      cd[p] = r;
      cd[p + 1] = gg;
      cd[p + 2] = b;

      const hv = 0.5 + (n - 0.5) * 0.30 + (g - 0.5) * 0.055;
      hd[p] = hv * 255;
      hd[p + 1] = hv * 255;
      hd[p + 2] = hv * 255;
    }
  }

  cctx.putImageData(cimage, 0, 0);
  hctx.putImageData(himage, 0, 0);

  // Large damp stains / discolouration.
  const stainCount = wet ? 13 : 10;
  for (let k = 0; k < stainCount; k++) {
    const x = rng() * size;
    const y = rng() * size;
    const radius = 24 + rng() * 90;
    const rot = rng() * Math.PI;
    if (wet) {
      wrapBlob(cctx, size, x, y, radius, radius * (0.55 + rng() * 0.5), [
        [0, 'rgba(24,36,33,0.25)'],
        [0.55, 'rgba(31,43,39,0.14)'],
        [1, 'rgba(38,50,45,0)']
      ], rot);
    } else {
      wrapBlob(cctx, size, x, y, radius, radius * (0.5 + rng() * 0.55), [
        [0, 'rgba(58,55,47,0.19)'],
        [0.6, 'rgba(71,67,57,0.09)'],
        [1, 'rgba(80,74,63,0)']
      ], rot);
    }
  }

  // Smaller spots and a second layer of mottling.
  for (let k = 0; k < 14; k++) {
    const x = rng() * size;
    const y = rng() * size;
    const radius = 5 + rng() * 28;
    wrapBlob(cctx, size, x, y, radius, radius * (0.5 + rng() * 0.6), wet
      ? [[0, 'rgba(26,42,38,0.24)'], [1, 'rgba(26,42,38,0)']]
      : [[0, 'rgba(55,51,43,0.14)'], [1, 'rgba(55,51,43,0)']], rng() * Math.PI);
  }

  if (!wet) {
    // Pale efflorescence blooms.
    for (let k = 0; k < 5; k++) {
      const x = rng() * size;
      const y = rng() * size;
      const radius = 26 + rng() * 60;
      wrapBlob(cctx, size, x, y, radius, radius * 0.7, [
        [0, 'rgba(220,216,201,0.11)'],
        [1, 'rgba(220,216,201,0)']
      ], rng() * Math.PI);
    }
  }

  // Water drips and damp sheen on the dark variant.
  if (wet) {
    for (let k = 0; k < 28; k++) {
      const x = rng() * size;
      const y = rng() * size;
      const len = 35 + rng() * 170;
      const points = [];
      for (let s = 0; s <= 7; s++) {
        const t = s / 7;
        points.push([x + Math.sin(t * 5 + k) * (1 + rng() * 2), y + t * len]);
      }
      wrapStroke(cctx, size, points, 'rgba(21,33,30,0.14)', 1.5 + rng() * 6);
    }

    for (let k = 0; k < 8; k++) {
      const x = rng() * size;
      const y = rng() * size;
      const radius = 14 + rng() * 48;
      wrapBlob(cctx, size, x, y, radius, radius * (0.5 + rng() * 0.5), [
        [0, 'rgba(127,151,143,0.09)'],
        [1, 'rgba(127,151,143,0)']
      ], rng() * Math.PI);
    }
  }

  // Faint horizontal trowel / broom marks.
  for (let k = 0; k < 20; k++) {
    const y0 = rng() * size;
    const amp = 1.2 + rng() * 4;
    const points = [];
    for (let s = 0; s <= 10; s++) {
      const t = s / 10;
      points.push([t * size, y0 + Math.sin(t * TAU * (1 + ((rng() * 2) | 0)) + k) * amp]);
    }
    wrapStroke(
      cctx, size, points,
      wet ? 'rgba(40,52,48,0.05)' : 'rgba(73,70,61,0.055)',
      2 + rng() * 6
    );
  }

  // Fine aggregate and small pits.
  const colorBatch = ellipseBatch(cctx, size);
  const heightBatch = ellipseBatch(hctx, size);

  for (let k = 0; k < 340; k++) {
    const x = rng() * size;
    const y = rng() * size;
    const r = 0.4 + rng() * 1.5;
    const light = rng() > 0.55;
    colorBatch.add(
      x, y, r, r * (0.6 + rng() * 0.6), rng() * Math.PI,
      light ? 'rgba(206,202,189,0.24)' : 'rgba(42,41,37,0.22)'
    );
  }

  for (let k = 0; k < 110; k++) {
    const x = rng() * size;
    const y = rng() * size;
    const r = 1.0 + rng() * 2.6;
    const rotation = rng() * Math.PI;
    colorBatch.add(x, y, r, r * (0.55 + rng() * 0.5), rotation, 'rgba(34,33,30,0.62)');
    colorBatch.add(x - r * 0.22, y - r * 0.22, r * 0.5, r * 0.32, rotation, 'rgba(205,201,188,0.23)');
    heightBatch.add(x, y, r, r * 0.7, rotation, gray(0.31));
  }

  colorBatch.flush();
  heightBatch.flush();

  // Hairline cracks, distributed over a loose grid so no area stays bare.
  const crackCount = wet ? 6 : 7;
  const crackCols = 3;
  const crackRows = 2;
  for (let k = 0; k < crackCount; k++) {
    const gx = k % crackCols;
    const gy = (k / crackCols) | 0;
    const x = ((gx + 0.18 + rng() * 0.64) / crackCols) * size;
    const y = ((gy + 0.18 + rng() * 0.64) / crackRows) * size;
    drawCrackCluster(cctx, hctx, size, rng, {
      x, y,
      angle: rng() * TAU,
      length: 55 + rng() * 145,
      segments: 12 + ((rng() * 12) | 0),
      width: 0.8 + rng() * 0.85,
      color: wet ? 'rgba(22,25,23,0.82)' : 'rgba(34,33,29,0.78)',
      heightColor: gray(0.32),
      bevel: true
    });
  }

  // Form-tie holes add a believable poured-concrete detail.
  if (!wet) {
    const ties = [
      [size * 0.23, size * 0.37],
      [size * 0.71, size * 0.67]
    ];
    for (let k = 0; k < ties.length; k++) {
      const x = ties[k][0];
      const y = ties[k][1];
      wrapEllipse(cctx, size, x, y, 8.5, 8.5, 0, 'rgba(188,184,171,0.22)');
      wrapEllipse(cctx, size, x, y, 6, 6, 0, 'rgba(36,35,31,0.75)');
      wrapEllipse(cctx, size, x - 1.2, y - 1.4, 2.6, 2.2, 0, 'rgba(126,122,111,0.6)');
      wrapEllipse(hctx, size, x, y, 7, 7, 0, gray(0.25));
    }
  }

  return { color: color.canvas, height: height.canvas };
}

/* ----------------------------- metal ------------------------------ */

function buildMetal(size) {
  const seed = 0xb17e42;
  const rng = mulberry32(seed);
  const color = makeSurface(size, '#5f6468');
  const height = makeHeightSurface(size, 0.5);
  const cctx = color.ctx;
  const hctx = height.ctx;

  const broad = fbmField(size, seed ^ 0x22cc11, 4, 4, 0.55);
  const grain = grainField(size, seed ^ 0x77aa33);

  const cimage = cctx.getImageData(0, 0, size, size);
  const himage = hctx.getImageData(0, 0, size, size);
  const cd = cimage.data;
  const hd = himage.data;

  const seamA = size * 0.25;
  const seamB = size * 0.75;
  const seamMid = size * 0.5;

  for (let y = 0, i = 0, p = 0; y < size; y++) {
    const panelY = y < seamMid ? 0 : 1;
    for (let x = 0; x < size; x++, i++, p += 4) {
      const n = broad[i];
      const g = grain[i];
      // Noise stretched horizontally reads as a brushed finish.
      const brush = hash2(x >> 4, y, seed ^ 0x9911);
      const panelX = x < seamA ? 0 : x < seamB ? 1 : 2;
      const panelTint = (hash2(panelX, panelY, seed ^ 0x7c31) - 0.5) * 9;
      const shade = (n - 0.5) * 22 + (brush - 0.5) * 10 + (g - 0.5) * 5 + panelTint;

      const r = 92 + shade * 1.02;
      const gg = 97 + shade;
      const b = 101 + shade * 1.04;

      cd[p] = r;
      cd[p + 1] = gg;
      cd[p + 2] = b;

      const hv = 0.5 + (n - 0.5) * 0.20 + (brush - 0.5) * 0.04;
      hd[p] = hv * 255;
      hd[p + 1] = hv * 255;
      hd[p + 2] = hv * 255;
    }
  }

  cctx.putImageData(cimage, 0, 0);
  hctx.putImageData(himage, 0, 0);

  // Fine brush strokes, batched into a handful of styles.
  const brushLines = lineBatch(cctx, size);
  for (let k = 0; k < 220; k++) {
    const y = rng() * size;
    const x0 = rng() * size;
    const len = 20 + rng() * 190;
    const light = rng() > 0.44;
    const strong = rng() > 0.5;
    brushLines.add(
      x0, y, x0 + len, y,
      light
        ? (strong ? 'rgba(199,210,217,0.065)' : 'rgba(199,210,217,0.035)')
        : (strong ? 'rgba(21,24,28,0.07)' : 'rgba(21,24,28,0.038)'),
      strong ? 0.9 : 0.5
    );
  }
  brushLines.flush();

  // Panel seams.
  const verticalSeams = [size * 0.25, size * 0.75];
  const horizontalSeams = [size * 0.5];

  for (let s = 0; s < verticalSeams.length; s++) {
    const x = verticalSeams[s];
    cctx.fillStyle = 'rgba(20,23,26,0.78)';
    cctx.fillRect(x - 1.2, 0, 2.4, size);
    cctx.fillStyle = 'rgba(190,200,207,0.20)';
    cctx.fillRect(x + 1.8, 0, 1, size);
    cctx.fillStyle = 'rgba(12,14,16,0.22)';
    cctx.fillRect(x - 3, 0, 1.5, size);
    hctx.fillStyle = gray(0.28);
    hctx.fillRect(x - 1.5, 0, 3, size);
    hctx.fillStyle = gray(0.66);
    hctx.fillRect(x + 1.5, 0, 1.5, size);
  }

  for (let s = 0; s < horizontalSeams.length; s++) {
    const y = horizontalSeams[s];
    cctx.fillStyle = 'rgba(20,23,26,0.78)';
    cctx.fillRect(0, y - 1.2, size, 2.4);
    cctx.fillStyle = 'rgba(190,200,207,0.20)';
    cctx.fillRect(0, y + 1.8, size, 1);
    cctx.fillStyle = 'rgba(12,14,16,0.22)';
    cctx.fillRect(0, y - 3, size, 1.5);
    hctx.fillStyle = gray(0.28);
    hctx.fillRect(0, y - 1.5, size, 3);
    hctx.fillStyle = gray(0.66);
    hctx.fillRect(0, y + 1.5, size, 1.5);
  }

  // Rivets along the horizontal seam.
  for (let x = 16; x < size; x += 48) {
    const y = size * 0.5;
    const nearVertical = verticalSeams.some((sx) => Math.abs(sx - x) < 10);
    if (nearVertical) continue;

    wrapEllipse(cctx, size, x, y, 4.2, 4.2, 0, 'rgba(22,25,28,0.85)');
    wrapEllipse(cctx, size, x, y, 3.4, 3.4, 0, '#7c8388');
    wrapEllipse(cctx, size, x - 0.9, y - 0.9, 2.0, 2.0, 0, 'rgba(205,214,220,0.55)');
    wrapEllipse(cctx, size, x, y, 3.1, 3.1, 0, 'rgba(0,0,0,0)', 'rgba(36,40,44,0.6)', 0.8);
    wrapEllipse(hctx, size, x, y, 3.6, 3.6, 0, gray(0.76));
  }

  // Scratches and gouges.
  for (let k = 0; k < 34; k++) {
    const x = rng() * size;
    const y = rng() * size;
    const angle = (rng() - 0.5) * 1.2;
    const length = 8 + rng() * 85;
    const points = crackPath(rng, x, y, angle, length, 4 + ((rng() * 5) | 0), 0.25);
    const light = rng() > 0.3;
    const bright = light && rng() > 0.78;
    wrapStroke(
      cctx, size, points,
      light
        ? `rgba(216,224,229,${bright ? 0.38 : 0.20 + rng() * 0.10})`
        : `rgba(24,27,31,${0.26 + rng() * 0.12})`,
      0.45 + rng() * 0.85
    );
    wrapStroke(hctx, size, points, gray(0.37), 0.7 + rng() * 0.7);
    if (light) {
      const shifted = points.map((p) => [p[0] + 0.8, p[1] + 0.8]);
      wrapStroke(cctx, size, shifted, 'rgba(38,42,46,0.20)', 0.6);
    }
  }

  // Worn paint along the panel seams and small dents.
  const chipColor = ellipseBatch(cctx, size);
  const chipHeight = ellipseBatch(hctx, size);

  for (let k = 0; k < 40; k++) {
    const vertical = rng() > 0.5;
    const along = rng() * size;
    const seam = vertical ? (rng() > 0.5 ? seamA : seamB) : seamMid;
    const x = vertical ? seam + (rng() - 0.5) * 7 : along;
    const y = vertical ? along : seam + (rng() - 0.5) * 7;
    const rx = 1 + rng() * 3.8;
    const ry = 0.6 + rng() * 1.8;
    const rotation = rng() * Math.PI;
    chipColor.add(x, y, rx, ry, rotation, 'rgba(34,38,42,0.35)');
    chipColor.add(x - 0.4, y - 0.4, rx * 0.82, ry * 0.82, rotation, 'rgba(174,183,189,0.34)');
    chipHeight.add(x, y, rx * 0.8, ry * 0.8, rotation, gray(0.42));
  }

  for (let k = 0; k < 10; k++) {
    const x = rng() * size;
    const y = rng() * size;
    const rx = 2 + rng() * 7;
    const ry = rx * (0.4 + rng() * 0.5);
    const rotation = rng() * Math.PI;
    chipColor.add(x, y, rx, ry, rotation, 'rgba(28,32,35,0.16)');
    chipColor.add(x - 0.8, y - 0.8, rx * 0.7, ry * 0.6, rotation, 'rgba(188,197,203,0.10)');
    chipHeight.add(x, y, rx, ry, rotation, gray(0.43));
  }

  chipColor.flush();
  chipHeight.flush();

  // Dark oil / water smudges and lighter worn patches.
  for (let k = 0; k < 7; k++) {
    const x = rng() * size;
    const y = rng() * size;
    const radius = 18 + rng() * 65;
    wrapBlob(cctx, size, x, y, radius, radius * (0.45 + rng() * 0.6), [
      [0, 'rgba(12,15,17,0.16)'],
      [1, 'rgba(15,18,20,0)']
    ], rng() * Math.PI);
  }

  for (let k = 0; k < 5; k++) {
    const x = rng() * size;
    const y = rng() * size;
    const radius = 25 + rng() * 70;
    wrapBlob(cctx, size, x, y, radius, radius * 0.55, [
      [0, 'rgba(190,199,204,0.06)'],
      [1, 'rgba(190,199,204,0)']
    ], rng() * Math.PI);
  }

  return { color: color.canvas, height: height.canvas };
}

/* ------------------------------ rust ------------------------------ */

function buildRust(size) {
  const seed = 0x9a7133;
  const rng = mulberry32(seed);
  const color = makeSurface(size, '#5b3a28');
  const ctx = color.ctx;

  const broad = fbmField(size, seed ^ 0x113355, 4, 4, 0.58);
  const detail = fbmField(size, seed ^ 0x7799bb, 8, 4, 0.58);
  const grain = grainField(size, seed ^ 0x224466);

  const image = ctx.getImageData(0, 0, size, size);
  const d = image.data;

  for (let y = 0, i = 0, p = 0; y < size; y++) {
    for (let x = 0; x < size; x++, i++, p += 4) {
      const n1 = broad[i];
      const n2 = detail[i];
      const g = grain[i];
      const cluster = hash2(x >> 2, y >> 2, seed ^ 0x5171);

      const mask = smoothstep(0.34, 0.70, n1 * 0.60 + n2 * 0.30 + cluster * 0.10);
      const heat = smoothstep(0.52, 0.88, n2 * 0.52 + n1 * 0.26 + cluster * 0.22);

      const paintR = 69 + (n2 - 0.5) * 22;
      const paintG = 65 + (n2 - 0.5) * 18;
      const paintB = 57 + (n2 - 0.5) * 14;

      let r = lerp(paintR, 147, mask);
      let gg = lerp(paintG, 75, mask);
      let b = lerp(paintB, 36, mask);

      r = lerp(r, 191, heat * 0.62);
      gg = lerp(gg, 110, heat * 0.62);
      b = lerp(b, 51, heat * 0.62);

      // Pitting and mineral speckles.
      if (g > 0.993) {
        r += 38;
        gg += 27;
        b += 12;
      } else if (g < 0.022) {
        r -= 38;
        gg -= 29;
        b -= 19;
      }

      d[p] = r + (g - 0.5) * 21;
      d[p + 1] = gg + (g - 0.5) * 17;
      d[p + 2] = b + (g - 0.5) * 12;
    }
  }

  ctx.putImageData(image, 0, 0);

  // Broad dark oxide patches.
  for (let k = 0; k < 10; k++) {
    const x = rng() * size;
    const y = rng() * size;
    const radius = 22 + rng() * 80;
    wrapBlob(ctx, size, x, y, radius, radius * (0.45 + rng() * 0.6), [
      [0, 'rgba(48,26,16,0.30)'],
      [0.6, 'rgba(61,35,21,0.13)'],
      [1, 'rgba(61,35,21,0)']
    ], rng() * Math.PI);
  }

  // Orange rust blooms.
  for (let k = 0; k < 10; k++) {
    const x = rng() * size;
    const y = rng() * size;
    const radius = 12 + rng() * 50;
    wrapBlob(ctx, size, x, y, radius, radius * (0.5 + rng() * 0.6), [
      [0, 'rgba(196,112,50,0.20)'],
      [0.55, 'rgba(152,76,34,0.12)'],
      [1, 'rgba(152,76,34,0)']
    ], rng() * Math.PI);
  }

  // Smaller, hotter blooms break up the broad patches.
  for (let k = 0; k < 18; k++) {
    const x = rng() * size;
    const y = rng() * size;
    const radius = 3 + rng() * 17;
    wrapBlob(ctx, size, x, y, radius, radius * (0.45 + rng() * 0.65), [
      [0, 'rgba(205,122,55,0.26)'],
      [0.6, 'rgba(164,84,37,0.13)'],
      [1, 'rgba(164,84,37,0)']
    ], rng() * Math.PI);
  }

  // Old grey-green paint remnants.
  for (let k = 0; k < 7; k++) {
    const x = rng() * size;
    const y = rng() * size;
    const radius = 14 + rng() * 46;
    wrapBlob(ctx, size, x, y, radius, radius * (0.45 + rng() * 0.55), [
      [0, 'rgba(75,82,74,0.15)'],
      [1, 'rgba(75,82,74,0)']
    ], rng() * Math.PI);
  }

  // Vertical oxidation runs.
  for (let k = 0; k < 30; k++) {
    const x = rng() * size;
    const y = rng() * size;
    const len = 30 + rng() * 190;
    const points = [];
    for (let s = 0; s <= 6; s++) {
      const t = s / 6;
      points.push([x + Math.sin(t * 4 + k) * (1 + rng() * 3), y + t * len]);
    }
    const warm = rng() > 0.35;
    wrapStroke(
      ctx, size, points,
      warm ? `rgba(172,88,39,${0.10 + rng() * 0.15})` : `rgba(56,31,19,${0.10 + rng() * 0.13})`,
      1 + rng() * 5
    );
  }

  // Flaking paint / exposed plate.
  const detailBatch = ellipseBatch(ctx, size);
  for (let k = 0; k < 65; k++) {
    const x = rng() * size;
    const y = rng() * size;
    const rx = 1.5 + rng() * 7;
    const ry = rx * (0.35 + rng() * 0.55);
    const rotation = rng() * Math.PI;
    detailBatch.add(x, y, rx * 1.08, ry * 1.08, rotation, 'rgba(40,23,15,0.45)');
    detailBatch.add(x, y, rx, ry, rotation, rng() > 0.45 ? '#7c4a2b' : '#9a5b31');
    detailBatch.add(x - rx * 0.2, y - ry * 0.2, rx * 0.4, ry * 0.3, rotation, 'rgba(215,157,103,0.25)');
  }

  // Dark oxide veins running through the rust.
  for (let k = 0; k < 14; k++) {
    const x = rng() * size;
    const y = rng() * size;
    const angle = rng() * TAU;
    const points = crackPath(rng, x, y, angle, 14 + rng() * 85, 6 + ((rng() * 6) | 0), 0.45);
    wrapStroke(ctx, size, points, 'rgba(44,24,15,0.35)', 0.8 + rng() * 1.8);
    if (rng() > 0.4) {
      const shifted = points.map((p) => [p[0] + 0.8, p[1] - 0.6]);
      wrapStroke(ctx, size, shifted, 'rgba(190,108,52,0.18)', 1.0);
    }
  }

  // Scratches revealing bare metal.
  for (let k = 0; k < 40; k++) {
    const x = rng() * size;
    const y = rng() * size;
    const angle = rng() * TAU;
    const length = 8 + rng() * 70;
    const points = crackPath(rng, x, y, angle, length, 4 + ((rng() * 5) | 0), 0.3);
    wrapStroke(ctx, size, points, rng() > 0.5 ? 'rgba(198,183,164,0.35)' : 'rgba(45,29,20,0.45)', 0.5 + rng() * 0.9);
  }

  // Small corrosion bubbles.
  for (let k = 0; k < 180; k++) {
    const x = rng() * size;
    const y = rng() * size;
    const r = 0.4 + rng() * 1.8;
    detailBatch.add(x, y, r, r * (0.6 + rng() * 0.5), rng() * Math.PI, 'rgba(53,29,17,0.38)');
    detailBatch.add(x - r * 0.2, y - r * 0.2, r * 0.45, r * 0.35, 0, 'rgba(205,141,83,0.25)');
  }
  detailBatch.flush();

  return { color: color.canvas, height: null };
}

/* ------------------------------ crate ----------------------------- */

function buildCrate(size) {
  const seed = 0x4c7a11;
  const rng = mulberry32(seed);
  const color = makeSurface(size, '#4c5338');
  const height = makeHeightSurface(size, 0.5);
  const cctx = color.ctx;
  const hctx = height.ctx;

  const broad = fbmField(size, seed ^ 0x31dd77, 4, 4, 0.55);
  const grain = grainField(size, seed ^ 0x62ae99);

  const cimage = cctx.getImageData(0, 0, size, size);
  const himage = hctx.getImageData(0, 0, size, size);
  const cd = cimage.data;
  const hd = himage.data;

  const grainY = (TAU * 38) / size;
  const grainX = (TAU * 3) / size;

  for (let y = 0, i = 0, p = 0; y < size; y++) {
    for (let x = 0; x < size; x++, i++, p += 4) {
      const n = broad[i];
      const g = grain[i];
      const phase = y * grainY + (n - 0.5) * 8 + Math.sin(x * grainX) * 0.9;
      const wood = Math.sin(phase) * 0.65 + Math.sin(phase * 2) * 0.35;

      const shade = (n - 0.5) * 18 + wood * 4 + (g - 0.5) * 6;

      let r = 75 + shade;
      let gg = 82 + shade;
      let b = 55 + shade * 0.9;

      // Paint is slightly worn in patches, showing a hint of wood.
      if (g > 0.993) {
        r += 29;
        gg += 23;
        b += 13;
      } else if (g < 0.008) {
        r -= 22;
        gg -= 20;
        b -= 15;
      }

      cd[p] = r;
      cd[p + 1] = gg;
      cd[p + 2] = b;

      const hv = 0.5 + (n - 0.5) * 0.14 + wood * 0.03 + (g - 0.5) * 0.018;
      hd[p] = hv * 255;
      hd[p + 1] = hv * 255;
      hd[p + 2] = hv * 255;
    }
  }

  cctx.putImageData(cimage, 0, 0);
  hctx.putImageData(himage, 0, 0);

  // Plank seams.
  const seams = [size * 0.25, size * 0.5, size * 0.75];
  for (let s = 0; s < seams.length; s++) {
    const y = seams[s];
    cctx.fillStyle = 'rgba(23,26,16,0.72)';
    cctx.fillRect(0, y - 1.2, size, 2.4);
    cctx.fillStyle = 'rgba(139,145,104,0.24)';
    cctx.fillRect(0, y + 2, size, 1.4);
    cctx.fillStyle = 'rgba(16,18,11,0.22)';
    cctx.fillRect(0, y - 3.2, size, 1.2);

    hctx.fillStyle = gray(0.30);
    hctx.fillRect(0, y - 1.5, size, 3);
    hctx.fillStyle = gray(0.66);
    hctx.fillRect(0, y + 1.7, size, 1.5);
  }

  // Nails at the plank ends.
  for (let s = 0; s < seams.length; s++) {
    const y = seams[s];
    for (let x = 44; x < size; x += 118) {
      wrapEllipse(cctx, size, x, y + 7, 3.2, 3.2, 0, 'rgba(28,24,15,0.8)');
      wrapEllipse(cctx, size, x - 0.6, y + 6.4, 1.8, 1.8, 0, 'rgba(177,169,134,0.55)');
      wrapEllipse(hctx, size, x, y + 7, 2.8, 2.8, 0, gray(0.68));
    }
  }

  // Stencilled supply markings.
  cctx.save();
  cctx.translate(size * 0.5, size * 0.51);
  cctx.rotate(-0.035);
  cctx.textAlign = 'center';
  cctx.textBaseline = 'middle';
  cctx.fillStyle = 'rgba(207,200,164,0.76)';
  cctx.font = 'bold 72px "Courier New", monospace';
  cctx.fillText('AMMO', 0, -46);
  cctx.font = 'bold 57px "Courier New", monospace';
  cctx.fillText('5.56 MM', 0, 28);
  cctx.font = 'bold 30px "Courier New", monospace';
  cctx.fillText('LOT 07-24', 0, 88);
  cctx.restore();

  // Worn ink: chips through the lettering.
  const chipColor = ellipseBatch(cctx, size);
  const chipHeight = ellipseBatch(hctx, size);
  for (let k = 0; k < 95; k++) {
    const x = size * 0.5 + (rng() - 0.5) * 340;
    const y = size * 0.5 + (rng() - 0.5) * 250;
    const r = 0.5 + rng() * 2.8;
    chipColor.add(x, y, r, r * (0.4 + rng() * 0.6), rng() * Math.PI, 'rgba(77,84,57,0.85)');
  }

  // Chipped paint, mostly on plank seams and edges.
  for (let k = 0; k < 75; k++) {
    const nearSeam = rng() < 0.55;
    const seam = seams[(rng() * seams.length) | 0];
    const x = rng() * size;
    const y = nearSeam ? seam + (rng() - 0.5) * 13 : rng() * size;
    const rx = 0.8 + rng() * 4.5;
    const ry = rx * (0.35 + rng() * 0.6);
    const rotation = rng() * Math.PI;
    chipColor.add(x, y, rx * 1.12, ry * 1.12, rotation, 'rgba(32,30,18,0.5)');
    chipColor.add(x, y, rx, ry, rotation, rng() > 0.5 ? '#8a7a50' : '#9b8b5e');
    chipColor.add(x - rx * 0.15, y - ry * 0.15, rx * 0.42, ry * 0.35, rotation, 'rgba(214,198,151,0.24)');
  }
  chipColor.flush();
  chipHeight.flush();

  // Scuffs and scratches.
  for (let k = 0; k < 42; k++) {
    const x = rng() * size;
    const y = rng() * size;
    const angle = (rng() - 0.5) * 0.8;
    const length = 8 + rng() * 95;
    const points = crackPath(rng, x, y, angle, length, 4 + ((rng() * 5) | 0), 0.3);
    const light = rng() > 0.45;
    wrapStroke(cctx, size, points, light ? 'rgba(186,172,126,0.34)' : 'rgba(30,31,19,0.42)', 0.5 + rng() * 1.0);
    wrapStroke(hctx, size, points, gray(0.38), 0.7 + rng() * 0.7);
  }

  // Dirt and damp patches.
  for (let k = 0; k < 7; k++) {
    const x = rng() * size;
    const y = rng() * size;
    const radius = 20 + rng() * 65;
    wrapBlob(cctx, size, x, y, radius, radius * (0.4 + rng() * 0.6), [
      [0, 'rgba(25,26,16,0.20)'],
      [1, 'rgba(25,26,16,0)']
    ], rng() * Math.PI);
  }

  return { color: color.canvas, height: height.canvas };
}

/* --------------------------- container ---------------------------- */

function buildContainer(size) {
  const seed = 0x2e8877;
  const rng = mulberry32(seed);
  const color = makeSurface(size, '#3f6a66');
  const ctx = color.ctx;

  const broad = fbmField(size, seed ^ 0x166bb2, 4, 4, 0.55);
  const grain = grainField(size, seed ^ 0x55ee22);

  const image = ctx.getImageData(0, 0, size, size);
  const d = image.data;
  const ribPhase = (TAU * 16) / size;

  for (let y = 0, i = 0, p = 0; y < size; y++) {
    for (let x = 0; x < size; x++, i++, p += 4) {
      const n = broad[i];
      const g = grain[i];
      const phase = x * ribPhase;
      const wave = Math.cos(phase);
      const ridge = Math.pow(Math.max(0, wave), 7);

      let shade = (n - 0.5) * 15 + (g - 0.5) * 5 + wave * 13 + ridge * 11;
      if (wave < -0.72) shade -= 4;

      let r = 63 + shade * 0.92;
      let gg = 105 + shade;
      let b = 101 + shade * 0.96;

      // Faded, sun-bleached paint towards the top of a run.
      if (n > 0.58) {
        r += (n - 0.58) * 42;
        gg += (n - 0.58) * 34;
        b += (n - 0.58) * 28;
      }

      d[p] = r;
      d[p + 1] = gg;
      d[p + 2] = b;
    }
  }

  ctx.putImageData(image, 0, 0);

  // Sun-faded patches.
  for (let k = 0; k < 8; k++) {
    const x = rng() * size;
    const y = rng() * size;
    const radius = 25 + rng() * 90;
    wrapBlob(ctx, size, x, y, radius, radius * (0.4 + rng() * 0.7), [
      [0, 'rgba(152,188,174,0.10)'],
      [1, 'rgba(152,188,174,0)']
    ], rng() * Math.PI);
  }

  // Corrosion runs and brown staining.
  for (let k = 0; k < 34; k++) {
    const x = rng() * size;
    const y = rng() * size;
    const len = 35 + rng() * 200;
    const points = [];
    for (let s = 0; s <= 7; s++) {
      const t = s / 7;
      points.push([x + Math.sin(t * 4 + k) * (1 + rng() * 2.5), y + t * len]);
    }
    const brown = rng() > 0.3;
    wrapStroke(
      ctx, size, points,
      brown ? `rgba(120,59,31,${0.10 + rng() * 0.17})` : `rgba(27,54,50,${0.10 + rng() * 0.13})`,
      1 + rng() * 5.5
    );
  }

  // Rust blooms, biased towards the lower edge.
  for (let k = 0; k < 36; k++) {
    const x = rng() * size;
    const y = size * (0.12 + Math.pow(rng(), 0.5) * 0.94);
    const radius = 5 + rng() * 40;
    wrapBlob(ctx, size, x, y, radius, radius * (0.5 + rng() * 0.6), [
      [0, 'rgba(141,68,31,0.29)'],
      [0.55, 'rgba(94,48,27,0.14)'],
      [1, 'rgba(94,48,27,0)']
    ], rng() * Math.PI);
  }

  // Chipped paint / dents.
  for (let k = 0; k < 85; k++) {
    const x = rng() * size;
    const y = rng() * size;
    const rx = 0.8 + rng() * 4.2;
    const ry = rx * (0.35 + rng() * 0.6);
    const rotation = rng() * Math.PI;
    const rusty = rng() > 0.42;
    wrapEllipse(ctx, size, x, y, rx * 1.1, ry * 1.1, rotation, 'rgba(21,43,40,0.45)');
    wrapEllipse(ctx, size, x, y, rx, ry, rotation, rusty ? '#7d4a2a' : '#547d76');
    wrapEllipse(ctx, size, x - rx * 0.2, y - ry * 0.2, rx * 0.4, ry * 0.3, rotation, 'rgba(181,204,189,0.18)');
  }

  // A horizontal panel seam.
  const seamY = size * 0.54;
  ctx.fillStyle = 'rgba(19,40,37,0.55)';
  ctx.fillRect(0, seamY, size, 2);
  ctx.fillStyle = 'rgba(132,164,154,0.14)';
  ctx.fillRect(0, seamY + 2, size, 1);

  // Faded container code.
  ctx.save();
  ctx.translate(size * 0.12, size * 0.20);
  ctx.rotate(-0.012);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(211,213,190,0.56)';
  ctx.font = 'bold 30px "Courier New", monospace';
  ctx.fillText('TGHU 904 231 7', 0, 0);
  ctx.font = 'bold 18px "Courier New", monospace';
  ctx.fillText('22G1', 0, 31);
  ctx.restore();

  // Weather the decal and add general grime.
  for (let k = 0; k < 60; k++) {
    const x = size * 0.10 + rng() * 245;
    const y = size * 0.17 + rng() * 70;
    const r = 0.4 + rng() * 1.6;
    wrapEllipse(ctx, size, x, y, r, r * 0.7, rng() * Math.PI, 'rgba(50,91,84,0.72)');
  }

  for (let k = 0; k < 9; k++) {
    const x = rng() * size;
    const y = rng() * size;
    const radius = 20 + rng() * 80;
    wrapBlob(ctx, size, x, y, radius, radius * (0.4 + rng() * 0.6), [
      [0, 'rgba(17,35,32,0.18)'],
      [1, 'rgba(17,35,32,0)']
    ], rng() * Math.PI);
  }

  return { color: color.canvas, height: null };
}

/* ---------------------------- sandbag ----------------------------- */

function buildSandbag(size) {
  const seed = 0x6d3b92;
  const rng = mulberry32(seed);
  const color = makeSurface(size, '#a59064');
  const ctx = color.ctx;

  const broad = fbmField(size, seed ^ 0x1477aa, 4, 4, 0.55);
  const grain = grainField(size, seed ^ 0x5b9c21);

  const image = ctx.getImageData(0, 0, size, size);
  const d = image.data;

  for (let y = 0, i = 0, p = 0; y < size; y++) {
    for (let x = 0; x < size; x++, i++, p += 4) {
      const n = broad[i];
      const g = grain[i];

      // Gentle warp keeps the weave from looking machine-perfect.
      const wx = (n - 0.5) * 2.3;
      const wy = (n - 0.5) * 2.3;
      const ux = x + 1024 + wx;
      const uy = y + 1024 + wy;
      const u = ux * 0.125;
      const v = uy * 0.125;
      const iu = Math.floor(u);
      const iv = Math.floor(v);
      const fu = u - iu;
      const fv = v - iv;
      const iuw = iu & 63;
      const ivw = iv & 63;
      const hp = 1 - Math.abs(fv - 0.5) * 2;
      const vp = 1 - Math.abs(fu - 0.5) * 2;

      const cell = (iuw + ivw) & 1;
      const top = cell ? vp : hp;
      const under = cell ? hp : vp;
      const tint = (cell ? hash2(ivw, 17, seed) : hash2(iuw, 51, seed)) - 0.5;

      let shade = 0.845 + top * 0.19 + under * 0.028 + tint * 0.10;
      shade += (n - 0.5) * 0.10 + (g - 0.5) * 0.045;

      const r = 170 * shade;
      const gg = 149 * shade;
      const b = 104 * shade;

      d[p] = r;
      d[p + 1] = gg;
      d[p + 2] = b;
    }
  }

  ctx.putImageData(image, 0, 0);

  // Soft folds so the burlap does not read as a flat mat.
  for (let k = 0; k < 5; k++) {
    const x = rng() * size;
    const y = rng() * size;
    const radius = 55 + rng() * 95;
    wrapBlob(ctx, size, x, y, radius, radius * (0.4 + rng() * 0.6), [
      [0, 'rgba(69,53,29,0.10)'],
      [1, 'rgba(69,53,29,0)']
    ], rng() * Math.PI);
  }

  for (let k = 0; k < 4; k++) {
    const x = rng() * size;
    const y = rng() * size;
    const radius = 55 + rng() * 100;
    wrapBlob(ctx, size, x, y, radius, radius * (0.4 + rng() * 0.6), [
      [0, 'rgba(235,219,174,0.07)'],
      [1, 'rgba(235,219,174,0)']
    ], rng() * Math.PI);
  }

  // Slubs: thicker clumps of fibre.
  for (let k = 0; k < 190; k++) {
    const x = rng() * size;
    const y = rng() * size;
    const horizontal = rng() > 0.48;
    const length = 5 + rng() * 26;
    const width = 1.3 + rng() * 3.0;
    const pts = horizontal
      ? [[x, y], [x + length, y + (rng() - 0.5) * 2.5]]
      : [[x, y], [x + (rng() - 0.5) * 2.5, y + length]];
    const light = rng() > 0.4;
    wrapStroke(ctx, size, pts, light ? 'rgba(208,191,145,0.26)' : 'rgba(70,59,38,0.24)', width);
  }

  // Loose, frayed fibres.
  for (let k = 0; k < 60; k++) {
    const x = rng() * size;
    const y = rng() * size;
    const angle = rng() * TAU;
    const points = crackPath(rng, x, y, angle, 6 + rng() * 28, 5, 0.75);
    wrapStroke(ctx, size, points, 'rgba(221,206,162,0.22)', 0.6 + rng() * 0.9);
  }

  // Dirt and damp stains.
  for (let k = 0; k < 8; k++) {
    const x = rng() * size;
    const y = rng() * size;
    const radius = 20 + rng() * 70;
    wrapBlob(ctx, size, x, y, radius, radius * (0.45 + rng() * 0.6), [
      [0, 'rgba(75,59,34,0.18)'],
      [0.6, 'rgba(90,73,44,0.09)'],
      [1, 'rgba(90,73,44,0)']
    ], rng() * Math.PI);
  }

  // A few dark specks of grit.
  for (let k = 0; k < 140; k++) {
    const x = rng() * size;
    const y = rng() * size;
    const r = 0.3 + rng() * 1.2;
    wrapEllipse(ctx, size, x, y, r, r * 0.8, 0, 'rgba(58,49,31,0.34)');
  }

  return { color: color.canvas, height: null };
}

/* ---------------------------- asphalt ----------------------------- */

function buildAsphalt(size) {
  const seed = 0x3c5d6e;
  const rng = mulberry32(seed);
  const color = makeSurface(size, '#414140');
  const ctx = color.ctx;

  const broad = fbmField(size, seed ^ 0x1b2c3d, 4, 4, 0.58);
  const grain = grainField(size, seed ^ 0x4e5f60);

  const image = ctx.getImageData(0, 0, size, size);
  const d = image.data;

  for (let y = 0, i = 0, p = 0; y < size; y++) {
    for (let x = 0; x < size; x++, i++, p += 4) {
      const n = broad[i];
      const g = grain[i];
      let shade = (n - 0.5) * 25 + (g - 0.5) * 14;

      if (g > 0.86) shade += 10 + (g - 0.86) * 90;
      else if (g < 0.09) shade -= 9 + (0.09 - g) * 70;

      let r = 65 + shade;
      let gg = 64 + shade;
      let b = 62 + shade * 0.95;

      // A little blue-grey in the binder.
      b += (n - 0.5) * 2.2;

      d[p] = r;
      d[p + 1] = gg;
      d[p + 2] = b;
    }
  }

  ctx.putImageData(image, 0, 0);

  // Exposed aggregate.
  const aggregate = ['#6d6c67', '#7b7972', '#565652', '#89857c', '#5e5e59', '#969188'];
  for (let k = 0; k < 450; k++) {
    const x = rng() * size;
    const y = rng() * size;
    const rx = 0.5 + rng() * 1.8;
    const ry = rx * (0.55 + rng() * 0.55);
    const rotation = rng() * Math.PI;
    wrapEllipse(ctx, size, x, y, rx, ry, rotation, aggregate[(rng() * aggregate.length) | 0]);
    if (rng() > 0.7) {
      wrapEllipse(ctx, size, x - rx * 0.2, y - ry * 0.2, rx * 0.45, ry * 0.35, rotation, 'rgba(198,196,186,0.20)');
    }
  }

  // Broad tar patches and oil stains.
  for (let k = 0; k < 4; k++) {
    const x = rng() * size;
    const y = rng() * size;
    const radius = 30 + rng() * 80;
    wrapBlob(ctx, size, x, y, radius, radius * (0.4 + rng() * 0.7), [
      [0, 'rgba(21,21,21,0.24)'],
      [0.6, 'rgba(24,24,24,0.11)'],
      [1, 'rgba(24,24,24,0)']
    ], rng() * Math.PI);
  }

  for (let k = 0; k < 3; k++) {
    const x = rng() * size;
    const y = rng() * size;
    const radius = 18 + rng() * 45;
    wrapBlob(ctx, size, x, y, radius, radius * 0.55, [
      [0, 'rgba(10,12,15,0.22)'],
      [1, 'rgba(10,12,15,0)']
    ], rng() * Math.PI);
  }

  // Cracks.
  for (let k = 0; k < 7; k++) {
    const x = rng() * size;
    const y = rng() * size;
    drawCrackCluster(ctx, null, size, rng, {
      x, y,
      angle: rng() * TAU,
      length: 40 + rng() * 150,
      segments: 10 + ((rng() * 14) | 0),
      width: 0.8 + rng() * 1.4,
      color: 'rgba(18,18,18,0.86)',
      bevel: rng() > 0.35
    });
  }

  // Small tar repair streaks.
  for (let k = 0; k < 9; k++) {
    const x = rng() * size;
    const y = rng() * size;
    const angle = rng() * TAU;
    const points = crackPath(rng, x, y, angle, 20 + rng() * 70, 6, 0.35);
    wrapStroke(ctx, size, points, 'rgba(25,25,24,0.36)', 2 + rng() * 5);
  }

  return { color: color.canvas, height: null };
}

/* ----------------------------- hazard ----------------------------- */

function buildHazard(size) {
  const seed = 0x7f4a20;
  const rng = mulberry32(seed);
  const color = makeSurface(size, '#d8b62b');
  const ctx = color.ctx;

  const broad = fbmField(size, seed ^ 0x192837, 4, 4, 0.55);
  const grain = grainField(size, seed ^ 0x564738);

  const image = ctx.getImageData(0, 0, size, size);
  const d = image.data;
  const period = 64;
  const yellow = [216, 181, 42];
  const black = [27, 27, 23];

  for (let y = 0, i = 0, p = 0; y < size; y++) {
    for (let x = 0; x < size; x++, i++, p += 4) {
      const n = broad[i];
      const g = grain[i];
      const wobble = (n - 0.5) * 3.2;
      let s = (x + y + wobble) % period;
      if (s < 0) s += period;

      const stripe = s < period * 0.5;
      const edge = Math.min(Math.abs(s - period * 0.5), Math.abs(s - period));
      const base = stripe ? black : yellow;
      const grime = (n - 0.5) * 13 + (g - 0.5) * 8;

      let r = base[0] + grime;
      let gg = base[1] + grime;
      let b = base[2] + grime * 0.9;

      // A worn, slightly lighter ridge along the paint edge.
      if (edge < 1.6) {
        r += 12;
        gg += 12;
        b += 10;
      }

      d[p] = r;
      d[p + 1] = gg;
      d[p + 2] = b;
    }
  }

  ctx.putImageData(image, 0, 0);

  // Chipped paint and scratches.
  for (let k = 0; k < 70; k++) {
    const x = rng() * size;
    const y = rng() * size;
    const rx = 0.5 + rng() * 3.4;
    const ry = rx * (0.3 + rng() * 0.7);
    const rotation = rng() * Math.PI;
    const dark = rng() > 0.5;
    wrapEllipse(ctx, size, x, y, rx, ry, rotation, dark ? 'rgba(24,24,20,0.65)' : 'rgba(189,158,44,0.55)');
  }

  for (let k = 0; k < 28; k++) {
    const x = rng() * size;
    const y = rng() * size;
    const angle = (rng() - 0.5) * 1.4;
    const points = crackPath(rng, x, y, angle, 5 + rng() * 36, 4, 0.25);
    wrapStroke(ctx, size, points, rng() > 0.5 ? 'rgba(34,33,27,0.34)' : 'rgba(235,211,126,0.25)', 0.45 + rng() * 0.8);
  }

  // A few spots of rust-coloured contamination.
  for (let k = 0; k < 5; k++) {
    const x = rng() * size;
    const y = rng() * size;
    const radius = 4 + rng() * 18;
    wrapBlob(ctx, size, x, y, radius, radius * (0.5 + rng() * 0.5), [
      [0, 'rgba(124,70,39,0.19)'],
      [1, 'rgba(124,70,39,0)']
    ], rng() * Math.PI);
  }

  return { color: color.canvas, height: null };
}

/* ----------------------------- export ----------------------------- */

export function createTextures(renderer, anisotropy = 8) {
  let maxAnisotropy = 1;
  try {
    if (renderer && renderer.capabilities) {
      maxAnisotropy = renderer.capabilities.getMaxAnisotropy
        ? renderer.capabilities.getMaxAnisotropy()
        : renderer.capabilities.maxAnisotropy || 1;
    }
  } catch {
    maxAnisotropy = 1;
  }
  const aniso = Math.max(1, Math.min(anisotropy, Math.max(1, maxAnisotropy)));

  const sand = buildSand(512);
  const concrete = buildConcrete(512, { seed: 0x1f6e2d, base: [146, 143, 134], wet: false });
  const concreteDark = buildConcrete(512, { seed: 0x4b8a19, base: [94, 98, 93], wet: true });
  const metal = buildMetal(512);
  const rust = buildRust(512);
  const crate = buildCrate(512);
  const container = buildContainer(512);
  const sandbag = buildSandbag(512);
  const asphalt = buildAsphalt(512);
  const hazard = buildHazard(256);

  function colorTexture(canvas, name) {
    const texture = new THREE.CanvasTexture(canvas);
    texture.name = name;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = aniso;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return texture;
  }

  return {
    sand: colorTexture(sand.color, 'sand'),
    concrete: colorTexture(concrete.color, 'concrete'),
    concreteDark: colorTexture(concreteDark.color, 'concrete-dark'),
    metal: colorTexture(metal.color, 'metal'),
    rust: colorTexture(rust.color, 'rust'),
    crate: colorTexture(crate.color, 'crate'),
    container: colorTexture(container.color, 'container'),
    sandbag: colorTexture(sandbag.color, 'sandbag'),
    asphalt: colorTexture(asphalt.color, 'asphalt'),
    hazard: colorTexture(hazard.color, 'hazard'),

    normalSand: normalTexture(sand.height, 512, 5.2, aniso),
    normalConcrete: normalTexture(concrete.height, 512, 2.9, aniso),
    normalMetal: normalTexture(metal.height, 512, 2.5, aniso),
    normalCrate: normalTexture(crate.height, 512, 3.2, aniso)
  };
}
