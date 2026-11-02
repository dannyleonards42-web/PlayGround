import * as THREE from "three";
import { createTextures } from "./textures.js";

const ARENA = { minX: -38, maxX: 38, minZ: -36, maxZ: 34 };
const UP = new THREE.Vector3(0, 1, 0);

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function copyTexture(source, repeatX, repeatY, color = true) {
  const t = source.clone();
  t.needsUpdate = true;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return t;
}

function segmentHitsBox(ax, ay, az, bx, by, bz, box, pad = 0) {
  let tmin = 0;
  let tmax = 1;
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const mins = [box.minX - pad, -0.1, box.minZ - pad];
  const maxs = [box.maxX + pad, box.top + pad, box.maxZ + pad];
  const starts = [ax, ay, az];
  const dirs = [dx, dy, dz];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(dirs[i]) < 1e-6) {
      if (starts[i] < mins[i] || starts[i] > maxs[i]) return false;
    } else {
      let t1 = (mins[i] - starts[i]) / dirs[i];
      let t2 = (maxs[i] - starts[i]) / dirs[i];
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return false;
    }
  }
  return true;
}

function makeSky(scene) {
  const sunDir = new THREE.Vector3(-0.58, 0.26, -0.77).normalize();
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uSun: { value: sunDir },
      uTime: { value: 0 },
      uHorizon: { value: new THREE.Color("#d18a56") },
      uZenith: { value: new THREE.Color("#172846") },
      uSunColor: { value: new THREE.Color("#ffd7a0") },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec3 vWorld;
      uniform vec3 uSun;
      uniform float uTime;
      uniform vec3 uHorizon;
      uniform vec3 uZenith;
      uniform vec3 uSunColor;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 5; i++) {
          v += a * noise(p);
          p = p * 2.03 + vec2(13.7, 9.2);
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec3 dir = normalize(vWorld - cameraPosition);
        float h = clamp(dir.y, -0.08, 1.0);
        vec3 col = mix(uHorizon, uZenith, smoothstep(0.0, 0.62, h));
        col = mix(col, vec3(0.36, 0.25, 0.22), smoothstep(0.03, -0.08, h) * 0.8);

        float sun = max(dot(dir, uSun), 0.0);
        col += uSunColor * pow(sun, 700.0) * 5.5;
        col += uSunColor * pow(sun, 9.0) * 0.36;
        col += vec3(0.9, 0.42, 0.18) * pow(sun, 2.5) * 0.18;

        vec2 cuv = dir.xz / max(dir.y + 0.22, 0.08);
        float clouds = fbm(cuv * 1.3 + vec2(uTime * 0.004, 0.0));
        clouds = smoothstep(0.53, 0.78, clouds) * smoothstep(0.0, 0.22, dir.y);
        vec3 cloudCol = mix(vec3(0.33, 0.2, 0.2), vec3(1.0, 0.67, 0.42), pow(sun, 1.8));
        col = mix(col, cloudCol, clouds * 0.68);

        float haze = smoothstep(0.12, 0.0, abs(dir.y));
        col = mix(col, vec3(0.79, 0.5, 0.32), haze * 0.28);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(240, 48, 24), material);
  sky.frustumCulled = false;
  sky.renderOrder = -100;
  scene.add(sky);
  return { sky, material, sunDir };
}

function addMountains(scene) {
  const rng = seeded(7331);
  const group = new THREE.Group();
  const mats = [
    new THREE.MeshStandardMaterial({ color: 0x2d2b2a, roughness: 1, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: 0x3a332d, roughness: 1, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: 0x242b30, roughness: 1, flatShading: true }),
  ];
  for (let i = 0; i < 34; i++) {
    const angle = (i / 34) * Math.PI * 2 + rng() * 0.14;
    const radius = 105 + rng() * 55;
    const height = 12 + rng() * 30;
    const width = 12 + rng() * 26;
    const geo = new THREE.ConeGeometry(width, height, 4 + Math.floor(rng() * 4), 1);
    const mesh = new THREE.Mesh(geo, mats[i % mats.length]);
    mesh.position.set(Math.cos(angle) * radius, height * 0.46 - 1.5, Math.sin(angle) * radius);
    mesh.rotation.y = rng() * Math.PI;
    mesh.rotation.z = (rng() - 0.5) * 0.12;
    group.add(mesh);
  }
  scene.add(group);
  return group;
}

function addDust(scene, count = 900) {
  const rng = seeded(991);
  const positions = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (rng() - 0.5) * 110;
    positions[i * 3 + 1] = rng() * 16;
    positions[i * 3 + 2] = (rng() - 0.5) * 105;
    speeds[i] = 0.18 + rng() * 0.4;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xe3ba8a,
    size: 0.055,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  return {
    points,
    update(dt, time) {
      const arr = geo.attributes.position.array;
      for (let i = 0; i < count; i++) {
        const j = i * 3;
        arr[j] += speeds[i] * dt * 1.6;
        arr[j + 1] += Math.sin(time * 0.4 + i) * dt * 0.06;
        arr[j + 2] += Math.cos(time * 0.3 + i * 1.7) * dt * 0.04;
        if (arr[j] > 55) arr[j] = -55;
        if (arr[j + 1] > 16) arr[j + 1] = 0.2;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}

function makeEmblemTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const g = c.getContext("2d");
  g.clearRect(0, 0, 512, 512);
  g.strokeStyle = "rgba(238,225,202,0.55)";
  g.lineWidth = 6;
  g.beginPath();
  g.arc(256, 256, 186, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  g.arc(256, 256, 158, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = "rgba(238,225,202,0.58)";
  g.font = "bold 178px monospace";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("07", 256, 242);
  g.font = "bold 30px monospace";
  g.fillText("BLACKSITE", 256, 352);
  g.beginPath();
  g.moveTo(70, 256);
  g.lineTo(442, 256);
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createWorld(scene, renderer, options = {}) {
  const quality = options.quality || "medium";
  const tex = createTextures(renderer, quality === "high" ? 8 : 4);
  const group = new THREE.Group();
  group.name = "BLACKSITE_07";
  scene.add(group);

  const colliders = [];
  const raycastTargets = [];
  const emissiveMats = [];
  const beacons = [];
  const lights = [];
  const rng = seeded(20261102);

  const mats = {
    sand: new THREE.MeshStandardMaterial({
      map: copyTexture(tex.sand, 28, 28),
      normalMap: copyTexture(tex.normalSand, 28, 28, false),
      normalScale: new THREE.Vector2(0.6, 0.6),
      roughness: 0.98,
      metalness: 0,
    }),
    concrete: new THREE.MeshStandardMaterial({
      map: copyTexture(tex.concrete, 3, 3),
      normalMap: copyTexture(tex.normalConcrete, 3, 3, false),
      normalScale: new THREE.Vector2(0.7, 0.7),
      roughness: 0.9,
      metalness: 0.02,
    }),
    concreteDark: new THREE.MeshStandardMaterial({
      map: copyTexture(tex.concreteDark, 3, 3),
      normalMap: copyTexture(tex.normalConcrete, 3, 3, false),
      roughness: 0.92,
      metalness: 0.03,
      color: 0xb8b0a8,
    }),
    metal: new THREE.MeshStandardMaterial({
      map: copyTexture(tex.metal, 1.5, 1.5),
      normalMap: copyTexture(tex.normalMetal, 1.5, 1.5, false),
      roughness: 0.42,
      metalness: 0.78,
      color: 0x9aa0a0,
    }),
    rust: new THREE.MeshStandardMaterial({
      map: copyTexture(tex.rust, 2, 2),
      roughness: 0.85,
      metalness: 0.3,
    }),
    crate: new THREE.MeshStandardMaterial({
      map: copyTexture(tex.crate, 1, 1),
      normalMap: copyTexture(tex.normalCrate, 1, 1, false),
      roughness: 0.84,
      metalness: 0.08,
    }),
    container: new THREE.MeshStandardMaterial({
      map: copyTexture(tex.container, 1.5, 1),
      roughness: 0.72,
      metalness: 0.36,
    }),
    sandbag: new THREE.MeshStandardMaterial({
      map: copyTexture(tex.sandbag, 2, 1),
      roughness: 1,
      metalness: 0,
      color: 0xb3a384,
    }),
    asphalt: new THREE.MeshStandardMaterial({
      map: copyTexture(tex.asphalt, 6, 6),
      roughness: 0.96,
      metalness: 0.02,
    }),
    hazard: new THREE.MeshStandardMaterial({
      map: copyTexture(tex.hazard, 2, 1),
      roughness: 0.8,
      metalness: 0.1,
    }),
    dark: new THREE.MeshStandardMaterial({ color: 0x201f1d, roughness: 0.64, metalness: 0.55 }),
    black: new THREE.MeshStandardMaterial({ color: 0x0e1010, roughness: 0.55, metalness: 0.4 }),
    glass: new THREE.MeshStandardMaterial({
      color: 0x173238,
      roughness: 0.18,
      metalness: 0.6,
      transparent: true,
      opacity: 0.82,
      emissive: 0x0c272b,
      emissiveIntensity: 1.4,
    }),
    window: new THREE.MeshBasicMaterial({ color: 0x86f4e6 }),
    warmWindow: new THREE.MeshBasicMaterial({ color: 0xffbd66 }),
    red: new THREE.MeshBasicMaterial({ color: 0xff3b2a }),
    teal: new THREE.MeshBasicMaterial({ color: 0x7ce7d5 }),
    rope: new THREE.MeshStandardMaterial({ color: 0x24211d, roughness: 1 }),
  };

  // ------------------------------------------------------------ sky & light
  const sky = makeSky(scene);
  const sun = new THREE.DirectionalLight(0xffb37d, 3.35);
  sun.position.set(-46, 42, -58);
  sun.castShadow = true;
  sun.shadow.mapSize.set(quality === "high" ? 2048 : 1024, quality === "high" ? 2048 : 1024);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 150;
  sun.shadow.camera.left = -58;
  sun.shadow.camera.right = 58;
  sun.shadow.camera.top = 58;
  sun.shadow.camera.bottom = -58;
  sun.shadow.bias = -0.00028;
  sun.shadow.normalBias = 0.035;
  scene.add(sun);
  scene.add(sun.target);

  const hemi = new THREE.HemisphereLight(0x9db9d2, 0x60432e, 0.72);
  scene.add(hemi);
  const fill = new THREE.DirectionalLight(0x6c94b8, 0.42);
  fill.position.set(35, 18, 30);
  scene.add(fill);
  const ambient = new THREE.AmbientLight(0x403729, 0.36);
  scene.add(ambient);

  scene.fog = new THREE.FogExp2(0xa5734f, 0.0082);
  scene.background = new THREE.Color("#b07d56");

  // ------------------------------------------------------------ helpers
  function register(mesh, solid = true, cast = true) {
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (solid) raycastTargets.push(mesh);
    return mesh;
  }

  function addCollider(minX, maxX, minZ, maxZ, top, sight = true) {
    const c = { minX, maxX, minZ, maxZ, top, blockSight: sight };
    colliders.push(c);
    return c;
  }

  function box(w, h, d, material, x, y, z, opts = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    if (opts.rotY) mesh.rotation.y = opts.rotY;
    if (opts.rotX) mesh.rotation.x = opts.rotX;
    if (opts.rotZ) mesh.rotation.z = opts.rotZ;
    register(mesh, opts.solid !== false, opts.cast !== false);
    if (opts.collider !== false) {
      const halfW = (Math.abs(Math.cos(opts.rotY || 0)) * w + Math.abs(Math.sin(opts.rotY || 0)) * d) / 2;
      const halfD = (Math.abs(Math.sin(opts.rotY || 0)) * w + Math.abs(Math.cos(opts.rotY || 0)) * d) / 2;
      addCollider(x - halfW, x + halfW, z - halfD, z + halfD, y + h / 2, opts.sight !== false);
    }
    return mesh;
  }

  function cyl(rt, rb, h, segments, material, x, y, z, opts = {}) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, segments), material);
    mesh.position.set(x, y, z);
    if (opts.rotX) mesh.rotation.x = opts.rotX;
    if (opts.rotY) mesh.rotation.y = opts.rotY;
    if (opts.rotZ) mesh.rotation.z = opts.rotZ;
    register(mesh, opts.solid !== false, opts.cast !== false);
    if (opts.collider) {
      const r = Math.max(rt, rb);
      addCollider(x - r, x + r, z - r, z + r, y + h / 2, true);
    }
    return mesh;
  }

  function plane(w, h, material, x, y, z, opts = {}) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    mesh.position.set(x, y, z);
    if (opts.rotX !== undefined) mesh.rotation.x = opts.rotX;
    if (opts.rotY) mesh.rotation.y = opts.rotY;
    if (opts.rotZ) mesh.rotation.z = opts.rotZ;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (opts.solid) raycastTargets.push(mesh);
    return mesh;
  }

  function glow(mat, intensity = 2) {
    const m = mat.clone();
    m.userData.base = intensity;
    emissiveMats.push(m);
    return m;
  }

  // ------------------------------------------------------------ ground
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(190, 190, 1, 1), mats.sand);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  const pad = plane(62, 58, mats.concreteDark, 0, 0.012, -1, { rotX: -Math.PI / 2 });
  pad.receiveShadow = true;
  const road = plane(14, 74, mats.asphalt, 0, 0.02, -6, { rotX: -Math.PI / 2 });
  road.receiveShadow = true;

  // helipad decal
  const padTex = makeEmblemTexture();
  const padMat = new THREE.MeshBasicMaterial({
    map: padTex,
    transparent: true,
    opacity: 0.58,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  plane(15, 15, padMat, -16, 0.035, 14, { rotX: -Math.PI / 2 });

  // hazard stripes around the relay
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    box(4.6, 0.035, 0.42, mats.hazard, Math.cos(angle) * 5.4, 0.04, -3 + Math.sin(angle) * 5.4, {
      rotY: -angle,
      collider: false,
      cast: false,
    });
  }

  // ------------------------------------------------------------ perimeter
  // broken blast walls: gaps become enemy lanes
  const wallSegments = [
    [-30, -34, 16], [14, -34, 22], [-33, 14, 10], [-33, 30, 8], [30, 30, 16], [26, -34, 8],
  ];
  for (const [x, z, w] of wallSegments) {
    box(w, 2.4, 0.85, mats.concrete, x, 1.2, z, { collider: true });
    // crenellation blocks
    for (let i = 0; i < Math.floor(w / 4); i++) {
      box(1.4, 0.55, 0.95, mats.concreteDark, x - w / 2 + 2 + i * 4, 2.67, z, {
        collider: false,
        cast: true,
      });
    }
  }
  // side walls
  box(0.85, 2.3, 15, mats.concrete, -33, 1.15, -1, { collider: true });
  box(0.85, 2.3, 14, mats.concrete, 33, 1.15, -2, { collider: true });

  // fence posts and wire silhouettes
  for (let i = 0; i < 16; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    cyl(0.08, 0.08, 3.2, 5, mats.dark, side * 37, 1.6, -30 + (i >> 1) * 8, { collider: false });
  }

  // ------------------------------------------------------------ command building
  const cmdX = 0;
  const cmdZ = -26;
  box(19, 7.2, 10, mats.concrete, cmdX, 3.6, cmdZ, { collider: true });
  box(20, 0.55, 11, mats.concreteDark, cmdX, 7.15, cmdZ, { collider: false });
  box(2.2, 3.1, 0.35, mats.dark, cmdX, 1.55, cmdZ + 5.02, { collider: false }); // door
  box(0.5, 4.4, 0.55, mats.metal, cmdX - 4.5, 2.2, cmdZ + 5.15, { collider: false });
  box(0.5, 4.4, 0.55, mats.metal, cmdX + 4.5, 2.2, cmdZ + 5.15, { collider: false });
  // window strips
  for (let i = 0; i < 5; i++) {
    const x = -7.5 + i * 3.75;
    plane(2.35, 0.72, mats.glass, x, 4.7, cmdZ + 5.03, { rotY: 0 });
    plane(2.35, 0.72, mats.glass, x, 2.1, cmdZ + 5.03, { rotY: 0 });
    if (i < 3) plane(1.1, 0.4, mats.window, x - 0.6, 5.55, cmdZ + 5.04, { rotY: 0 });
  }
  // rooftop details
  box(3.4, 1.1, 2.2, mats.metal, -5, 7.95, cmdZ - 1, { collider: false });
  box(2.8, 0.8, 1.8, mats.rust, 5, 7.8, cmdZ - 1.5, { collider: false });
  cyl(0.32, 0.5, 2.2, 10, mats.metal, 6.8, 8.5, cmdZ + 1.3, { collider: false });
  cyl(0.06, 0.06, 9, 6, mats.dark, -8, 11.2, cmdZ - 2.5, { collider: false });
  for (let i = 0; i < 3; i++) {
    box(1.5, 0.05, 0.05, mats.metal, -8, 14 + i * 1.2, cmdZ - 2.5, { collider: false, cast: false });
  }
  // roof beacon
  const cmdBeacon = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), mats.red);
  cmdBeacon.position.set(-8, 15.8, cmdZ - 2.5);
  group.add(cmdBeacon);
  beacons.push({ mesh: cmdBeacon, phase: 0.4, kind: "red" });
  // satellite dish
  const dish = new THREE.Mesh(
    new THREE.SphereGeometry(1.5, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.42),
    new THREE.MeshStandardMaterial({ color: 0xb9b7ad, roughness: 0.55, metalness: 0.45, side: THREE.DoubleSide }),
  );
  dish.position.set(6.8, 9.7, cmdZ + 1.3);
  dish.rotation.set(-0.7, 0.3, 0.2);
  group.add(dish);
  box(0.15, 1.2, 0.15, mats.metal, 6.8, 9, cmdZ + 1.3, { collider: false });
  // facade sign
  const signCanvas = document.createElement("canvas");
  signCanvas.width = 512;
  signCanvas.height = 128;
  const sg = signCanvas.getContext("2d");
  sg.fillStyle = "#14110d";
  sg.fillRect(0, 0, 512, 128);
  sg.strokeStyle = "#d9b27a";
  sg.lineWidth = 4;
  sg.strokeRect(10, 10, 492, 108);
  sg.fillStyle = "#e7d5b6";
  sg.font = "bold 56px monospace";
  sg.textAlign = "center";
  sg.textBaseline = "middle";
  sg.fillText("BLACKSITE 07", 256, 54);
  sg.fillStyle = "#d79846";
  sg.font = "22px monospace";
  sg.fillText("RESTRICTED // DUSTLINE", 256, 93);
  const signTex = new THREE.CanvasTexture(signCanvas);
  signTex.colorSpace = THREE.SRGBColorSpace;
  plane(7.2, 1.8, new THREE.MeshBasicMaterial({ map: signTex }), cmdX, 6.35, cmdZ + 5.08, { rotY: 0 });

  // ------------------------------------------------------------ east hangar
  const hangar = { x: 26, z: -5, w: 14, d: 18, h: 6 };
  // back + sides, open to west
  box(0.7, 6, 18, mats.container, hangar.x + 7, 3, hangar.z, { collider: true });
  box(14, 6, 0.7, mats.container, hangar.x, 3, hangar.z - 9, { collider: true });
  box(14, 6, 0.7, mats.container, hangar.x, 3, hangar.z + 9, { collider: true });
  box(15, 0.45, 19, mats.metal, hangar.x, 6.15, hangar.z, { collider: false });
  // roof trusses
  for (let i = 0; i < 5; i++) {
    box(14.5, 0.16, 0.16, mats.metal, hangar.x, 5.7, hangar.z - 7 + i * 3.5, { collider: false });
  }
  // interior light
  const hangarLight = new THREE.PointLight(0xffb066, 22, 20, 2);
  hangarLight.position.set(hangar.x, 4.6, hangar.z);
  scene.add(hangarLight);
  lights.push(hangarLight);
  const hangarLamp = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 0.35), mats.warmWindow);
  hangarLamp.position.set(hangar.x, 5.55, hangar.z);
  group.add(hangarLamp);
  // crates inside
  box(2.1, 2.1, 2.1, mats.crate, hangar.x + 4.6, 1.05, hangar.z - 6.3, { rotY: 0.14 });
  box(2.1, 2.1, 2.1, mats.crate, hangar.x + 2.4, 1.05, hangar.z - 6.0, { rotY: -0.1 });
  box(2.1, 2.1, 2.1, mats.crate, hangar.x + 3.5, 3.15, hangar.z - 6.2, { rotY: 0.05 });
  box(1.4, 1.4, 1.4, mats.crate, hangar.x + 5.1, 0.7, hangar.z + 5.8, { rotY: 0.4 });
  box(3.6, 0.9, 1.4, mats.metal, hangar.x + 3.5, 0.45, hangar.z + 2.4, { rotY: 0.02 });
  // hazard strip on floor
  plane(4, 12, mats.hazard, hangar.x - 3.5, 0.035, hangar.z, { rotX: -Math.PI / 2, rotZ: 0 });
  // hanging cables
  for (let i = 0; i < 4; i++) {
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 6, 4), mats.rope);
    cable.position.set(hangar.x - 5 + i * 3, 4.5, hangar.z - 8);
    cable.rotation.z = Math.PI / 2;
    group.add(cable);
  }

  // ------------------------------------------------------------ west barracks
  const bar = { x: -26, z: 0, w: 13, d: 13, h: 4.6 };
  box(13, 4.6, 0.65, mats.concrete, bar.x, 2.3, bar.z - 6.5, { collider: true });
  box(0.65, 4.6, 13, mats.concrete, bar.x - 6.5, 2.3, bar.z, { collider: true });
  box(13, 4.6, 0.65, mats.concrete, bar.x, 2.3, bar.z + 6.5, { collider: true });
  // front with doorway gap
  box(4.6, 4.6, 0.65, mats.concrete, bar.x - 4.2, 2.3, bar.z + 6.5 + 0.001, { collider: true });
  box(4.6, 4.6, 0.65, mats.concrete, bar.x + 4.2, 2.3, bar.z + 6.5 + 0.001, { collider: true });
  box(13, 0.4, 13, mats.concreteDark, bar.x, 4.65, bar.z, { collider: false });
  // windows
  for (let i = 0; i < 3; i++) {
    plane(1.6, 0.75, mats.glass, bar.x - 4.2 + i * 4.2, 3.1, bar.z + 6.83, { rotY: 0 });
  }
  // door frame
  box(0.3, 2.8, 0.3, mats.metal, bar.x - 1.65, 1.4, bar.z + 6.85, { collider: false });
  box(0.3, 2.8, 0.3, mats.metal, bar.x + 1.65, 1.4, bar.z + 6.85, { collider: false });
  const barLight = new THREE.PointLight(0xff9850, 15, 15, 2);
  barLight.position.set(bar.x, 3.3, bar.z + 1);
  scene.add(barLight);
  lights.push(barLight);
  const barLamp = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 0.3), mats.warmWindow);
  barLamp.position.set(bar.x, 3.8, bar.z + 1);
  group.add(barLamp);
  // sandbags at doorway
  sandbagWall(bar.x - 1.6, bar.z + 8.4, 2.8, 0.55, 0.6);
  sandbagWall(bar.x + 2.1, bar.z + 8.5, 1.8, 0.5, 0.4);

  // ------------------------------------------------------------ relay tower
  const relayX = 0;
  const relayZ = -3;
  cyl(4.4, 4.8, 0.55, 24, mats.concreteDark, relayX, 0.28, relayZ, { collider: false });
  cyl(0.55, 1.1, 13.5, 8, mats.metal, relayX, 7.2, relayZ, { collider: true });
  for (let i = 0; i < 4; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4 + i * 0.22, 0.055, 5, 16), mats.metal);
    ring.position.set(relayX, 2.4 + i * 3.1, relayZ);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
  }
  // cross arms
  box(7.2, 0.12, 0.12, mats.metal, relayX, 9.4, relayZ, { collider: false });
  box(0.12, 0.12, 5.2, mats.metal, relayX, 11.2, relayZ, { collider: false });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 12), mats.red);
  beacon.position.set(relayX, 14.2, relayZ);
  group.add(beacon);
  beacons.push({ mesh: beacon, phase: 0, kind: "red" });
  const relayLight = new THREE.PointLight(0xff2f1f, 9, 22, 2);
  relayLight.position.set(relayX, 14.2, relayZ);
  scene.add(relayLight);
  lights.push(relayLight);
  // ground cables
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 9, 4), mats.rope);
    cable.position.set(relayX + Math.cos(a) * 7, 0.06, relayZ + Math.sin(a) * 7);
    cable.rotation.z = Math.PI / 2;
    cable.rotation.y = -a;
    group.add(cable);
  }

  // ------------------------------------------------------------ watchtower
  const tw = { x: -15, z: 25 };
  for (const sx of [-2.1, 2.1]) {
    for (const sz of [-2.1, 2.1]) {
      box(0.28, 8.2, 0.28, mats.metal, tw.x + sx, 4.1, tw.z + sz, { collider: true, sight: false });
    }
  }
  for (let i = 0; i < 2; i++) {
    const y = 1.4 + i * 3.2;
    box(4.4, 0.12, 0.12, mats.metal, tw.x, y, tw.z - 2.1, { collider: false });
    box(4.4, 0.12, 0.12, mats.metal, tw.x, y, tw.z + 2.1, { collider: false });
  }
  box(5.2, 0.38, 5.2, mats.metal, tw.x, 8.25, tw.z, { collider: true });
  box(4.2, 2.5, 4.2, mats.rust, tw.x, 9.7, tw.z, { collider: true });
  box(4.9, 0.3, 4.9, mats.metal, tw.x, 11.1, tw.z, { collider: false });
  plane(2.6, 0.8, mats.glass, tw.x, 10.2, tw.z + 2.12, { rotY: 0 });
  const twLight = new THREE.PointLight(0xffd0a0, 12, 18, 2);
  twLight.position.set(tw.x, 11.6, tw.z);
  scene.add(twLight);
  lights.push(twLight);
  const twLamp = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 10), mats.warmWindow);
  twLamp.position.set(tw.x, 11.5, tw.z);
  group.add(twLamp);
  // ladder
  for (let i = 0; i < 12; i++) {
    box(1.2, 0.08, 0.08, mats.metal, tw.x + 2.65, 0.5 + i * 0.64, tw.z + 2.65, { collider: false });
  }
  box(0.08, 8, 0.08, mats.metal, tw.x + 2.05, 4, tw.z + 2.65, { collider: false });
  box(0.08, 8, 0.08, mats.metal, tw.x + 3.25, 4, tw.z + 2.65, { collider: false });

  // searchlight cone
  const coneMat = new THREE.MeshBasicMaterial({
    color: 0xffd9a0,
    transparent: true,
    opacity: 0.045,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(4.8, 19, 24, 1, true), coneMat);
  cone.position.set(tw.x + 1.2, 11.2, tw.z - 1);
  cone.rotation.z = 0.16;
  cone.rotation.x = 0.42;
  group.add(cone);

  // ------------------------------------------------------------ cover & props
  function jerseyBarrier(x, z, rotY = 0) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.42, 1.05), mats.concrete);
    base.position.y = 0.21;
    const top = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.72, 0.62), mats.concrete);
    top.position.y = 0.75;
    base.castShadow = top.castShadow = true;
    base.receiveShadow = top.receiveShadow = true;
    g.add(base, top);
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    group.add(g);
    raycastTargets.push(base, top);
    const halfW = (Math.abs(Math.cos(rotY)) * 3.6 + Math.abs(Math.sin(rotY)) * 1.05) / 2;
    const halfD = (Math.abs(Math.sin(rotY)) * 3.6 + Math.abs(Math.cos(rotY)) * 1.05) / 2;
    addCollider(x - halfW, x + halfW, z - halfD, z + halfD, 1.1, false);
  }

  function sandbagWall(x, z, width = 4, height = 0.9, rotY = 0) {
    const rows = Math.max(2, Math.round(height / 0.3));
    const perRow = Math.max(2, Math.round(width / 0.8));
    const g = new THREE.Group();
    for (let r = 0; r < rows; r++) {
      const n = perRow - (r % 2);
      for (let i = 0; i < n; i++) {
        const bag = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.38, 4, 6), mats.sandbag);
        bag.rotation.z = Math.PI / 2;
        bag.scale.set(1, 1, 0.82);
        bag.position.set((i - (n - 1) / 2) * 0.78, 0.2 + r * 0.27, ((r % 2) - 0.5) * 0.22);
        bag.castShadow = true;
        bag.receiveShadow = true;
        g.add(bag);
        raycastTargets.push(bag);
      }
    }
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    group.add(g);
    const halfW = (Math.abs(Math.cos(rotY)) * width + Math.abs(Math.sin(rotY)) * 0.9) / 2;
    const halfD = (Math.abs(Math.sin(rotY)) * width + Math.abs(Math.cos(rotY)) * 0.9) / 2;
    addCollider(x - halfW, x + halfW, z - halfD, z + halfD, height, false);
  }

  function barrel(x, z, color = 0x6d5b39) {
    const m = new THREE.MeshStandardMaterial({
      map: copyTexture(tex.rust, 2, 2),
      color,
      roughness: 0.72,
      metalness: 0.42,
    });
    cyl(0.42, 0.42, 1.15, 14, m, x, 0.575, z, { collider: true });
    cyl(0.46, 0.46, 0.06, 14, mats.dark, x, 1.16, z, { collider: false });
    cyl(0.46, 0.46, 0.06, 14, mats.dark, x, 0.04, z, { collider: false });
  }

  // central courtyard cover
  jerseyBarrier(-7.4, 6.2, 0.12);
  jerseyBarrier(7.2, 5.8, -0.15);
  jerseyBarrier(-12.4, 0.2, 1.57);
  jerseyBarrier(12.2, -0.4, 1.55);
  jerseyBarrier(-0.8, 13.6, 0.02);
  jerseyBarrier(5.8, 17.2, 0.2);
  jerseyBarrier(-9.4, -11.8, 0.05);
  jerseyBarrier(11.7, -13.6, 0.1);

  sandbagWall(-6.8, 21, 4.2, 1.0, 0.02);
  sandbagWall(7.4, 20.3, 3.6, 0.82, -0.05);
  sandbagWall(15.8, 12.8, 3.2, 0.9, 1.5);
  sandbagWall(-16.4, 8.7, 3.6, 0.9, 1.52);
  sandbagWall(-11.8, -17.4, 4.0, 0.85, 0.1);
  sandbagWall(6.2, -18.2, 4.4, 0.9, -0.1);

  barrel(-4.3, 8.3);
  barrel(-3.6, 9.1, 0x5d4937);
  barrel(9.6, 9.3, 0x4c5d4d);
  barrel(13.5, 3.4);
  barrel(-18.9, 12.5, 0x6a4b35);
  barrel(-6.8, -14.4, 0x4c5d4d);
  barrel(16.8, -10.9);

  // crate clusters
  const crateSpots = [
    [-22.5, 12.8, 2.2, 0.2], [-20.1, 13.1, 1.5, -0.4], [-19.9, 15.2, 1.8, 0.15],
    [18.6, 15.4, 2.2, 0.3], [16.8, 16.4, 1.4, -0.2], [21.2, 17.1, 2.2, 0.1],
    [-20.5, -14.8, 2.0, 0.4], [-18.1, -13.5, 1.6, -0.1], [18.4, -19.0, 2.1, 0.2],
    [10.8, 22.2, 1.8, 0.0], [-11.2, 15.4, 1.5, 0.3],
  ];
  for (const [x, z, size, rot] of crateSpots) {
    box(size, size, size, mats.crate, x, size / 2, z, { rotY: rot });
    if (size > 2) box(1.2, 1.2, 1.2, mats.crate, x + 0.1, size + 0.6, z, { rotY: rot + 0.2 });
  }

  // shipping containers
  function container(x, z, rotY = 0, colorTint = 0xffffff) {
    const mat = mats.container.clone();
    mat.color = new THREE.Color(colorTint);
    box(2.6, 2.7, 6.4, mat, x, 1.35, z, { rotY, collider: true });
    // ribs
    for (let i = 0; i < 8; i++) {
      const offset = -2.7 + i * 0.78;
      box(0.12, 2.55, 0.1, mats.metal, x + Math.cos(rotY) * offset, 1.35, z - Math.sin(rotY) * offset, {
        rotY,
        collider: false,
        cast: false,
      });
    }
  }
  container(23.2, 20.1, 0.1, 0x7c8f8a);
  container(-23.8, 20.4, -0.08, 0x8d7857);
  container(-25.3, -19.6, 0.02, 0x6f7e73);
  container(24.4, -20.9, 0.1, 0x7d6a4d);

  // generators / AC units / pipes near buildings
  box(2.4, 1.3, 1.5, mats.metal, -20.5, 0.65, -24.4);
  box(2.4, 1.3, 1.5, mats.metal, 20.6, 0.65, -25.5);
  box(0.5, 0.5, 7.2, mats.metal, 15.8, 0.25, 24.0, { collider: false });
  cyl(0.35, 0.35, 5.5, 8, mats.rust, 19.0, 2.75, 23.1, { collider: true });
  cyl(0.3, 0.3, 4.4, 8, mats.rust, -19.6, 2.2, 24.2, { collider: true });

  // ground rocks and debris
  for (let i = 0; i < 30; i++) {
    const x = (rng() - 0.5) * 76;
    const z = (rng() - 0.5) * 70;
    const s = 0.08 + rng() * 0.3;
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(s, 0),
      new THREE.MeshStandardMaterial({ color: 0x5d5041, roughness: 1, flatShading: true }),
    );
    rock.position.set(x, s * 0.35, z);
    rock.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    rock.castShadow = true;
    group.add(rock);
  }

  // scattered pallets
  for (const [x, z, r] of [[-13, 20, 0.4], [12, -22, 0.2], [21, 6, 1.1], [-19, -5, 0.9]]) {
    box(1.5, 0.1, 1.1, mats.rust, x, 0.06, z, { rotY: r, collider: false, cast: false });
    for (let i = 0; i < 3; i++) box(0.12, 0.12, 1.1, mats.rust, x - 0.55 + i * 0.55, 0.14, z, { rotY: r, collider: false });
  }

  // light poles
  for (const [x, z, angle] of [[-25, 19, 0.4], [25, -21, -2.5], [17, 24, 2.1], [-19, -22, 0.8]]) {
    cyl(0.1, 0.14, 7.5, 8, mats.dark, x, 3.75, z, { collider: true, sight: false });
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.22, 0.42), mats.metal);
    head.position.set(x + Math.cos(angle) * 0.55, 7.3, z + Math.sin(angle) * 0.55);
    head.rotation.y = angle;
    group.add(head);
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.24), mats.warmWindow);
    bulb.position.set(x + Math.cos(angle) * 0.55, 7.16, z + Math.sin(angle) * 0.55);
    bulb.rotation.y = angle;
    group.add(bulb);
    const pl = new THREE.PointLight(0xffb569, 13, 15, 2);
    pl.position.set(x + Math.cos(angle) * 0.8, 6.9, z + Math.sin(angle) * 0.8);
    scene.add(pl);
    lights.push(pl);
  }

  // scattered glow sticks around perimeter
  for (const [x, z, color] of [[-6, 22, 0xff7b3c], [9, 22, 0xff7b3c], [0, -20, 0x6fffe6], [-29, -8, 0xff7b3c]]) {
    const m = new THREE.MeshBasicMaterial({ color });
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 5), m);
    stick.position.set(x, 0.15, z);
    stick.rotation.z = Math.PI / 2;
    group.add(stick);
  }

  // ------------------------------------------------------------ skyline accents
  for (let i = 0; i < 8; i++) {
    const x = -46 + i * 13 + rng() * 4;
    const z = -58 - rng() * 18;
    const h = 3 + rng() * 9;
    box(2.2, h, 2.2, mats.concreteDark, x, h / 2, z, { collider: false, cast: false });
    if (rng() > 0.5) {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 5, 5), mats.red);
      dot.position.set(x, h + 0.15, z);
      group.add(dot);
      beacons.push({ mesh: dot, phase: rng() * 6, kind: "red" });
    }
  }

  const dust = addDust(scene, quality === "low" ? 450 : 1000);
  addMountains(scene);

  // ambient details animated
  let searchlightAngle = 0;

  const spawnPoints = [
    new THREE.Vector3(-31, 0, -29),
    new THREE.Vector3(31, 0, -29),
    new THREE.Vector3(-31, 0, 23),
    new THREE.Vector3(31, 0, 24),
    new THREE.Vector3(0, 0, 31),
    new THREE.Vector3(0, 0, -32),
    new THREE.Vector3(-34.5, 0, 4),
    new THREE.Vector3(34.5, 0, 3),
  ];

  const pickupSpots = [
    new THREE.Vector3(-6.3, 0, 17.8),
    new THREE.Vector3(7.8, 0, 15.2),
    new THREE.Vector3(-16.5, 0, 11.6),
    new THREE.Vector3(17.2, 0, 7.4),
    new THREE.Vector3(-8.4, 0, -10.6),
    new THREE.Vector3(9.6, 0, -12.2),
    new THREE.Vector3(22.4, 0, -1.8),
    new THREE.Vector3(-20.8, 0, 2.2),
  ];

  function collidesAt(x, z, radius) {
    if (x < ARENA.minX + radius || x > ARENA.maxX - radius || z < ARENA.minZ + radius || z > ARENA.maxZ - radius) {
      return true;
    }
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (x + radius > c.minX && x - radius < c.maxX && z + radius > c.minZ && z - radius < c.maxZ) {
        return true;
      }
    }
    return false;
  }

  function moveCircle(x, z, dx, dz, radius) {
    let nx = x;
    let nz = z;
    if (!collidesAt(x + dx, z, radius)) nx = x + dx;
    if (!collidesAt(nx, z + dz, radius)) nz = z + dz;
    return { x: nx, z: nz };
  }

  function segmentBlocked(a, b, pad = 0.04) {
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (!c.blockSight || c.top < 1.15) continue;
      if (segmentHitsBox(a.x, a.y, a.z, b.x, b.y, b.z, c, pad)) return true;
    }
    return false;
  }

  function hasLineOfSight(from, to) {
    return !segmentBlocked(from, to);
  }

  function update(dt, time) {
    dust.update(dt, time);
    sky.material.uniforms.uTime.value = time;
    searchlightAngle += dt * 0.28;
    cone.rotation.y = Math.sin(searchlightAngle) * 0.55;
    for (const b of beacons) {
      const t = (time * 1.8 + b.phase) % 1;
      b.mesh.scale.setScalar(0.7 + Math.sin(t * Math.PI) * 0.7);
    }
    for (let i = 0; i < lights.length; i++) {
      const l = lights[i];
      if (i === 1) l.intensity = 14 + Math.sin(time * 16.3) * 2.2 + Math.sin(time * 7.1) * 1.4;
      if (i === 0) l.intensity = 21 + Math.sin(time * 9.7) * 1.2;
    }
    // warm windows gently breathe
    for (const m of emissiveMats) {
      m.emissiveIntensity = m.userData.base * (0.92 + Math.sin(time * 2.3) * 0.08);
    }
  }

  return {
    group,
    colliders,
    raycastTargets,
    spawnPoints,
    pickupSpots,
    bounds: ARENA,
    sun,
    sky,
    collidesAt,
    moveCircle,
    segmentBlocked,
    hasLineOfSight,
    update,
    dome: cone,
  };
}
