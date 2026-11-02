import * as THREE from "three";

function softDiscTexture() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.8)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function bulletHoleTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const g = c.getContext("2d");
  g.clearRect(0, 0, 128, 128);
  const grd = g.createRadialGradient(64, 64, 2, 64, 64, 60);
  grd.addColorStop(0, "rgba(6,5,4,0.98)");
  grd.addColorStop(0.18, "rgba(16,12,9,0.92)");
  grd.addColorStop(0.5, "rgba(40,30,21,0.42)");
  grd.addColorStop(1, "rgba(20,15,10,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = "rgba(20,14,9,0.45)";
  g.lineWidth = 1;
  for (let i = 0; i < 12; i++) {
    const a = Math.random() * Math.PI * 2;
    const r1 = 7 + Math.random() * 8;
    const r2 = 18 + Math.random() * 34;
    g.beginPath();
    g.moveTo(64 + Math.cos(a) * r1, 64 + Math.sin(a) * r1);
    g.lineTo(64 + Math.cos(a + (Math.random() - 0.5) * 0.2) * r2, 64 + Math.sin(a + (Math.random() - 0.5) * 0.2) * r2);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeParticleSystem(scene, capacity, additive) {
  const positions = new Float32Array(capacity * 3);
  const colors = new Float32Array(capacity * 3);
  const sizes = new Float32Array(capacity);
  const alphas = new Float32Array(capacity);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute("aAlpha", new THREE.BufferAttribute(alphas, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: softDiscTexture() } },
    vertexShader: /* glsl */ `
      attribute vec3 aColor;
      attribute float aSize;
      attribute float aAlpha;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vColor = aColor;
        vAlpha = aAlpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * (520.0 / max(-mv.z, 0.1));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec4 tex = texture2D(uMap, gl_PointCoord);
        if (tex.a * vAlpha < 0.01) discard;
        gl_FragColor = vec4(vColor, tex.a * vAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 20;
  scene.add(points);

  const particles = Array.from({ length: capacity }, () => ({
    active: false,
    x: 0, y: 0, z: 0,
    vx: 0, vy: 0, vz: 0,
    life: 0, maxLife: 1,
    size: 1, grow: 0,
    r: 1, g: 1, b: 1,
    alpha: 1,
    gravity: 0,
    drag: 0,
    fadeIn: 0,
  }));
  let cursor = 0;

  function spawn(opts) {
    let p = null;
    for (let i = 0; i < capacity; i++) {
      const idx = (cursor + i) % capacity;
      if (!particles[idx].active) {
        cursor = idx + 1;
        p = particles[idx];
        break;
      }
    }
    if (!p) {
      p = particles[cursor % capacity];
      cursor++;
    }
    p.active = true;
    p.x = opts.x; p.y = opts.y; p.z = opts.z;
    p.vx = opts.vx || 0; p.vy = opts.vy || 0; p.vz = opts.vz || 0;
    p.life = p.maxLife = opts.life || 1;
    p.size = opts.size || 0.1;
    p.grow = opts.grow || 0;
    p.r = opts.r ?? 1; p.g = opts.g ?? 0.8; p.b = opts.b ?? 0.4;
    p.alpha = opts.alpha ?? 1;
    p.gravity = opts.gravity || 0;
    p.drag = opts.drag || 0;
    p.fadeIn = opts.fadeIn || 0;
  }

  function update(dt) {
    let write = 0;
    for (let i = 0; i < capacity; i++) {
      const p = particles[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      const d = Math.pow(1 - p.drag, dt * 60);
      p.vx *= d; p.vy *= d; p.vz *= d;
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.size += p.grow * dt;
      const t = 1 - p.life / p.maxLife;
      let a = p.alpha * (1 - t);
      if (p.fadeIn > 0 && t < p.fadeIn) a *= t / p.fadeIn;
      const base = i * 3;
      positions[base] = p.x; positions[base + 1] = p.y; positions[base + 2] = p.z;
      colors[base] = p.r; colors[base + 1] = p.g; colors[base + 2] = p.b;
      sizes[i] = p.size;
      alphas[i] = a;
      write++;
    }
    for (let i = write; i < capacity; i++) {
      alphas[i] = 0;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aColor.needsUpdate = true;
    geo.attributes.aSize.needsUpdate = true;
    geo.attributes.aAlpha.needsUpdate = true;
  }

  return { spawn, update, points };
}

export class Effects {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.sparks = makeParticleSystem(scene, 620, true);
    this.smoke = makeParticleSystem(scene, 320, false);
    this.holeTex = bulletHoleTexture();
    this.holeMat = new THREE.MeshBasicMaterial({
      map: this.holeTex,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      opacity: 0.92,
    });
    this.decals = [];
    this.decalCursor = 0;
    const decalGeo = new THREE.PlaneGeometry(0.24, 0.24);
    for (let i = 0; i < 90; i++) {
      const m = new THREE.Mesh(decalGeo, this.holeMat);
      m.visible = false;
      m.renderOrder = 2;
      scene.add(m);
      this.decals.push(m);
    }

    this.tracers = [];
    this.tracerCursor = 0;
    for (let i = 0; i < 48; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
      const mat = new THREE.LineBasicMaterial({
        color: 0xffcf7a,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const line = new THREE.Line(geo, mat);
      line.frustumCulled = false;
      scene.add(line);
      this.tracers.push({ line, life: 0, maxLife: 0.09 });
    }

    this.flashes = [];
    for (let i = 0; i < 4; i++) {
      const light = new THREE.PointLight(0xffc070, 0, 18, 2);
      scene.add(light);
      this.flashes.push({ light, life: 0 });
    }
    this.flashCursor = 0;
    this.time = 0;
  }

  tracer(from, to, color = 0xffcf7a, width = 1) {
    const t = this.tracers[this.tracerCursor++ % this.tracers.length];
    const pos = t.line.geometry.attributes.position;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    t.line.material.color.setHex(color);
    t.line.material.opacity = 0.9;
    t.line.material.linewidth = width;
    t.life = t.maxLife = 0.075 + Math.random() * 0.035;
  }

  decal(point, normal) {
    const m = this.decals[this.decalCursor++ % this.decals.length];
    m.visible = true;
    m.position.copy(point).addScaledVector(normal, 0.006);
    const look = point.clone().add(normal);
    m.lookAt(look);
    m.rotation.z = Math.random() * Math.PI * 2;
    const s = 0.7 + Math.random() * 0.75;
    m.scale.set(s, s, s);
  }

  impact(point, normal, opts = {}) {
    const n = normal || new THREE.Vector3(0, 1, 0);
    this.decal(point, n);
    const color = opts.color || 0xffb45e;
    const count = opts.heavy ? 18 : 9;
    for (let i = 0; i < count; i++) {
      const speed = 1.2 + Math.random() * 5.2;
      const dir = n.clone().multiplyScalar(0.5).add(new THREE.Vector3(
        (Math.random() - 0.5) * 1.6,
        (Math.random() - 0.2) * 1.6,
        (Math.random() - 0.5) * 1.6,
      )).normalize();
      this.sparks.spawn({
        x: point.x, y: point.y, z: point.z,
        vx: dir.x * speed, vy: dir.y * speed, vz: dir.z * speed,
        life: 0.18 + Math.random() * 0.5,
        size: 0.035 + Math.random() * 0.055,
        r: 1, g: 0.55 + Math.random() * 0.3, b: 0.18,
        gravity: 8, drag: 0.04,
        alpha: 1,
      });
    }
    for (let i = 0; i < (opts.heavy ? 6 : 3); i++) {
      this.smoke.spawn({
        x: point.x + (Math.random() - 0.5) * 0.2,
        y: point.y + (Math.random() - 0.5) * 0.2,
        z: point.z + (Math.random() - 0.5) * 0.2,
        vx: n.x * 0.5 + (Math.random() - 0.5) * 0.5,
        vy: 0.25 + Math.random() * 0.5,
        vz: n.z * 0.5 + (Math.random() - 0.5) * 0.5,
        life: 0.7 + Math.random() * 0.8,
        size: 0.35 + Math.random() * 0.5,
        grow: 0.8,
        r: color === 0xff3d2c ? 0.55 : 0.62,
        g: 0.52, b: 0.42,
        alpha: 0.22, gravity: -0.1, drag: 0.06,
      });
    }
    if (opts.flash !== false) {
      const f = this.flashes[this.flashCursor++ % this.flashes.length];
      f.light.position.copy(point).addScaledVector(n, 0.16);
      f.light.color.setHex(color);
      f.light.intensity = opts.heavy ? 22 : 8;
      f.life = 0.08;
    }
  }

  blood(point, dir) {
    for (let i = 0; i < 15; i++) {
      const speed = 0.8 + Math.random() * 4.4;
      const v = dir.clone().multiplyScalar(0.75).add(new THREE.Vector3(
        (Math.random() - 0.5) * 1.8,
        (Math.random() - 0.2) * 1.7,
        (Math.random() - 0.5) * 1.8,
      )).normalize();
      this.sparks.spawn({
        x: point.x, y: point.y, z: point.z,
        vx: v.x * speed, vy: v.y * speed, vz: v.z * speed,
        life: 0.2 + Math.random() * 0.4,
        size: 0.045 + Math.random() * 0.08,
        r: 0.48, g: 0.03, b: 0.02,
        gravity: 10, drag: 0.02, alpha: 0.95,
      });
    }
    for (let i = 0; i < 3; i++) {
      this.smoke.spawn({
        x: point.x, y: point.y, z: point.z,
        vx: (Math.random() - 0.5) * 0.8,
        vy: (Math.random() - 0.2) * 0.8,
        vz: (Math.random() - 0.5) * 0.8,
        life: 0.4 + Math.random() * 0.5,
        size: 0.22 + Math.random() * 0.3,
        grow: 0.7,
        r: 0.24, g: 0.02, b: 0.02,
        alpha: 0.35, gravity: -0.2, drag: 0.1,
      });
    }
  }

  dust(point, amount = 5, scale = 1) {
    for (let i = 0; i < amount; i++) {
      this.smoke.spawn({
        x: point.x + (Math.random() - 0.5) * 0.6 * scale,
        y: point.y + Math.random() * 0.25 * scale,
        z: point.z + (Math.random() - 0.5) * 0.6 * scale,
        vx: (Math.random() - 0.5) * 1.5,
        vy: 0.4 + Math.random() * 1.1,
        vz: (Math.random() - 0.5) * 1.5,
        life: 0.5 + Math.random() * 0.7,
        size: (0.35 + Math.random() * 0.5) * scale,
        grow: 1.5,
        r: 0.64, g: 0.52, b: 0.38,
        alpha: 0.22, gravity: -0.3, drag: 0.05,
      });
    }
  }

  explosion(point, radius = 4) {
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = Math.random() * Math.PI * 0.5;
      const speed = 2 + Math.random() * 12;
      this.sparks.spawn({
        x: point.x, y: point.y + 0.2, z: point.z,
        vx: Math.cos(a) * Math.cos(up) * speed,
        vy: Math.sin(up) * speed + 2,
        vz: Math.sin(a) * Math.cos(up) * speed,
        life: 0.24 + Math.random() * 0.75,
        size: 0.06 + Math.random() * 0.14,
        r: 1, g: 0.45 + Math.random() * 0.4, b: 0.12,
        gravity: 10, drag: 0.02, alpha: 1,
      });
    }
    for (let i = 0; i < 28; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * radius;
      this.smoke.spawn({
        x: point.x + Math.cos(a) * r * 0.45,
        y: point.y + Math.random() * 1.2,
        z: point.z + Math.sin(a) * r * 0.45,
        vx: Math.cos(a) * (0.6 + Math.random() * 2),
        vy: 0.8 + Math.random() * 2.2,
        vz: Math.sin(a) * (0.6 + Math.random() * 2),
        life: 1.2 + Math.random() * 1.8,
        size: 0.8 + Math.random() * 1.4,
        grow: 2.2,
        r: 0.18, g: 0.15, b: 0.13,
        alpha: 0.42, gravity: -0.35, drag: 0.03,
      });
    }
    for (let i = 0; i < 12; i++) {
      this.smoke.spawn({
        x: point.x + (Math.random() - 0.5) * 2,
        y: point.y + 0.2,
        z: point.z + (Math.random() - 0.5) * 2,
        vx: (Math.random() - 0.5) * 7,
        vy: 1 + Math.random() * 4,
        vz: (Math.random() - 0.5) * 7,
        life: 0.4 + Math.random() * 0.7,
        size: 0.12 + Math.random() * 0.18,
        grow: 0.2,
        r: 0.34, g: 0.29, b: 0.22,
        alpha: 0.8, gravity: 12, drag: 0.01,
      });
    }
    const f = this.flashes[this.flashCursor++ % this.flashes.length];
    f.light.position.set(point.x, point.y + 0.6, point.z);
    f.light.color.setHex(0xff8a3a);
    f.light.intensity = 80;
    f.life = 0.3;
  }

  muzzle(point, dir) {
    for (let i = 0; i < 6; i++) {
      const v = dir.clone().multiplyScalar(1.5 + Math.random() * 3).add(new THREE.Vector3(
        (Math.random() - 0.5) * 1.2,
        (Math.random() - 0.5) * 1.2,
        (Math.random() - 0.5) * 1.2,
      ));
      this.sparks.spawn({
        x: point.x, y: point.y, z: point.z,
        vx: v.x, vy: v.y, vz: v.z,
        life: 0.06 + Math.random() * 0.09,
        size: 0.05 + Math.random() * 0.05,
        r: 1, g: 0.66, b: 0.24, alpha: 1, drag: 0.06,
      });
    }
    this.smoke.spawn({
      x: point.x, y: point.y, z: point.z,
      vx: dir.x * 0.5 + (Math.random() - 0.5) * 0.2,
      vy: 0.3 + Math.random() * 0.3,
      vz: dir.z * 0.5 + (Math.random() - 0.5) * 0.2,
      life: 0.5 + Math.random() * 0.5,
      size: 0.12 + Math.random() * 0.1,
      grow: 0.65,
      r: 0.58, g: 0.56, b: 0.5,
      alpha: 0.16, gravity: -0.12, drag: 0.05,
    });
  }

  shell(point, velocity) {
    this.sparks.spawn({
      x: point.x, y: point.y, z: point.z,
      vx: velocity.x, vy: velocity.y, vz: velocity.z,
      life: 0.6 + Math.random() * 0.3,
      size: 0.03,
      r: 0.85, g: 0.62, b: 0.24,
      gravity: 9, drag: 0.01, alpha: 0.9,
    });
  }

  update(dt) {
    this.time += dt;
    this.sparks.update(dt);
    this.smoke.update(dt);
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      t.line.material.opacity = Math.max(0, 0.9 * (t.life / t.maxLife));
    }
    for (const f of this.flashes) {
      if (f.life <= 0) continue;
      f.life -= dt;
      const k = Math.max(0, f.life / 0.1);
      f.light.intensity *= 0.76;
      if (f.life <= 0) f.light.intensity = 0;
    }
  }
}
