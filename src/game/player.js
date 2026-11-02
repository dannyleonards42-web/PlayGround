import * as THREE from "three";

export class Player {
  constructor(camera, world, audio) {
    this.camera = camera;
    this.world = world;
    this.audio = audio;
    this.position = new THREE.Vector3(0, 0, 15);
    this.velocity = new THREE.Vector3();
    this.yaw = 0.02;
    this.pitch = -0.02;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.recoilVelPitch = 0;
    this.recoilVelYaw = 0;
    this.sensitivity = 1;
    this.invertY = false;
    this.eyeHeight = 1.68;
    this.standHeight = 1.68;
    this.crouchHeight = 1.05;
    this.radius = 0.42;
    this.health = 100;
    this.maxHealth = 100;
    this.armor = 60;
    this.maxArmor = 100;
    this.crouching = false;
    this.grounded = true;
    this.isMoving = false;
    this.isSprinting = false;
    this.bobPhase = 0;
    this.stepTimer = 0;
    this.landTimer = 0;
    this.lastDamageTime = -99;
    this.time = 0;
    this.shake = 0;
    this.shakeEnabled = true;
    this.damageFlash = 0;
    this.invuln = 0;
    this.fovBase = 78;
    this.fovCurrent = 78;
    this.ads = 0;
    this.adsFov = 58;
    this.stride = 0;
    this.tilt = 0;
    this.onDamage = null;
    this.onStep = null;
    this.onDeath = null;
    this.dead = false;
    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._lastDamageFrom = new THREE.Vector3();
  }

  reset() {
    this.position.set(0, 0, 15);
    this.velocity.set(0, 0, 0);
    this.yaw = 0.02;
    this.pitch = -0.02;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.recoilVelPitch = 0;
    this.recoilVelYaw = 0;
    this.health = 100;
    this.armor = 60;
    this.crouching = false;
    this.grounded = true;
    this.dead = false;
    this.isMoving = false;
    this.isSprinting = false;
    this.bobPhase = 0;
    this.stepTimer = 0;
    this.shake = 0;
    this.damageFlash = 0;
    this.invuln = 0;
    this.lastDamageTime = -99;
    this.time = 0;
    this.fovCurrent = this.fovBase;
    this.ads = 0;
    this.camera.fov = this.fovBase;
    this.camera.updateProjectionMatrix();
    this.applyCamera(0);
  }

  look(dx, dy) {
    const mult = 0.00215 * this.sensitivity;
    this.yaw -= dx * mult;
    this.pitch -= dy * mult * (this.invertY ? -1 : 1);
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.42, 1.42);
  }

  addRecoil(pitch, yaw) {
    this.recoilVelPitch += pitch * 12;
    this.recoilVelYaw += yaw * 12;
  }

  damage(amount, fromPosition, source = "bullet") {
    if (this.dead || this.invuln > 0) return false;
    this.invuln = 0.06;
    let remaining = amount;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, amount * 0.52);
      this.armor = Math.max(0, this.armor - absorbed);
      remaining -= absorbed;
    }
    this.health = Math.max(0, this.health - remaining);
    this.lastDamageTime = this.time;
    this.damageFlash = Math.min(1, this.damageFlash + 0.55 + amount * 0.012);
    this.shake = Math.min(1.2, this.shake + 0.2 + amount * 0.01);
    if (fromPosition) this._lastDamageFrom.copy(fromPosition);
    this.audio.hurt();
    this.onDamage?.(amount, fromPosition, source, this.health);
    if (this.health <= 0) {
      this.dead = true;
      this.audio.defeat();
      this.onDeath?.();
      return true;
    }
    return false;
  }

  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  addArmor(amount) {
    this.armor = Math.min(this.maxArmor, this.armor + amount);
  }

  setAds(amount, fov) {
    this.ads = amount;
    this.adsFov = fov;
  }

  update(dt, input, weapon) {
    this.time += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.damageFlash = Math.max(0, this.damageFlash - dt * 1.35);
    this.shake = Math.max(0, this.shake - dt * 3.2);
    this.landTimer = Math.max(0, this.landTimer - dt);

    // health regeneration after 4.4 seconds without damage
    if (!this.dead && this.time - this.lastDamageTime > 4.4 && this.health < this.maxHealth) {
      this.health = Math.min(this.maxHealth, this.health + dt * 18);
    }

    const crouchTarget = this.crouching ? this.crouchHeight : this.standHeight;
    this.eyeHeight = THREE.MathUtils.damp(this.eyeHeight, crouchTarget, 14, dt);

    const forwardInput = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
    const rightInput = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const wantsMove = forwardInput !== 0 || rightInput !== 0;
    this.isSprinting = input.sprint && forwardInput > 0 && !this.crouching && this.ads < 0.25 && !this.dead;
    const speed = this.dead ? 0 : this.crouching ? 3.0 : this.ads > 0.5 ? 3.2 : this.isSprinting ? 9.2 : 5.6;

    this._forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this._right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const desired = this._tmp.set(0, 0, 0)
      .addScaledVector(this._forward, forwardInput)
      .addScaledVector(this._right, rightInput);
    if (desired.lengthSq() > 1) desired.normalize();

    const accel = this.grounded ? 14 : 4;
    const targetVx = desired.x * speed;
    const targetVz = desired.z * speed;
    this.velocity.x = THREE.MathUtils.damp(this.velocity.x, targetVx, accel, dt);
    this.velocity.z = THREE.MathUtils.damp(this.velocity.z, targetVz, accel, dt);

    this.isMoving = wantsMove && !this.dead && Math.hypot(this.velocity.x, this.velocity.z) > 0.6;

    if (input.jump && this.grounded && !this.crouching && !this.dead) {
      this.velocity.y = 7.4;
      this.grounded = false;
      input.jump = false;
      this.audio.jump();
    }

    if (!this.grounded) {
      this.velocity.y -= 25 * dt;
    }
    const moved = this.world.moveCircle(
      this.position.x,
      this.position.z,
      this.velocity.x * dt,
      this.velocity.z * dt,
      this.radius,
    );
    this.position.x = moved.x;
    this.position.z = moved.z;
    this.position.y += this.velocity.y * dt;
    if (this.position.y <= 0) {
      if (!this.grounded && this.velocity.y < -4) {
        this.audio.land();
        this.landTimer = 0.25;
        this.shake = Math.min(1, this.shake + Math.min(0.35, -this.velocity.y * 0.03));
      }
      this.position.y = 0;
      this.velocity.y = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }

    if (this.isMoving && this.grounded) {
      this.bobPhase += dt * (this.isSprinting ? 12.5 : this.crouching ? 5.2 : 8.3);
      const interval = this.isSprinting ? 0.3 : this.crouching ? 0.62 : 0.42;
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        this.stepTimer = interval;
        this.audio.footstep(this.position.x > 18 || this.position.z < -20 ? "concrete" : "sand");
        this.onStep?.(this.isSprinting);
      }
    } else {
      this.bobPhase += dt * 1.4;
    }

    // recoil spring
    this.recoilVelPitch += (-this.recoilPitch * 120 - this.recoilVelPitch * 14) * dt;
    this.recoilVelYaw += (-this.recoilYaw * 120 - this.recoilVelYaw * 14) * dt;
    this.recoilPitch += this.recoilVelPitch * dt;
    this.recoilYaw += this.recoilVelYaw * dt;
    this.recoilPitch = THREE.MathUtils.clamp(this.recoilPitch, -0.12, 0.18);
    this.recoilYaw = THREE.MathUtils.clamp(this.recoilYaw, -0.08, 0.08);

    const moveAmount = Math.min(1, Math.hypot(this.velocity.x, this.velocity.z) / 5.6);
    const fovTarget = THREE.MathUtils.lerp(this.fovBase + (this.isSprinting ? 5 : 0), this.adsFov, this.ads);
    this.fovCurrent = THREE.MathUtils.damp(this.fovCurrent, fovTarget, 9, dt);
    this.camera.fov = this.fovCurrent;
    this.camera.updateProjectionMatrix();

    this.applyCamera(dt, moveAmount);
  }

  applyCamera(dt, moveAmount = 0) {
    const bob = this.isMoving && this.grounded
      ? Math.sin(this.bobPhase) * 0.032 * (this.isSprinting ? 1.35 : 1) * (1 - this.ads * 0.7)
      : Math.sin(this.bobPhase) * 0.004;
    const bobSide = this.isMoving && this.grounded
      ? Math.cos(this.bobPhase * 0.5) * 0.018 * (this.isSprinting ? 1.2 : 1) * (1 - this.ads * 0.7)
      : 0;
    const crouchDrop = 0;
    const shakeX = this.shakeEnabled ? (Math.random() - 0.5) * this.shake * 0.045 : 0;
    const shakeY = this.shakeEnabled ? (Math.random() - 0.5) * this.shake * 0.045 : 0;
    const side = (this.velocity.x * Math.cos(this.yaw) - this.velocity.z * Math.sin(this.yaw)) / 9.2;
    this.tilt = THREE.MathUtils.damp(this.tilt, -side * 0.026 + (this.crouching ? 0.012 : 0), 6, dt || 0.016);
    this.camera.position.set(
      this.position.x + bobSide + shakeX,
      this.position.y + this.eyeHeight + bob + crouchDrop + shakeY,
      this.position.z,
    );
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.y = this.yaw + this.recoilYaw;
    this.camera.rotation.x = this.pitch + this.recoilPitch + (this.landTimer > 0 ? -0.03 * (this.landTimer / 0.25) : 0);
    this.camera.rotation.z = this.tilt;
  }

  get eyePosition() {
    return this._tmp.set(this.position.x, this.position.y + this.eyeHeight, this.position.z);
  }

  get healthRatio() {
    return this.health / this.maxHealth;
  }

  get lastDamageDirection() {
    return this._lastDamageFrom;
  }
}
