import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const RIFLE = 0;
const PISTOL = 1;

function flashTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const g = c.getContext("2d");
  g.clearRect(0, 0, 128, 128);
  const grad = g.createRadialGradient(64, 64, 2, 64, 64, 62);
  grad.addColorStop(0, "rgba(255,255,240,1)");
  grad.addColorStop(0.15, "rgba(255,226,150,1)");
  grad.addColorStop(0.45, "rgba(255,160,50,0.8)");
  grad.addColorStop(1, "rgba(255,100,20,0)");
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(64, 2);
  g.lineTo(86, 40);
  g.lineTo(126, 64);
  g.lineTo(84, 78);
  g.lineTo(64, 126);
  g.lineTo(47, 82);
  g.lineTo(2, 64);
  g.lineTo(42, 44);
  g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildRifle() {
  const g = new THREE.Group();
  const gunmetal = new THREE.MeshStandardMaterial({ color: 0x333839, roughness: 0.34, metalness: 0.82 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x161a1b, roughness: 0.36, metalness: 0.8 });
  const polymer = new THREE.MeshStandardMaterial({ color: 0x252a25, roughness: 0.72, metalness: 0.12 });
  const tan = new THREE.MeshStandardMaterial({ color: 0x796a51, roughness: 0.62, metalness: 0.2 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xb18a4f, roughness: 0.4, metalness: 0.75 });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x0a1a1c,
    roughness: 0.06,
    metalness: 0.25,
    emissive: 0x1b4f4c,
    emissiveIntensity: 1.4,
  });
  const glove = new THREE.MeshStandardMaterial({ color: 0x35322a, roughness: 0.92, metalness: 0.02 });
  const sleeve = new THREE.MeshStandardMaterial({ color: 0x3a443d, roughness: 0.96, metalness: 0 });

  const part = (w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0, radius = 0.012) => {
    const geo = radius > 0 ? new RoundedBoxGeometry(w, h, d, 2, radius) : new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.frustumCulled = false;
    g.add(mesh);
    return mesh;
  };

  // receiver + handguard
  part(0.1, 0.115, 0.44, gunmetal, 0, 0, -0.02, 0, 0, 0, 0.018);
  part(0.085, 0.095, 0.36, polymer, 0, -0.002, -0.39, 0, 0, 0, 0.014);
  part(0.088, 0.02, 0.3, tan, 0, 0.077, -0.02, 0, 0, 0, 0.005);
  // barrel + brake
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.019, 0.46, 10), darkMetal);
  barrel.position.set(0, 0.018, -0.68);
  barrel.rotation.x = Math.PI / 2;
  barrel.frustumCulled = false;
  g.add(barrel);
  part(0.05, 0.05, 0.1, darkMetal, 0, 0.018, -0.93, 0, 0, 0, 0.008);
  for (let i = 0; i < 3; i++) part(0.066, 0.007, 0.018, gunmetal, 0, 0.018, -0.9 + i * 0.025, 0, 0, 0, 0.001);
  // stock
  part(0.07, 0.12, 0.22, polymer, 0, -0.008, 0.27, 0, 0, 0.03, 0.015);
  part(0.08, 0.16, 0.06, tan, 0, -0.02, 0.38, 0, 0, 0.02, 0.012);
  // grip + trigger
  part(0.055, 0.15, 0.07, polymer, 0, -0.12, 0.075, -0.28, 0, 0, 0.012);
  part(0.008, 0.055, 0.045, darkMetal, 0, -0.08, 0.02, 0, 0, 0, 0);
  // magazine
  const mag = part(0.068, 0.18, 0.105, darkMetal, 0, -0.14, -0.06, 0.18, 0, 0.03, 0.01);
  mag.name = "mag";
  for (let i = 0; i < 4; i++) part(0.07, 0.008, 0.09, gunmetal, 0, -0.14 - i * 0.045, -0.06 + i * 0.008, 0.18, 0, 0.03, 0.001);
  // trigger guard
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.006, 5, 10, Math.PI), darkMetal);
  guard.position.set(0, -0.09, 0.035);
  guard.rotation.set(Math.PI / 2, 0, Math.PI);
  g.add(guard);
  // top rail teeth
  for (let i = 0; i < 9; i++) part(0.055, 0.012, 0.018, darkMetal, 0, 0.089, 0.11 - i * 0.038, 0, 0, 0, 0.001);
  // red dot / optic
  part(0.072, 0.075, 0.13, darkMetal, 0, 0.135, -0.04, 0, 0, 0, 0.01);
  part(0.062, 0.062, 0.01, glass, 0, 0.14, -0.106, Math.PI / 2, 0, 0, 0.003);
  part(0.075, 0.02, 0.1, gunmetal, 0, 0.096, -0.04, 0, 0, 0, 0.004);
  part(0.018, 0.018, 0.018, new THREE.MeshBasicMaterial({ color: 0xff5a36 }), 0, 0.14, -0.114, 0, 0, 0, 0.002);
  // iron sight
  part(0.05, 0.05, 0.012, darkMetal, 0, 0.09, -0.56, 0, 0, 0, 0.002);
  part(0.008, 0.035, 0.012, accent, 0, 0.1, -0.565, 0, 0, 0, 0.001);
  // foregrip
  part(0.045, 0.1, 0.055, polymer, 0, -0.09, -0.39, -0.25, 0, 0, 0.01);
  // laser / flashlight
  part(0.045, 0.045, 0.15, darkMetal, 0.06, 0.007, -0.42, 0, 0, 0, 0.008);
  part(0.026, 0.026, 0.006, new THREE.MeshBasicMaterial({ color: 0x8ff8df }), 0.06, 0.007, -0.5, 0, 0, 0, 0.001);
  // sling
  const sling = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.006, 4, 18, Math.PI * 0.72), new THREE.MeshStandardMaterial({ color: 0x3c3528, roughness: 1 }));
  sling.position.set(0.02, -0.03, 0.05);
  sling.rotation.set(0.2, 0.5, 0.4);
  g.add(sling);
  // hands
  part(0.09, 0.08, 0.12, glove, 0.015, -0.14, 0.08, -0.2, 0.15, 0.15, 0.02);
  part(0.085, 0.07, 0.13, glove, -0.01, -0.11, -0.38, -0.16, -0.1, -0.12, 0.02);
  part(0.105, 0.11, 0.25, sleeve, 0.04, -0.2, 0.22, -0.35, 0.4, 0.1, 0.02);
  part(0.095, 0.1, 0.24, sleeve, -0.08, -0.18, -0.3, -0.45, -0.55, -0.2, 0.02);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.018, -1.0);
  g.add(muzzle);

  return { group: g, muzzle };
}

function buildPistol() {
  const g = new THREE.Group();
  const gunmetal = new THREE.MeshStandardMaterial({ color: 0x3a3e3f, roughness: 0.32, metalness: 0.84 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x141616, roughness: 0.38, metalness: 0.78 });
  const polymer = new THREE.MeshStandardMaterial({ color: 0x20231f, roughness: 0.76, metalness: 0.1 });
  const glove = new THREE.MeshStandardMaterial({ color: 0x35322a, roughness: 0.92 });
  const sight = new THREE.MeshBasicMaterial({ color: 0x8ff8df });

  const part = (w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0, radius = 0.008) => {
    const geo = radius > 0 ? new RoundedBoxGeometry(w, h, d, 2, radius) : new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.frustumCulled = false;
    g.add(mesh);
    return mesh;
  };

  part(0.065, 0.07, 0.28, gunmetal, 0, 0.03, -0.08, 0, 0, 0, 0.01);
  part(0.06, 0.045, 0.24, darkMetal, 0, -0.005, -0.09, 0, 0, 0, 0.007);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.12, 8), darkMetal);
  barrel.position.set(0, 0.028, -0.25);
  barrel.rotation.x = Math.PI / 2;
  g.add(barrel);
  part(0.058, 0.13, 0.07, polymer, 0, -0.08, 0.03, -0.2, 0, 0, 0.01);
  for (let i = 0; i < 5; i++) part(0.052, 0.008, 0.055, darkMetal, 0, -0.06 - i * 0.025, 0.035 + i * 0.004, -0.2, 0, 0, 0.001);
  part(0.055, 0.025, 0.08, darkMetal, 0, 0.076, -0.08, 0, 0, 0, 0.003);
  part(0.008, 0.02, 0.008, sight, 0, 0.095, -0.12, 0, 0, 0, 0.001);
  part(0.008, 0.02, 0.008, sight, 0, 0.095, -0.03, 0, 0, 0, 0.001);
  part(0.09, 0.075, 0.11, glove, 0.015, -0.12, 0.06, -0.18, 0.12, 0.12, 0.018);
  part(0.1, 0.1, 0.24, new THREE.MeshStandardMaterial({ color: 0x3a443d, roughness: 0.96 }), 0.035, -0.19, 0.2, -0.35, 0.4, 0.1, 0.02);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.028, -0.31);
  g.add(muzzle);
  return { group: g, muzzle };
}

const WEAPON_DEFS = [
  {
    name: "MK.7 CARBINE",
    mode: "AUTO",
    caliber: "5.56",
    magSize: 30,
    reserveMax: 210,
    damage: 28,
    headMultiplier: 2.5,
    fireInterval: 0.092,
    reloadTime: 1.85,
    spreadHip: 0.012,
    spreadAds: 0.0017,
    recoil: 0.016,
    auto: true,
    adsFov: 55,
    hipPos: new THREE.Vector3(0.29, -0.255, -0.52),
    adsPos: new THREE.Vector3(0.0, -0.152, -0.4),
    scale: 1,
  },
  {
    name: "SIDEARM 9",
    mode: "SEMI",
    caliber: "9MM",
    magSize: 12,
    reserveMax: 96,
    damage: 40,
    headMultiplier: 2.4,
    fireInterval: 0.17,
    reloadTime: 1.35,
    spreadHip: 0.014,
    spreadAds: 0.0022,
    recoil: 0.032,
    auto: false,
    adsFov: 60,
    hipPos: new THREE.Vector3(0.27, -0.25, -0.48),
    adsPos: new THREE.Vector3(0.0, -0.145, -0.38),
    scale: 1,
  },
];

export class WeaponSystem {
  constructor(camera, scene, fx, audio) {
    this.camera = camera;
    this.scene = scene;
    this.fx = fx;
    this.audio = audio;
    this.current = RIFLE;
    this.models = [buildRifle(), buildPistol()];
    for (const model of this.models) {
      model.group.visible = false;
      model.group.renderOrder = 30;
      camera.add(model.group);
    }
    this.models[RIFLE].group.visible = true;

    this.ammo = [
      { mag: 30, reserve: 180 },
      { mag: 12, reserve: 72 },
    ];
    this.cooldown = 0;
    this.reloading = false;
    this.reloadTimer = 0;
    this.reloadDuration = 1;
    this.ads = 0;
    this.adsTarget = 0;
    this.kick = 0;
    this.swayX = 0;
    this.swayY = 0;
    this.bobPhase = 0;
    this.wasTrigger = false;
    this.switchTimer = 0;
    this.fireLight = new THREE.PointLight(0xffb066, 0, 5, 2);
    this.fireLight.position.set(0.2, 0.1, -0.8);
    camera.add(this.fireLight);

    const tex = flashTexture();
    this.flashSprites = this.models.map((model, index) => {
      const mat = new THREE.SpriteMaterial({
        map: tex,
        color: 0xffd08a,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.setScalar(index === RIFLE ? 0.34 : 0.18);
      sprite.position.copy(model.muzzle.position);
      model.group.add(sprite);
      return sprite;
    });
    this.flashSprite = this.flashSprites[RIFLE];

    this.shotsFired = 0;
    this.shotsHit = 0;
    this.kills = 0;
    this.headshots = 0;
    this.onHit = null;
    this.onKill = null;
    this.onShot = null;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 180;
    this._dir = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._point = new THREE.Vector3();
    this._normal = new THREE.Vector3();
  }

  get def() {
    return WEAPON_DEFS[this.current];
  }

  get ammoState() {
    return this.ammo[this.current];
  }

  reset() {
    this.current = RIFLE;
    this.ammo = [
      { mag: 30, reserve: 180 },
      { mag: 12, reserve: 72 },
    ];
    this.reloading = false;
    this.reloadTimer = 0;
    this.cooldown = 0;
    this.ads = 0;
    this.adsTarget = 0;
    this.kick = 0;
    this.switchTimer = 0;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.kills = 0;
    this.headshots = 0;
    this.wasTrigger = false;
    this.models[RIFLE].group.visible = true;
    this.models[PISTOL].group.visible = false;
  }

  resupply() {
    this.ammo[RIFLE].reserve = WEAPON_DEFS[RIFLE].reserveMax;
    this.ammo[PISTOL].reserve = WEAPON_DEFS[PISTOL].reserveMax;
    this.ammo[RIFLE].mag = Math.max(this.ammo[RIFLE].mag, WEAPON_DEFS[RIFLE].magSize);
    this.ammo[PISTOL].mag = Math.max(this.ammo[PISTOL].mag, WEAPON_DEFS[PISTOL].magSize);
  }

  addAmmo(amount = 60) {
    this.ammo[RIFLE].reserve = Math.min(WEAPON_DEFS[RIFLE].reserveMax, this.ammo[RIFLE].reserve + amount);
    this.ammo[PISTOL].reserve = Math.min(WEAPON_DEFS[PISTOL].reserveMax, this.ammo[PISTOL].reserve + Math.round(amount * 0.4));
  }

  switchTo(index) {
    if (index === this.current || this.switchTimer > 0.15) return;
    if (index !== RIFLE && index !== PISTOL) return;
    this.reloading = false;
    this.reloadTimer = 0;
    this.models[this.current].group.visible = false;
    this.current = index;
    this.models[index].group.visible = true;
    this.switchTimer = 0.45;
    this.audio.uiClick();
  }

  toggleWeapon() {
    this.switchTo(this.current === RIFLE ? PISTOL : RIFLE);
  }

  startReload() {
    const a = this.ammoState;
    if (this.reloading || a.mag >= this.def.magSize || a.reserve <= 0) return;
    this.reloading = true;
    this.reloadDuration = this.def.reloadTime;
    this.reloadTimer = this.reloadDuration;
    this.audio.reload("out");
    if (this.onReloadStart) this.onReloadStart();
  }

  setAds(value) {
    this.adsTarget = value ? 1 : 0;
  }

  addLookSway(dx, dy) {
    this.swayX += dx * 0.00055;
    this.swayY += dy * 0.00055;
    this.swayX = THREE.MathUtils.clamp(this.swayX, -0.035, 0.035);
    this.swayY = THREE.MathUtils.clamp(this.swayY, -0.03, 0.03);
  }

  getSpread() {
    const d = this.def;
    const moving = this.moving ? 1 : 0;
    const base = THREE.MathUtils.lerp(d.spreadHip, d.spreadAds, this.ads);
    return base + moving * 0.006 * (1 - this.ads * 0.65);
  }

  shoot(targets, world, enemies, player, callbacks) {
    const a = this.ammoState;
    if (this.reloading || this.cooldown > 0 || this.switchTimer > 0.15) return false;
    if (a.mag <= 0) {
      this.audio.uiClick();
      this.startReload();
      return false;
    }
    a.mag--;
    this.shotsFired++;
    this.cooldown = this.def.fireInterval;
    this.kick = Math.min(1, this.kick + 0.55);
    const muzzleWorld = new THREE.Vector3();
    this.models[this.current].muzzle.getWorldPosition(muzzleWorld);
    this.flashSprite = this.flashSprites[this.current];
    this.flashSprite.material.opacity = 1;
    this.flashSprite.scale.setScalar((this.current === RIFLE ? 0.24 : 0.14) + Math.random() * (this.current === RIFLE ? 0.17 : 0.09));
    this.flashSprite.material.rotation = Math.random() * Math.PI;
    this.fireLight.position.copy(muzzleWorld);
    this.fireLight.intensity = 10;

    this.camera.getWorldDirection(this._dir);
    const spread = this.getSpread();
    const right = this._right.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const up = this._up.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
    const ang = Math.random() * Math.PI * 2;
    const rad = Math.sqrt(Math.random()) * spread;
    this._dir.addScaledVector(right, Math.cos(ang) * rad).addScaledVector(up, Math.sin(ang) * rad).normalize();

    const origin = new THREE.Vector3();
    this.camera.getWorldPosition(origin);
    this.raycaster.set(origin, this._dir);

    const list = world.raycastTargets.slice();
    const enemyMeshes = enemies.getHitMeshes();
    for (const m of enemyMeshes) list.push(m);
    const hits = this.raycaster.intersectObjects(list, false);
    let end = origin.clone().addScaledVector(this._dir, 150);
    let hitEnemy = null;
    let hitEnemyPart = "body";
    let hitPoint = null;
    let hitNormal = null;

    if (hits.length) {
      const hit = hits[0];
      end = hit.point.clone();
      hitPoint = hit.point.clone();
      hitNormal = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : hitNormal;
      if (hit.object.userData.enemy) {
        hitEnemy = hit.object.userData.enemy;
        hitEnemyPart = hit.object.userData.part || "body";
      }
    }

    if (hitEnemy) {
      const headshot = hitEnemyPart === "head";
      const damage = this.def.damage * (headshot ? this.def.headMultiplier : 1);
      const result = enemies.damage(hitEnemy, damage, hitEnemyPart, hitPoint, this._dir);
      this.shotsHit++;
      if (result.killed) {
        this.kills++;
        if (headshot) this.headshots++;
        this.onKill?.(result, headshot);
      }
      this.onHit?.(result, headshot);
    } else if (hitPoint && hitNormal) {
      this.fx.impact(hitPoint, hitNormal, { color: hitNormal.y > 0.7 ? 0xffc87a : 0xffa352 });
    }

    if (hitPoint && hitEnemy) {
      this.fx.blood(hitPoint, this._dir);
    }
    this.fx.tracer(muzzleWorld, end, hitEnemy ? 0xffd49a : 0xffbb66);
    this.fx.muzzle(muzzleWorld, this._dir);
    this.fx.shell(
      new THREE.Vector3(0.34, -0.12, -0.2).applyQuaternion(this.camera.quaternion).add(origin),
      new THREE.Vector3(1.1 + Math.random() * 1.2, 1.6 + Math.random(), 0.5).applyQuaternion(this.camera.quaternion),
    );
    this.audio.shoot(this.current === RIFLE ? "rifle" : "pistol");
    player.addRecoil(this.def.recoil * (this.ads > 0.5 ? 0.7 : 1), (Math.random() - 0.5) * this.def.recoil * 0.75);
    this.onShot?.(this.current === RIFLE ? "rifle" : "pistol");
    return true;
  }

  update(dt, player, input, world, enemies) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.switchTimer = Math.max(0, this.switchTimer - dt);
    this.moving = player.isMoving;
    this.adsTarget = input.ads ? 1 : 0;
    this.ads = THREE.MathUtils.damp(this.ads, this.adsTarget, 11, dt);
    this.kick = THREE.MathUtils.damp(this.kick, 0, 13, dt);
    this.swayX = THREE.MathUtils.damp(this.swayX, 0, 6, dt);
    this.swayY = THREE.MathUtils.damp(this.swayY, 0, 6, dt);

    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= this.reloadDuration * 0.42 && !this.reloadInserted) {
        this.reloadInserted = true;
        this.audio.reload("in");
        const a = this.ammoState;
        const need = this.def.magSize - a.mag;
        const take = Math.min(need, a.reserve);
        a.mag += take;
        a.reserve -= take;
        this.audio.reload("bolt");
      }
      if (this.reloadTimer <= 0) {
        this.reloading = false;
        this.reloadInserted = false;
        this.reloadTimer = 0;
      }
    }

    for (const sprite of this.flashSprites) {
      if (sprite.material.opacity > 0) sprite.material.opacity = Math.max(0, sprite.material.opacity - dt * 22);
    }
    this.fireLight.intensity = Math.max(0, this.fireLight.intensity - dt * 130);

    const firing = input.firing && !input.paused;
    const justPressed = firing && !this.wasTrigger;
    this.wasTrigger = firing;
    if (firing && (this.def.auto || justPressed) && this.cooldown <= 0) {
      this.shoot(null, world, enemies, player);
    }
    if (this.ammoState.mag === 0 && !this.reloading && firing) this.startReload();

    this.bobPhase += dt * (player.isSprinting ? 11 : 7.4) * (player.isMoving ? 1 : 0.2);
    const model = this.models[this.current];
    const def = this.def;
    const hip = def.hipPos;
    const ads = def.adsPos;
    const targetX = THREE.MathUtils.lerp(hip.x, ads.x, this.ads);
    const targetY = THREE.MathUtils.lerp(hip.y, ads.y, this.ads);
    const targetZ = THREE.MathUtils.lerp(hip.z, ads.z, this.ads);
    const bobAmp = (player.isMoving ? (player.isSprinting ? 1.35 : 0.7) : 0.16) * (1 - this.ads * 0.82);
    const bobX = Math.sin(this.bobPhase) * 0.012 * bobAmp;
    const bobY = Math.abs(Math.cos(this.bobPhase)) * 0.011 * bobAmp;
    const reloadT = this.reloading ? 1 - this.reloadTimer / this.reloadDuration : 0;
    const reloadDip = this.reloading ? Math.sin(reloadT * Math.PI) : 0;

    model.group.position.set(
      targetX + bobX + this.swayX * (1 - this.ads * 0.7),
      targetY - bobY - reloadDip * 0.13 - this.switchTimer * 0.18,
      targetZ + this.kick * 0.055,
    );
    model.group.rotation.set(
      -this.kick * 0.11 + reloadDip * 0.16 + this.swayY,
      -this.swayX * 0.9 + Math.sin(this.bobPhase * 0.5) * 0.008,
      reloadDip * 0.18 + this.swayX * 0.5,
    );
    const mag = model.group.getObjectByName("mag");
    if (mag) mag.position.y = -0.14 - (this.reloading ? Math.max(0, Math.sin(reloadT * Math.PI)) * 0.12 : 0);

  }

  get accuracy() {
    return this.shotsFired ? Math.round((this.shotsHit / this.shotsFired) * 100) : 0;
  }
}

export { RIFLE, PISTOL };
