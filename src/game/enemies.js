import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const TYPES = {
  grunt: {
    health: 100,
    speed: 2.25,
    damage: 8,
    range: 34,
    burst: 3,
    fireInterval: 0.19,
    cooldown: 1.35,
    accuracy: 0.42,
    scale: 1,
    uniform: 0x4b5141,
    vest: 0x34392f,
    helmet: 0x4d5248,
    visor: 0xff5a33,
    score: 100,
  },
  rusher: {
    health: 78,
    speed: 3.55,
    damage: 18,
    range: 11,
    burst: 1,
    fireInterval: 0.6,
    cooldown: 0.55,
    accuracy: 0.55,
    scale: 0.94,
    uniform: 0x4b3e34,
    vest: 0x2f2923,
    helmet: 0x3f3730,
    visor: 0xff3b2a,
    score: 140,
  },
  heavy: {
    health: 220,
    speed: 1.25,
    damage: 11,
    range: 29,
    burst: 6,
    fireInterval: 0.14,
    cooldown: 1.8,
    accuracy: 0.34,
    scale: 1.17,
    uniform: 0x363d3e,
    vest: 0x222728,
    helmet: 0x303638,
    visor: 0xff8b3d,
    score: 260,
  },
};

function rounded(w, h, d, r = 0.04) {
  return new RoundedBoxGeometry(w, h, d, 2, r);
}

function makeHealthTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 24;
  const ctx = c.getContext("2d");
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { c, ctx, tex };
}

function drawHealth(bar, ratio) {
  const { ctx } = bar;
  ctx.clearRect(0, 0, 128, 24);
  ctx.fillStyle = "rgba(5,7,7,0.82)";
  ctx.fillRect(0, 5, 128, 14);
  ctx.strokeStyle = "rgba(236,229,216,0.58)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(1, 6, 126, 12);
  const col = ratio > 0.55 ? "#7ce7d5" : ratio > 0.25 ? "#ffb03a" : "#ff4d3d";
  ctx.fillStyle = col;
  ctx.fillRect(4, 9, 120 * Math.max(0, ratio), 6);
  bar.tex.needsUpdate = true;
}

let nextId = 1;

export class EnemyManager {
  constructor(scene, world, fx, audio, camera) {
    this.scene = scene;
    this.world = world;
    this.fx = fx;
    this.audio = audio;
    this.camera = camera;
    this.enemies = [];
    this.hitMeshes = [];
    this.onKilled = null;
    this.onPlayerDamage = null;
    this.onEnemyShoot = null;
    this.difficulty = 1;
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._eye = new THREE.Vector3();
    this._playerEye = new THREE.Vector3();
    this._muzzle = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
  }

  clear() {
    for (const e of this.enemies) {
      this.scene.remove(e.group);
      e.group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
      });
      if (e.bar?.tex) e.bar.tex.dispose();
    }
    this.enemies.length = 0;
    this.hitMeshes.length = 0;
  }

  reset(difficulty = 1) {
    this.clear();
    this.difficulty = difficulty;
  }

  get aliveCount() {
    let n = 0;
    for (const e of this.enemies) if (!e.dead) n++;
    return n;
  }

  getHitMeshes() {
    this.hitMeshes.length = 0;
    for (const e of this.enemies) {
      if (e.dead) continue;
      for (const m of e.hitMeshes) this.hitMeshes.push(m);
    }
    return this.hitMeshes;
  }

  spawn(typeName, point, options = {}) {
    const type = TYPES[typeName] || TYPES.grunt;
    const group = new THREE.Group();
    const scale = type.scale;
    const mats = [];
    const mat = (opts) => {
      const m = new THREE.MeshStandardMaterial(opts);
      mats.push(m);
      return m;
    };
    const uniform = mat({ color: type.uniform, roughness: 0.9, metalness: 0.03 });
    const vest = mat({ color: type.vest, roughness: 0.72, metalness: 0.18 });
    const helmet = mat({ color: type.helmet, roughness: 0.62, metalness: 0.24 });
    const skin = mat({ color: 0x8b6a51, roughness: 0.94, metalness: 0 });
    const dark = mat({ color: 0x151817, roughness: 0.55, metalness: 0.35 });
    const accent = new THREE.MeshBasicMaterial({ color: type.visor });
    const glass = new THREE.MeshStandardMaterial({
      color: 0x1b2525,
      roughness: 0.15,
      metalness: 0.7,
      emissive: 0x33120d,
      emissiveIntensity: 1.2,
    });

    const hitMeshes = [];
    const addHit = (mesh, part) => {
      mesh.userData.enemy = null;
      mesh.userData.part = part;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      hitMeshes.push(mesh);
      return mesh;
    };

    // hips / torso
    const hips = new THREE.Mesh(rounded(0.46, 0.25, 0.3, 0.04), uniform);
    hips.position.y = 0.95;
    addHit(hips, "body");
    const torso = new THREE.Mesh(rounded(0.52, 0.62, 0.33, 0.06), uniform);
    torso.position.y = 1.35;
    addHit(torso, "body");
    const plate = new THREE.Mesh(rounded(0.48, 0.46, 0.2, 0.045), vest);
    plate.position.set(0, 1.37, -0.13);
    addHit(plate, "body");
    // chest pouches
    for (let i = 0; i < 3; i++) {
      const pouch = new THREE.Mesh(rounded(0.12, 0.12, 0.07, 0.01), dark);
      pouch.position.set(-0.15 + i * 0.15, 1.2, -0.25);
      group.add(pouch);
    }
    // shoulder pads
    for (const side of [-1, 1]) {
      const pad = new THREE.Mesh(rounded(0.18, 0.14, 0.26, 0.03), vest);
      pad.position.set(side * 0.32, 1.58, 0);
      addHit(pad, "body");
    }
    // neck + head
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.12, 8), skin);
    neck.position.y = 1.7;
    group.add(neck);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.175, 12, 10), skin);
    head.position.set(0, 1.83, 0);
    head.scale.set(0.92, 1.04, 0.94);
    addHit(head, "head");
    const helmetMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.58),
      helmet,
    );
    helmetMesh.position.set(0, 1.86, 0);
    helmetMesh.scale.set(1.02, 0.9, 1.05);
    addHit(helmetMesh, "head");
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.055, 0.04), accent);
    visor.position.set(0, 1.85, -0.17);
    group.add(visor);
    // helmet lamp
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.05), new THREE.MeshBasicMaterial({ color: 0xffe0a0 }));
    lamp.position.set(0.1, 1.94, -0.16);
    group.add(lamp);
    // backpack
    const pack = new THREE.Mesh(rounded(0.36, 0.46, 0.2, 0.03), dark);
    pack.position.set(0, 1.38, 0.24);
    addHit(pack, "body");
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 4), dark);
    antenna.position.set(0.14, 1.8, 0.3);
    group.add(antenna);
    // arms (pivot groups)
    const makeArm = (side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.33, 1.55, 0);
      const upper = new THREE.Mesh(rounded(0.15, 0.38, 0.16, 0.03), uniform);
      upper.position.y = -0.17;
      upper.castShadow = true;
      pivot.add(upper);
      const fore = new THREE.Mesh(rounded(0.13, 0.32, 0.14, 0.025), uniform);
      fore.position.set(0, -0.5, -0.04);
      fore.rotation.x = 0.18;
      fore.castShadow = true;
      pivot.add(fore);
      const hand = new THREE.Mesh(rounded(0.12, 0.12, 0.16, 0.025), dark);
      hand.position.set(0, -0.68, -0.08);
      pivot.add(hand);
      return pivot;
    };
    const leftArm = makeArm(-1);
    const rightArm = makeArm(1);
    group.add(leftArm, rightArm);
    // legs
    const makeLeg = (side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.13, 0.9, 0);
      const thigh = new THREE.Mesh(rounded(0.19, 0.4, 0.22, 0.035), uniform);
      thigh.position.y = -0.2;
      thigh.castShadow = true;
      pivot.add(thigh);
      const shin = new THREE.Mesh(rounded(0.16, 0.38, 0.18, 0.03), uniform);
      shin.position.set(0, -0.58, 0.015);
      shin.castShadow = true;
      pivot.add(shin);
      const boot = new THREE.Mesh(rounded(0.19, 0.13, 0.3, 0.03), dark);
      boot.position.set(0, -0.81, -0.05);
      pivot.add(boot);
      return pivot;
    };
    const leftLeg = makeLeg(-1);
    const rightLeg = makeLeg(1);
    group.add(leftLeg, rightLeg);
    // knee pads
    for (const side of [-1, 1]) {
      const knee = new THREE.Mesh(rounded(0.17, 0.16, 0.13, 0.02), vest);
      knee.position.set(side * 0.13, 0.52, -0.09);
      group.add(knee);
    }
    // rifle in hands
    const gun = new THREE.Group();
    gun.position.set(0.24, 1.3, -0.34);
    const gunBody = new THREE.Mesh(rounded(0.09, 0.11, 0.62, 0.015), dark);
    gunBody.castShadow = true;
    gun.add(gunBody);
    const gunBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.35, 6), dark);
    gunBarrel.position.set(0, 0.02, -0.44);
    gunBarrel.rotation.x = Math.PI / 2;
    gun.add(gunBarrel);
    const gunMag = new THREE.Mesh(rounded(0.06, 0.17, 0.09, 0.01), vest);
    gunMag.position.set(0, -0.12, -0.02);
    gunMag.rotation.x = 0.14;
    gun.add(gunMag);
    const gunStock = new THREE.Mesh(rounded(0.08, 0.12, 0.2, 0.02), uniform);
    gunStock.position.set(0, -0.01, 0.38);
    gun.add(gunStock);
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.02, -0.67);
    gun.add(muzzle);
    group.add(gun);

    // health bar
    const bar = makeHealthTexture();
    drawHealth(bar, 1);
    const barMat = new THREE.SpriteMaterial({ map: bar.tex, transparent: true, depthTest: false, depthWrite: false });
    const barSprite = new THREE.Sprite(barMat);
    barSprite.scale.set(0.92, 0.17, 1);
    barSprite.position.set(0, 2.2, 0);
    barSprite.visible = false;
    group.add(barSprite);

    // radio glow
    const radio = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), new THREE.MeshBasicMaterial({ color: type.visor }));
    radio.position.set(0.28, 1.44, 0.19);
    group.add(radio);

    group.position.copy(point);
    group.position.y = 0;
    group.scale.setScalar(scale);
    group.rotation.y = Math.random() * Math.PI * 2;
    this.scene.add(group);

    const health = Math.round(type.health * (1 + (this.difficulty - 1) * 0.14));
    const enemy = {
      id: nextId++,
      type: typeName,
      def: type,
      group,
      root: group,
      position: group.position,
      health,
      maxHealth: health,
      speed: type.speed * (1 + (this.difficulty - 1) * 0.035),
      damage: type.damage * (1 + (this.difficulty - 1) * 0.1),
      hitMeshes,
      bar,
      barSprite,
      mats,
      accent,
      head,
      torso,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      muzzle,
      gun,
      dead: false,
      deathTimer: 0,
      state: "spawn",
      attackTimer: 1 + Math.random() * 1.2,
      burstLeft: 0,
      burstTimer: 0,
      walkPhase: Math.random() * 6,
      flash: 0,
      losTimer: Math.random() * 0.12,
      hasLos: false,
      distance: 999,
      lastHitBy: null,
      spawnTimer: 0.7,
      barTimer: 0,
      scale,
      meleeTimer: 0,
    };
    for (const m of hitMeshes) m.userData.enemy = enemy;
    this.enemies.push(enemy);
    this.fx.dust(new THREE.Vector3(point.x, 0.1, point.z), 10, 1.4);
    return enemy;
  }

  damage(enemy, amount, part, point, dir) {
    if (!enemy || enemy.dead) return { killed: false, enemy, headshot: false };
    const headshot = part === "head";
    enemy.health -= amount;
    enemy.flash = 1;
    enemy.barSprite.visible = true;
    enemy.barTimer = 3;
    drawHealth(enemy.bar, Math.max(0, enemy.health / enemy.maxHealth));
    this.fx.blood(point, dir.clone().multiplyScalar(-1));
    if (enemy.health <= 0) {
      this.kill(enemy, headshot);
      return { killed: true, enemy, headshot, score: enemy.def.score * (headshot ? 1.5 : 1) };
    }
    return { killed: false, enemy, headshot, score: 0 };
  }

  kill(enemy, headshot) {
    if (enemy.dead) return;
    enemy.dead = true;
    enemy.deathTimer = 0;
    enemy.state = "dead";
    enemy.barSprite.visible = false;
    enemy.health = 0;
    const p = enemy.position;
    this.fx.blood(new THREE.Vector3(p.x, 1.3 * enemy.scale, p.z), new THREE.Vector3(0, 1, 0));
    this.fx.dust(new THREE.Vector3(p.x, 0.1, p.z), 7, 1);
    this.audio.kill();
    if (headshot) this.audio.headshot();
    this.onKilled?.(enemy, headshot);
  }

  update(dt, player, time) {
    const playerEye = this._playerEye.set(player.position.x, player.position.y + player.eyeHeight, player.position.z);
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.spawnTimer > 0) {
        e.spawnTimer -= dt;
      }
      if (e.dead) {
        e.deathTimer += dt;
        const t = Math.min(1, e.deathTimer / 0.6);
        e.group.rotation.x = -t * 1.48;
        e.group.position.y = -Math.max(0, e.deathTimer - 3.2) * 0.6;
        if (e.deathTimer > 6) {
          this.scene.remove(e.group);
          this.enemies.splice(i, 1);
        }
        continue;
      }

      if (e.flash > 0) {
        e.flash = Math.max(0, e.flash - dt * 9);
        for (const m of e.mats) {
          m.emissive.setRGB(e.flash * 0.85, e.flash * 0.08, 0);
          m.emissiveIntensity = e.flash * 2.2;
        }
      }
      if (e.barTimer > 0) {
        e.barTimer -= dt;
        if (e.barTimer <= 0) e.barSprite.visible = false;
      }

      const dx = player.position.x - e.position.x;
      const dz = player.position.z - e.position.z;
      const dist = Math.hypot(dx, dz);
      e.distance = dist;
      e.losTimer -= dt;
      if (e.losTimer <= 0) {
        e.losTimer = 0.12 + Math.random() * 0.08;
        this._eye.set(e.position.x, 1.58 * e.scale, e.position.z);
        e.hasLos = this.world.hasLineOfSight(this._eye, playerEye);
      }
      const canSee = e.hasLos && dist < e.def.range;
      const desiredYaw = Math.atan2(dx, dz) + Math.PI;
      e.group.rotation.y = dampAngle(e.group.rotation.y, desiredYaw, canSee ? 9 : 3, dt);
      e.group.position.y = 0;

      if (e.spawnTimer > 0) {
        e.group.position.y = -0.9 + (1 - e.spawnTimer / 0.7) * 0.9;
        continue;
      }

      // melee / close range
      if (dist < 2.0 && e.type === "rusher") {
        if (e.meleeTimer <= 0) {
          e.meleeTimer = 0.75;
          this.audio.shoot("enemy");
          this.fx.muzzle(e.muzzle.getWorldPosition(this._muzzle), this._v.set(dx, 0.2, dz).normalize());
          this.onPlayerDamage?.(e.damage * 1.4, e.position, "melee");
          this.onEnemyShoot?.(e);
        }
      }

      let moving = false;
      const attackRange = e.type === "rusher" ? 6.5 : e.def.range * 0.92;
      if (canSee && dist < attackRange) {
        moving = false;
        if (dist < 2.1 && e.type !== "rusher") {
          // back off slightly if player is on top of them
          const push = this.world.moveCircle(e.position.x, e.position.z, -dx / dist * dt * 1.1, -dz / dist * dt * 1.1, 0.38);
          e.position.x = push.x;
          e.position.z = push.z;
        }
        e.attackTimer -= dt;
        if (e.burstLeft > 0) {
          e.burstTimer -= dt;
          if (e.burstTimer <= 0) {
            this.fireAtPlayer(e, player, dist);
            e.burstLeft--;
            e.burstTimer = e.def.fireInterval * (0.85 + Math.random() * 0.3);
            if (e.burstLeft <= 0) e.attackTimer = e.def.cooldown * (0.75 + Math.random() * 0.5);
          }
        } else if (e.attackTimer <= 0) {
          e.burstLeft = e.def.burst;
          e.burstTimer = 0;
          e.attackTimer = e.def.cooldown;
        }
      } else {
        moving = true;
        let mx = dx / Math.max(dist, 0.001);
        let mz = dz / Math.max(dist, 0.001);
        // separation
        for (const other of this.enemies) {
          if (other === e || other.dead) continue;
          const sx = e.position.x - other.position.x;
          const sz = e.position.z - other.position.z;
          const sdist = Math.hypot(sx, sz);
          if (sdist > 0.001 && sdist < 1.2) {
            mx += (sx / sdist) * (1.2 - sdist) * 0.7;
            mz += (sz / sdist) * (1.2 - sdist) * 0.7;
          }
        }
        const len = Math.hypot(mx, mz) || 1;
        mx /= len;
        mz /= len;
        // simple obstacle whisker steering
        const candidates = [
          [mx, mz], [mx * 0.7 - mz * 0.7, mz * 0.7 + mx * 0.7],
          [mx * 0.7 + mz * 0.7, mz * 0.7 - mx * 0.7], [-mz, mx], [mz, -mx],
        ];
        let best = null;
        for (const [cx, cz] of candidates) {
          const nx = e.position.x + cx * 1.1;
          const nz = e.position.z + cz * 1.1;
          if (!this.world.collidesAt(nx, nz, 0.38)) { best = [cx, cz]; break; }
        }
        if (best) { mx = best[0]; mz = best[1]; }
        const step = e.speed * dt;
        const moved = this.world.moveCircle(e.position.x, e.position.z, mx * step, mz * step, 0.38);
        e.position.x = moved.x;
        e.position.z = moved.z;
        e.walkPhase += dt * e.speed * 3.5;
      }

      if (e.meleeTimer > 0) e.meleeTimer -= dt;
      const swing = moving ? Math.sin(e.walkPhase) : 0;
      e.leftLeg.rotation.x = swing * 0.55;
      e.rightLeg.rotation.x = -swing * 0.55;
      e.leftArm.rotation.x = -swing * 0.35 - 0.35;
      e.rightArm.rotation.x = -0.72 + Math.sin(time * 1.7 + e.id) * 0.02;
      e.leftArm.rotation.z = 0.12;
      e.rightArm.rotation.z = -0.2;
      e.group.position.y = moving ? Math.abs(Math.sin(e.walkPhase)) * 0.025 : 0;

      if (e.barSprite.visible) {
        e.barSprite.position.y = 2.18 + (moving ? Math.abs(Math.sin(e.walkPhase)) * 0.025 : 0);
      }
    }
  }

  fireAtPlayer(e, player, dist) {
    const muzzlePos = e.muzzle.getWorldPosition(new THREE.Vector3());
    const eye = player.position.clone();
    eye.y += player.eyeHeight - 0.12;
    // accuracy falls with distance and player movement
    let chance = 0.68 - dist * 0.0125 + (player.crouching ? -0.11 : 0) + (player.isMoving ? -0.09 : 0);
    if (e.type === "heavy") chance -= 0.08;
    chance = THREE.MathUtils.clamp(chance, 0.12, 0.58);
    const hit = Math.random() < chance;
    const target = eye.clone();
    if (!hit) {
      target.x += (Math.random() - 0.5) * 2.2;
      target.y += (Math.random() - 0.5) * 1.5;
      target.z += (Math.random() - 0.5) * 2.2;
    }
    this.fx.tracer(muzzlePos, target, e.type === "heavy" ? 0xff8a4a : 0xffb36b);
    this.fx.muzzle(muzzlePos, target.clone().sub(muzzlePos).normalize());
    this.audio.shoot(e.type === "heavy" ? "heavy" : "enemy");
    if (hit) {
      this.onPlayerDamage?.(e.damage, e.position, e.type);
    }
    this.onEnemyShoot?.(e);
  }

  applyExplosion(point, radius, damage) {
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = e.position.distanceTo(point);
      if (d < radius) {
        const falloff = 1 - d / radius;
        const hitPoint = new THREE.Vector3(e.position.x, 1.2, e.position.z);
        this.damage(e, damage * falloff, "body", hitPoint, point.clone().sub(hitPoint).normalize());
        e.group.position.addScaledVector(e.position.clone().sub(point).setY(0).normalize(), 0.3 * falloff);
      }
    }
  }
}

function dampAngle(current, target, lambda, dt) {
  let delta = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return current + delta * (1 - Math.exp(-lambda * dt));
}

export { TYPES };
