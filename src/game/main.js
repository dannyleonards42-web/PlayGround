import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { GameAudio } from "./audio.js";
import { Effects } from "./fx.js";
import { createWorld } from "./world.js";
import { Player } from "./player.js";
import { EnemyManager, TYPES } from "./enemies.js";
import { WeaponSystem, RIFLE, PISTOL } from "./weapons.js";
import "./style.css";

const $ = (id) => document.getElementById(id);
const clamp = THREE.MathUtils.clamp;

const WAVE_TABLE = [
  { grunt: 6, rusher: 1, heavy: 0 },
  { grunt: 7, rusher: 2, heavy: 0 },
  { grunt: 8, rusher: 3, heavy: 1 },
  { grunt: 9, rusher: 4, heavy: 2 },
  { grunt: 12, rusher: 5, heavy: 3 },
];
const WAVE_BRIEFS = [
  "Command, first element is moving through the east ruins. Hold the courtyard.",
  "Multiple squads converging. Watch the flanks and keep your rifle fed.",
  "Heavy signature detected on the north ridge. Break their push.",
  "They are throwing everything at the relay. Do not give them the courtyard.",
  "Final assault. Hold until extraction. Make every round count.",
];
const MAX_GRENADES = 3;

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 1.0 },
    uAberration: { value: 0.0015 },
    uGrain: { value: 0.055 },
    uFlash: { value: 0.0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uVignette;
    uniform float uAberration;
    uniform float uGrain;
    uniform float uFlash;
    uniform vec2 uResolution;

    float rand(vec2 co) {
      return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453123);
    }

    void main() {
      vec2 uv = vUv;
      vec2 centered = uv - 0.5;
      float dist = length(centered);
      float ab = uAberration * (0.25 + dist * 1.9);
      vec2 dir = normalize(centered + 0.0001);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + dir * ab).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - dir * ab).b;

      // subtle warm highlights / cool shadows
      float luma = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, col * vec3(1.035, 1.005, 0.955), smoothstep(0.0, 0.75, luma) * 0.55);
      col = mix(col, col * vec3(0.94, 0.985, 1.055), smoothstep(0.55, 0.0, luma) * 0.5);

      float vig = smoothstep(0.92, 0.18, dist * uVignette);
      col *= mix(0.72, 1.0, vig);
      float grain = (rand(gl_FragCoord.xy + fract(uTime) * 193.0) - 0.5) * uGrain;
      col += grain;
      col += vec3(uFlash);
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
};

class Game {
  constructor() {
    this.canvas = $("game");
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: "high-performance",
      stencil: false,
    });
    this.renderer.setClearColor(0x0a0c0d, 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(78, 1, 0.045, 500);
    this.camera.rotation.order = "YXZ";
    this.scene.add(this.camera);

    this.settings = this.loadSettings();
    this.quality = this.settings.quality;
    this.applyRendererQuality();

    this.world = createWorld(this.scene, this.renderer, { quality: this.quality });
    this.audio = new GameAudio();
    this.fx = new Effects(this.scene, this.camera);
    this.player = new Player(this.camera, this.world, this.audio);
    this.enemies = new EnemyManager(this.scene, this.world, this.fx, this.audio, this.camera);
    this.weapon = new WeaponSystem(this.camera, this.scene, this.fx, this.audio);

    this.state = "menu";
    this.time = 0;
    this.menuTime = 0;
    this.clock = new THREE.Clock();
    this.pointerLocked = false;
    this.audioMuted = false;
    this.isMobile = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
    this.input = {
      forward: false, back: false, left: false, right: false,
      sprint: false, crouch: false, jump: false, firing: false, ads: false,
    };
    this.wave = {
      number: 0,
      total: 0,
      killed: 0,
      queue: [],
      spawnTimer: 0,
      active: false,
      intermission: 0,
      victoryPending: false,
    };
    this.grenades = 2;
    this.grenadeCooldown = 0;
    this.grenadeProjectiles = [];
    this.pickups = [];
    this.score = 0;
    this.combo = 1;
    this.comboTimer = 0;
    this.lastKillTime = -99;
    this.stats = { kills: 0, headshots: 0, bestStreak: 0, streak: 0, shots: 0, hits: 0 };
    this.runTime = 0;
    this.deathTimer = 0;
    this.resultShown = false;
    this.hudTimer = 0;
    this.radarTimer = 0;
    this.damageDirTimer = 0;
    this.toastTimer = 0;
    this.subtitleTimer = 0;
    this.frame = 0;
    this.attractEnemies = [];
    this.attractPlayer = {
      position: new THREE.Vector3(0, 0, -1),
      eyeHeight: 1.68,
      crouching: false,
      isMoving: false,
      dead: false,
    };

    this.setupPost();
    this.bindUI();
    this.bindInput();
    this.bindMobile();
    this.updateBestDisplay();
    this.setupAttract();
    this.resize();
    window.addEventListener("resize", () => this.resize());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.state === "playing") this.pause();
    });
    this.loop = this.loop.bind(this);
    window.__BLACKSITE__ = this;
    requestAnimationFrame(this.loop);
  }

  loadSettings() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem("blacksite.settings") || "{}"); } catch { /* noop */ }
    return {
      sensitivity: Number(saved.sensitivity) || 1,
      volume: saved.volume === undefined ? 0.7 : Number(saved.volume),
      quality: saved.quality || "medium",
      invertY: Boolean(saved.invertY),
      shake: saved.shake === undefined ? true : Boolean(saved.shake),
    };
  }

  saveSettings() {
    try { localStorage.setItem("blacksite.settings", JSON.stringify(this.settings)); } catch { /* noop */ }
  }

  applySettingsToUI() {
    $("sens-input").value = String(this.settings.sensitivity);
    $("volume-input").value = String(Math.round(this.settings.volume * 100));
    $("quality-input").value = this.settings.quality;
    $("invert-input").checked = this.settings.invertY;
    $("shake-input").checked = this.settings.shake;
    $("sens-value").textContent = this.settings.sensitivity.toFixed(2);
    $("volume-value").textContent = String(Math.round(this.settings.volume * 100));
    this.player.sensitivity = this.settings.sensitivity;
    this.player.invertY = this.settings.invertY;
    this.player.shakeEnabled = this.settings.shake;
    this.audio.setVolume(this.settings.volume);
  }

  applyRendererQuality() {
    const dpr = window.devicePixelRatio || 1;
    const cap = this.quality === "high" ? 2 : this.quality === "medium" ? 1.5 : 1;
    this.renderer.setPixelRatio(Math.min(dpr, cap));
  }

  setupPost() {
    const size = new THREE.Vector2();
    this.renderer.getDrawingBufferSize(size);
    const target = new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), {
      type: THREE.HalfFloatType,
      samples: this.quality === "high" ? 4 : 0,
      depthBuffer: true,
    });
    this.composer = new EffectComposer(this.renderer, target);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.54, 0.62, 0.86);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.grade.material.uniforms.uResolution.value.set(size.x, size.y);
    this.composer.addPass(this.grade);
    this.composer.setSize(window.innerWidth, window.innerHeight);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    if (this.composer) {
      this.composer.setSize(w, h);
      const db = new THREE.Vector2();
      this.renderer.getDrawingBufferSize(db);
      this.grade.material.uniforms.uResolution.value.copy(db);
    }
    if (this.bloom) this.bloom.resolution.set(w, h);
  }

  setQuality(q) {
    this.settings.quality = q;
    this.quality = q;
    this.applyRendererQuality();
    this.resize();
    this.bloom.enabled = q !== "low";
    if (this.quality === "low") {
      this.composer.setPixelRatio?.(1);
    }
    this.saveSettings();
  }

  bindUI() {
    $("deploy-btn").addEventListener("click", () => this.startGame());
    $("controls-btn").addEventListener("click", () => this.showModal("controls-modal"));
    $("settings-btn").addEventListener("click", () => this.showModal("settings-modal"));
    $("pause-settings-btn").addEventListener("click", () => this.showModal("settings-modal"));
    document.querySelectorAll("[data-close]").forEach((el) => {
      el.addEventListener("click", () => {
        const modal = $(el.getAttribute("data-close"));
        if (modal) modal.classList.add("hidden");
        this.audio.uiClick();
      });
    });
    $("resume-btn").addEventListener("click", () => this.resume());
    $("restart-btn").addEventListener("click", () => this.startGame());
    $("quit-btn").addEventListener("click", () => this.quitToMenu());
    $("redeploy-btn").addEventListener("click", () => this.startGame());
    $("result-menu-btn").addEventListener("click", () => this.quitToMenu());

    $("sens-input").addEventListener("input", (e) => {
      this.settings.sensitivity = Number(e.target.value);
      $("sens-value").textContent = this.settings.sensitivity.toFixed(2);
      this.player.sensitivity = this.settings.sensitivity;
      this.saveSettings();
    });
    $("volume-input").addEventListener("input", (e) => {
      this.settings.volume = Number(e.target.value) / 100;
      $("volume-value").textContent = e.target.value;
      this.audio.setVolume(this.settings.volume);
      this.saveSettings();
    });
    $("quality-input").addEventListener("change", (e) => {
      this.setQuality(e.target.value);
      this.toast(`QUALITY // ${String(e.target.value).toUpperCase()}`, "SETTING APPLIED");
    });
    $("invert-input").addEventListener("change", (e) => {
      this.settings.invertY = e.target.checked;
      this.player.invertY = this.settings.invertY;
      this.saveSettings();
    });
    $("shake-input").addEventListener("change", (e) => {
      this.settings.shake = e.target.checked;
      this.player.shakeEnabled = this.settings.shake;
      this.saveSettings();
    });

    this.applySettingsToUI();
    this.buildCompass();
    this.buildAmmoPips();
  }

  showModal(id) {
    this.audio.uiClick();
    const m = $(id);
    if (!m) return;
    m.classList.remove("hidden");
    if (id === "settings-modal") this.applySettingsToUI();
  }

  setupAttract() {
    this.enemies.clear();
    this.enemies.reset(1);
    this.enemies.onPlayerDamage = null;
    this.enemies.onKilled = null;
    this.enemies.onEnemyShoot = null;
    this.attractEnemies = [];
    const points = [this.world.spawnPoints[0], this.world.spawnPoints[2], this.world.spawnPoints[4], this.world.spawnPoints[6]];
    for (let i = 0; i < points.length; i++) {
      const e = this.enemies.spawn(i % 3 === 0 ? "heavy" : i % 2 ? "rusher" : "grunt", points[i]);
      e.spawnTimer = 0;
      e.attackTimer = 1.5 + i;
      this.attractEnemies.push(e);
    }
    for (const model of this.weapon.models) model.group.visible = false;
  }

  bindInput() {
    const keyMap = {
      KeyW: "forward", ArrowUp: "forward",
      KeyS: "back", ArrowDown: "back",
      KeyA: "left", ArrowLeft: "left",
      KeyD: "right", ArrowRight: "right",
    };
    window.addEventListener("keydown", (e) => {
      if (e.code === "Escape") {
        if (this.state === "playing") this.pause();
        else if (this.state === "paused") this.resume();
        return;
      }
      if (e.code === "KeyM") {
        this.audioMuted = !this.audioMuted;
        this.audio.setMuted(this.audioMuted);
        this.toast(this.audioMuted ? "AUDIO MUTED" : "AUDIO ONLINE", "");
        return;
      }
      if (this.state !== "playing") return;
      if (keyMap[e.code]) {
        this.input[keyMap[e.code]] = true;
        e.preventDefault();
      }
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") this.input.sprint = true;
      if (e.code === "Space") { this.input.jump = true; e.preventDefault(); }
      if (e.code === "KeyC") { this.player.crouching = !this.player.crouching; this.audio.uiClick(); }
      if (e.code === "KeyR") this.weapon.startReload();
      if (e.code === "Digit1") this.weapon.switchTo(RIFLE);
      if (e.code === "Digit2") this.weapon.switchTo(PISTOL);
      if (e.code === "KeyG") this.throwGrenade();
      if (e.code === "KeyQ") this.weapon.toggleWeapon();
    });
    window.addEventListener("keyup", (e) => {
      if (keyMap[e.code]) this.input[keyMap[e.code]] = false;
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") this.input.sprint = false;
      if (e.code === "Space") this.input.jump = false;
    });

    document.addEventListener("mousemove", (e) => {
      if (this.state !== "playing" || !this.pointerLocked) return;
      this.player.look(e.movementX || 0, e.movementY || 0);
      this.weapon.addLookSway(e.movementX || 0, e.movementY || 0);
    });
    document.addEventListener("mousedown", (e) => {
      if (this.state !== "playing") return;
      if (!this.pointerLocked) {
        this.requestLock();
        return;
      }
      if (e.button === 0) this.input.firing = true;
      if (e.button === 2) this.input.ads = true;
    });
    document.addEventListener("mouseup", (e) => {
      if (e.button === 0) this.input.firing = false;
      if (e.button === 2) this.input.ads = false;
    });
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    this.canvas.addEventListener("click", () => {
      if (this.state === "playing" && !this.pointerLocked && !this.isMobile) this.requestLock();
    });

    document.addEventListener("pointerlockchange", () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
      if (this.state === "playing" && !this.pointerLocked && !this.isMobile) this.pause();
    });

    this.weapon.onHit = (result, headshot) => {
      this.showHitmarker(Boolean(result?.killed), headshot);
      if (headshot) this.audio.headshot();
      else this.audio.impact();
    };
    this.player.onDamage = (_amount, from, _source, health) => {
      this.showDamageDirection(from);
      if (health < 30) this.setSubtitle("Vitals critical. Find cover.", 2.6);
    };
    this.player.onDeath = () => this.onDeath();
    this.enemies.onKilled = (enemy, headshot) => this.onEnemyKilled(enemy, headshot);
    this.enemies.onPlayerDamage = (amount, from, source) => this.player.damage(amount, from, source);
  }

  requestLock() {
    if (!this.pointerLocked && this.canvas.requestPointerLock) {
      try { this.canvas.requestPointerLock(); } catch { /* noop */ }
    }
  }

  bindMobile() {
    if (!this.isMobile) return;
    $("mobile-controls").classList.remove("hidden");
    const stick = $("stick-base");
    const knob = $("stick-knob");
    const zone = $("stick-zone");
    let stickId = null;
    let origin = { x: 0, y: 0 };
    const resetStick = () => {
      this.input.forward = this.input.back = this.input.left = this.input.right = false;
      if (knob) knob.style.transform = "translate(0px, 0px)";
    };
    zone.addEventListener("pointerdown", (e) => {
      if (this.state !== "playing") return;
      stickId = e.pointerId;
      zone.setPointerCapture(e.pointerId);
      const r = stick.getBoundingClientRect();
      origin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      e.preventDefault();
    });
    zone.addEventListener("pointermove", (e) => {
      if (stickId !== e.pointerId || this.state !== "playing") return;
      let dx = e.clientX - origin.x;
      let dy = e.clientY - origin.y;
      const max = 48;
      const len = Math.hypot(dx, dy);
      if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max; }
      if (knob) knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.input.left = dx < -12;
      this.input.right = dx > 12;
      this.input.forward = dy < -12;
      this.input.back = dy > 12;
      this.input.sprint = len > 42 && dy < -30;
      e.preventDefault();
    });
    const release = (e) => {
      if (stickId === e.pointerId) {
        stickId = null;
        resetStick();
      }
    };
    zone.addEventListener("pointerup", release);
    zone.addEventListener("pointercancel", release);

    const look = $("look-zone");
    let lookId = null;
    let last = { x: 0, y: 0 };
    look.addEventListener("pointerdown", (e) => {
      if (this.state !== "playing") return;
      lookId = e.pointerId;
      look.setPointerCapture(e.pointerId);
      last = { x: e.clientX, y: e.clientY };
      e.preventDefault();
    });
    look.addEventListener("pointermove", (e) => {
      if (lookId !== e.pointerId || this.state !== "playing") return;
      const dx = (e.clientX - last.x) * 2.1;
      const dy = (e.clientY - last.y) * 2.1;
      last = { x: e.clientX, y: e.clientY };
      this.player.look(dx, dy);
      this.weapon.addLookSway(dx, dy);
      e.preventDefault();
    });
    const lookRelease = (e) => { if (lookId === e.pointerId) lookId = null; };
    look.addEventListener("pointerup", lookRelease);
    look.addEventListener("pointercancel", lookRelease);

    const hold = (id, down, up) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener("pointerdown", (e) => { e.preventDefault(); down(); el.setPointerCapture?.(e.pointerId); });
      el.addEventListener("pointerup", (e) => { e.preventDefault(); up?.(); });
      el.addEventListener("pointercancel", () => up?.());
      el.addEventListener("pointerleave", () => up?.());
    };
    hold("mobile-fire", () => { this.input.firing = true; }, () => { this.input.firing = false; });
    hold("mobile-aim", () => { this.input.ads = true; }, () => { this.input.ads = false; });
    hold("mobile-jump", () => { this.input.jump = true; }, () => { this.input.jump = false; });
    $("mobile-reload").addEventListener("click", () => { if (this.state === "playing") this.weapon.startReload(); });
    $("mobile-swap").addEventListener("click", () => { if (this.state === "playing") this.weapon.toggleWeapon(); });
    $("mobile-grenade").addEventListener("click", () => { if (this.state === "playing") this.throwGrenade(); });
    $("mobile-pause").addEventListener("click", () => { if (this.state === "playing") this.pause(); });
  }

  startGame() {
    this.audio.init().then(() => this.audio.resume()).catch(() => {});
    this.audio.setVolume(this.settings.volume);
    this.audio.uiClick();
    this.state = "playing";
    this.runTime = 0;
    this.deathTimer = 0;
    this.resultShown = false;
    this.score = 0;
    this.combo = 1;
    this.comboTimer = 0;
    this.grenades = 2;
    this.stats = { kills: 0, headshots: 0, bestStreak: 0, streak: 0, shots: 0, hits: 0 };
    this.wave = { number: 0, total: 0, killed: 0, queue: [], spawnTimer: 0, active: false, intermission: 2.8, victoryPending: false };
    this.enemies.clear();
    this.enemies.reset(1);
    this.enemies.onKilled = (enemy, headshot) => this.onEnemyKilled(enemy, headshot);
    this.enemies.onPlayerDamage = (amount, from, source) => this.player.damage(amount, from, source);
    this.enemies.onEnemyShoot = null;
    this.clearPickups();
    this.clearGrenades();
    this.player.reset();
    this.weapon.reset();
    this.weapon.models.forEach((m) => { m.group.visible = false; });
    this.weapon.models[RIFLE].group.visible = true;
    this.input.firing = false;
    this.input.ads = false;
    this.input.jump = false;
    this.input.forward = this.input.back = this.input.left = this.input.right = false;
    this.input.sprint = false;
    this.player.crouching = false;
    this.audio.resume();
    this.audio.waveStart();
    document.body.classList.add("playing");
    $("menu").classList.add("hidden");
    $("pause").classList.add("hidden");
    $("gameover").classList.add("hidden");
    $("hud").classList.remove("hidden");
    if (this.isMobile) $("mobile-controls").classList.remove("hidden");
    else this.requestLock();
    this.updateHud(true);
    this.setObjective("HOLD THE COMPOUND", "FIRST CONTACT IMMINENT");
    this.setSubtitle("Command to all units: uplink is dark, hostiles inbound. Hold the relay.", 4.5);
    this.toast("OPERATION DUSTLINE", "SURVIVE FIVE ASSAULT WAVES");
    this.spawnPickup("ammo", this.world.pickupSpots[0]);
    this.spawnPickup("health", this.world.pickupSpots[1]);
    this.spawnPickup("armor", this.world.pickupSpots[2]);
  }

  pause() {
    if (this.state !== "playing") return;
    this.state = "paused";
    this.input.firing = false;
    this.input.ads = false;
    document.body.classList.remove("playing");
    $("pause").classList.remove("hidden");
    $("pause-wave").textContent = String(Math.max(1, this.wave.number)).padStart(2, "0");
    $("pause-score").textContent = String(Math.floor(this.score)).padStart(6, "0");
    $("pause-kills").textContent = String(this.stats.kills);
    $("pause-accuracy").textContent = `${this.weapon.accuracy}%`;
    if (document.pointerLockElement) document.exitPointerLock();
    this.audio.uiClick();
  }

  resume() {
    if (this.state !== "paused") return;
    this.state = "playing";
    document.body.classList.add("playing");
    $("pause").classList.add("hidden");
    this.audio.resume();
    this.audio.uiClick();
    if (!this.isMobile) this.requestLock();
  }

  quitToMenu() {
    this.state = "menu";
    document.body.classList.remove("playing");
    $("pause").classList.add("hidden");
    $("gameover").classList.add("hidden");
    $("hud").classList.add("hidden");
    $("menu").classList.remove("hidden");
    this.enemies.clear();
    this.clearPickups();
    this.clearGrenades();
    this.weapon.models.forEach((m) => { m.group.visible = false; });
    this.setupAttract();
    if (document.pointerLockElement) document.exitPointerLock();
    this.audio.uiClick();
    this.updateBestDisplay();
  }

  onDeath() {
    if (this.state !== "playing") return;
    this.state = "dead";
    this.deathTimer = 0;
    this.input.firing = false;
    this.input.ads = false;
    this.audio.defeat();
    this.setObjective("OPERATOR DOWN", "SIGNAL LOST");
    this.setSubtitle("Operator down. Blacksite 07 is dark.", 3);
    this.toast("OPERATOR KIA", "SIGNAL LOST");
    if (document.pointerLockElement) document.exitPointerLock();
    document.body.classList.remove("playing");
  }

  onEnemyKilled(enemy, headshot) {
    this.stats.kills++;
    this.stats.headshots += headshot ? 1 : 0;
    this.stats.streak++;
    this.stats.bestStreak = Math.max(this.stats.bestStreak, this.stats.streak);
    if (this.time - this.lastKillTime < 4) this.combo = Math.min(5, this.combo + 1);
    else this.combo = 1;
    this.lastKillTime = this.time;
    this.comboTimer = 4;
    const base = enemy.def.score * (headshot ? 1.5 : 1);
    this.score += Math.round(base * this.combo);
    this.wave.killed++;
    this.addKillFeed(enemy.type, headshot);
    this.showHitmarker(true, headshot);
    if (Math.random() < 0.33) {
      const type = Math.random() < 0.55 ? "ammo" : Math.random() < 0.45 ? "health" : "armor";
      this.spawnPickup(type, new THREE.Vector3(enemy.position.x + (Math.random() - 0.5) * 0.8, 0, enemy.position.z + (Math.random() - 0.5) * 0.8));
    }
    if (this.wave.killed === Math.ceil(this.wave.total * 0.5) && this.wave.active) {
      this.setSubtitle("Half their element is down. Keep pressure.", 2.4);
    }
  }

  startWave(n) {
    const table = WAVE_TABLE[n - 1];
    const queue = [];
    for (let i = 0; i < table.grunt; i++) queue.push("grunt");
    for (let i = 0; i < table.rusher; i++) queue.push("rusher");
    for (let i = 0; i < table.heavy; i++) queue.push("heavy");
    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
    this.wave.number = n;
    this.wave.total = queue.length;
    this.wave.killed = 0;
    this.wave.queue = queue;
    this.wave.spawnTimer = 0.9;
    this.wave.active = true;
    this.wave.intermission = 0;
    this.wave.victoryPending = false;
    this.enemies.difficulty = 1 + (n - 1) * 0.16;
    this.weapon.resupply();
    this.grenades = Math.min(MAX_GRENADES, this.grenades + 1);
    this.player.heal(28);
    this.player.addArmor(18);
    this.audio.waveStart();
    this.toast(`WAVE ${String(n).padStart(2, "0")}`, n === 5 ? "FINAL ASSAULT" : "HOSTILES INBOUND");
    this.setObjective(n === 5 ? "HOLD UNTIL EXTRACTION" : "HOLD THE COMPOUND", `${this.wave.total} HOSTILES · WAVE ${String(n).padStart(2, "0")} / 05`);
    this.setSubtitle(WAVE_BRIEFS[n - 1], 4);
    this.spawnPickup(n % 2 ? "ammo" : "health", this.world.pickupSpots[(n + 2) % this.world.pickupSpots.length]);
    this.updateHud(true);
  }

  completeWave() {
    if (!this.wave.active) return;
    this.wave.active = false;
    const bonus = 500 * this.wave.number;
    this.score += bonus;
    this.audio.waveClear();
    if (this.wave.number >= 5) {
      this.wave.victoryPending = true;
      this.wave.intermission = 3.2;
      this.toast("SECTOR HELD", `EXTRACTION INBOUND · +${bonus}`);
      this.setSubtitle("All hostiles neutralized. Uplink is secure. Good work, operator.", 4);
    } else {
      this.wave.intermission = 7;
      this.toast("SECTOR SECURED", `RESUPPLYING · NEXT WAVE IN 07`);
      this.setSubtitle("Wave clear. Resupply and reposition. They will hit harder next time.", 4);
      this.spawnPickup("ammo", this.world.pickupSpots[0]);
      this.spawnPickup("health", this.world.pickupSpots[1]);
      this.spawnPickup("armor", this.world.pickupSpots[2]);
      this.grenades = Math.min(MAX_GRENADES, this.grenades + 1);
    }
  }

  updateWaves(dt) {
    if (this.state !== "playing") return;
    if (this.wave.victoryPending) {
      this.wave.intermission -= dt;
      if (this.wave.intermission <= 0) this.endGame(true);
      return;
    }
    if (!this.wave.active) {
      if (this.wave.number >= 5) return;
      this.wave.intermission -= dt;
      if (this.wave.intermission <= 0) this.startWave(this.wave.number + 1);
      else if (this.wave.number > 0) {
        const secs = Math.max(1, Math.ceil(this.wave.intermission));
        $("objective-sub").textContent = `NEXT WAVE IN ${String(secs).padStart(2, "0")}`;
      }
      return;
    }
    this.wave.spawnTimer -= dt;
    const maxAlive = 6 + this.wave.number * 2;
    if (this.wave.queue.length > 0 && this.enemies.aliveCount < maxAlive && this.wave.spawnTimer <= 0) {
      const type = this.wave.queue.pop();
      const point = this.pickSpawnPoint();
      const e = this.enemies.spawn(type, point);
      e.spawnTimer = 0.65;
      this.wave.spawnTimer = Math.max(0.4, 1.35 - this.wave.number * 0.09) * (0.65 + Math.random() * 0.7);
    }
    if (this.wave.queue.length === 0 && this.enemies.aliveCount === 0) this.completeWave();
  }

  pickSpawnPoint() {
    const valid = this.world.spawnPoints.filter((p) => p.distanceTo(this.player.position) > 15);
    const pool = valid.length ? valid : this.world.spawnPoints;
    return pool[Math.floor(Math.random() * pool.length)].clone();
  }

  endGame(won) {
    if (this.state === "won" || this.resultShown) return;
    this.state = won ? "won" : "dead";
    this.resultShown = true;
    this.audio.victory?.();
    if (!won) this.audio.defeat();
    const best = Math.max(Number(localStorage.getItem("blacksite.best") || 0), Math.floor(this.score));
    try { localStorage.setItem("blacksite.best", String(best)); } catch { /* noop */ }
    this.updateBestDisplay();
    if (document.pointerLockElement) document.exitPointerLock();
    document.body.classList.remove("playing");
    $("hud").classList.add("hidden");
    $("mobile-controls").classList.add("hidden");
    const screen = $("gameover");
    screen.classList.remove("hidden");
    screen.classList.toggle("won", won);
    $("result-eyebrow").textContent = won ? "OPERATION COMPLETE" : "OPERATOR KIA";
    $("result-title").innerHTML = won ? "SECTOR<br /><em>HELD</em>" : "MISSION<br /><em>FAILED</em>";
    $("result-copy").textContent = won
      ? "The relay is secure and extraction is inbound. Blacksite 07 holds the line."
      : "The relay fell silent. The badlands keep what they take.";
    $("result-waves").textContent = `${won ? 5 : Math.max(0, this.wave.number - (this.wave.active ? 1 : 0))} / 5`;
    $("result-kills").textContent = String(this.stats.kills);
    $("result-accuracy").textContent = `${this.weapon.accuracy}%`;
    $("result-score").textContent = String(Math.floor(this.score)).padStart(6, "0");
    $("result-time").textContent = this.formatTime(this.runTime);
    $("result-streak").textContent = String(this.stats.bestStreak);
    $("result-rank").textContent = this.rankFor(this.score);
  }

  rankFor(score) {
    if (score >= 12000) return "BLACKSITE GHOST";
    if (score >= 8000) return "CAPTAIN";
    if (score >= 5000) return "LIEUTENANT";
    if (score >= 3000) return "SERGEANT";
    if (score >= 1500) return "CORPORAL";
    return "RECRUIT";
  }

  formatTime(t) {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  updateBestDisplay() {
    let best = 0;
    try { best = Number(localStorage.getItem("blacksite.best") || 0); } catch { /* noop */ }
    $("best-score").textContent = `BEST ${String(Math.floor(best)).padStart(6, "0")}`;
  }

  showHitmarker(kill, headshot) {
    const el = $("hitmarker");
    el.classList.remove("pop", "kill");
    if (kill) el.classList.add("kill");
    if (headshot) el.classList.add("kill");
    void el.offsetWidth;
    el.classList.add("pop");
  }

  showDamageDirection(from) {
    const el = $("hit-direction");
    if (!from) {
      el.style.opacity = "1";
      this.damageDirTimer = 0.6;
      return;
    }
    const dx = from.x - this.player.position.x;
    const dz = from.z - this.player.position.z;
    const angle = Math.atan2(dx, -dz) + this.player.yaw;
    el.style.transform = `rotate(${angle}rad)`;
    el.style.opacity = "1";
    this.damageDirTimer = 0.75;
  }

  addKillFeed(type, headshot) {
    const feed = $("killfeed");
    const item = document.createElement("div");
    item.className = "feed-item";
    item.innerHTML = `<b>YOU</b> ${headshot ? '<span class="head">HEADSHOT</span>' : '<span class="hs">CQC</span>'} <span>${type.toUpperCase()}</span>`;
    feed.prepend(item);
    while (feed.children.length > 5) feed.lastChild?.remove();
    setTimeout(() => item.remove(), 3700);
  }

  toast(main, sub = "") {
    const el = $("toast");
    el.innerHTML = `${main}${sub ? `<small>${sub}</small>` : ""}`;
    el.classList.add("show");
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
  }

  setSubtitle(text, duration = 3) {
    const el = $("subtitle");
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(this.subtitleTimer);
    this.subtitleTimer = setTimeout(() => el.classList.remove("show"), duration * 1000);
  }

  setObjective(main, sub) {
    $("objective-main").textContent = main;
    $("objective-sub").textContent = sub;
  }

  buildCompass() {
    const strip = $("compass-strip");
    strip.innerHTML = "";
    const cards = { 0: "N", 45: "NE", 90: "E", 135: "SE", 180: "S", 225: "SW", 270: "W", 315: "NW" };
    for (let i = 0; i < 72; i++) {
      const deg = ((i * 15) % 360 + 360) % 360;
      const span = document.createElement("span");
      if (cards[deg] !== undefined) {
        span.textContent = cards[deg];
        span.className = "card";
      } else if (deg % 30 === 0) {
        span.textContent = String(deg).padStart(3, "0");
      } else {
        span.textContent = "·";
        span.className = "tick";
      }
      strip.appendChild(span);
    }
    this.compassOffset = 0;
  }

  buildAmmoPips() {
    const pips = $("ammo-pips");
    const def = this.weapon.def;
    if (pips.childElementCount === def.magSize) return;
    pips.innerHTML = "";
    for (let i = 0; i < def.magSize; i++) pips.appendChild(document.createElement("i"));
  }

  updateHud(force = false) {
    const p = this.player;
    const w = this.weapon;
    const mag = w.ammoState.mag;
    const reserve = w.ammoState.reserve;
    $("health-value").textContent = String(Math.ceil(p.health));
    $("health-fill").style.width = `${Math.max(0, p.healthRatio * 100)}%`;
    $("health-fill").classList.toggle("low", p.healthRatio < 0.32);
    $("armor-fill").style.width = `${Math.max(0, (p.armor / p.maxArmor) * 100)}%`;
    $("ammo-mag").textContent = String(mag).padStart(2, "0");
    $("ammo-mag").classList.toggle("low", mag <= Math.max(3, w.def.magSize * 0.14));
    $("ammo-reserve").textContent = String(reserve).padStart(3, "0");
    $("weapon-name").textContent = w.def.name;
    $("weapon-mode").textContent = `${w.def.mode} · ${w.def.caliber}`;
    $("reload-prompt").classList.toggle("hidden", !(mag === 0 || w.reloading));
    $("score-value").textContent = String(Math.floor(this.score)).padStart(6, "0");
    $("combo-value").textContent = `x${this.combo}`;
    $("combo-value").classList.toggle("hidden", this.combo <= 1);
    $("grenade-count").textContent = String(this.grenades);
    $("enemies-left").textContent = String(Math.max(0, this.wave.total - this.wave.killed));
    $("wave-number").textContent = String(Math.max(1, this.wave.number));
    $("wave-progress").style.width = `${this.wave.total ? (this.wave.killed / this.wave.total) * 100 : 0}%`;
    $("pause-score").textContent = String(Math.floor(this.score)).padStart(6, "0");

    if (this.weapon.def.magSize !== $("ammo-pips").childElementCount) this.buildAmmoPips();
    const pips = $("ammo-pips").children;
    for (let i = 0; i < pips.length; i++) pips[i].classList.toggle("empty", i >= mag);

    const bearing = ((-p.yaw * 180) / Math.PI % 360 + 360) % 360;
    const idx = bearing / 15;
    const offset = 230 - idx * 23 - 11;
    $("compass-strip").style.transform = `translateX(${offset}px)`;
    $("compass-deg").textContent = String(Math.round(bearing)).padStart(3, "0");

    const spread = 4 + w.getSpread() * 720 + (p.isMoving ? 3 : 0);
    $("crosshair").style.setProperty("--spread", `${spread.toFixed(1)}px`);

    const danger = Math.min(1, p.damageFlash * 0.9 + (p.health < 35 ? 0.25 : 0));
    $("damage-vignette").style.opacity = String(danger);
  }

  drawRadar() {
    const canvas = $("radar");
    if (!canvas || canvas.offsetParent === null) return;
    const ctx = canvas.getContext("2d");
    const size = 240;
    const scale = 2.55;
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(120, 120, 116, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(120, 120);
    // range rings
    ctx.strokeStyle = "rgba(124,231,213,0.12)";
    ctx.lineWidth = 1;
    for (const r of [34, 68, 102]) {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    // colliders as faint blocks
    for (const c of this.world.colliders) {
      if (c.top < 1.6) continue;
      const x = (c.minX - this.player.position.x) * scale;
      const y = (c.minZ - this.player.position.z) * scale;
      const w = (c.maxX - c.minX) * scale;
      const h = (c.maxZ - c.minZ) * scale;
      ctx.fillStyle = "rgba(180,190,175,0.11)";
      ctx.fillRect(x, y, w, h);
    }
    // pickups
    for (const p of this.pickups) {
      ctx.fillStyle = p.type === "health" ? "#7ce7d5" : p.type === "ammo" ? "#ffb03a" : "#9bb8ff";
      ctx.fillRect((p.group.position.x - this.player.position.x) * scale - 2, (p.group.position.z - this.player.position.z) * scale - 2, 4, 4);
    }
    // enemies
    for (const e of this.enemies.enemies) {
      if (e.dead || e.spawnTimer > 0.2) continue;
      const x = (e.position.x - this.player.position.x) * scale;
      const y = (e.position.z - this.player.position.z) * scale;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-e.group.rotation.y);
      ctx.fillStyle = e.type === "heavy" ? "#ff8a4a" : "#ff4d3d";
      ctx.beginPath();
      ctx.moveTo(0, -5);
      ctx.lineTo(4, 4);
      ctx.lineTo(-4, 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    // fov cone
    ctx.save();
    ctx.rotate(-this.player.yaw);
    const grad = ctx.createLinearGradient(0, 0, 0, -90);
    grad.addColorStop(0, "rgba(255,176,58,0.2)");
    grad.addColorStop(1, "rgba(255,176,58,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-44, -84);
    ctx.lineTo(44, -84);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // player
    ctx.fillStyle = "#f3ecdc";
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(6, 7);
    ctx.lineTo(0, 4);
    ctx.lineTo(-6, 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  spawnPickup(type, pos) {
    if (!pos) return;
    const group = new THREE.Group();
    let color = 0xffb03a;
    if (type === "health") color = 0x7ce7d5;
    if (type === "armor") color = 0x9bb8ff;
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(type === "ammo" ? 0.52 : 0.44, type === "ammo" ? 0.28 : 0.24, type === "ammo" ? 0.34 : 0.3),
      new THREE.MeshStandardMaterial({ color: type === "ammo" ? 0x4b4a35 : 0x2a3434, roughness: 0.55, metalness: 0.35 }),
    );
    base.position.y = 0.17;
    base.castShadow = true;
    group.add(base);
    const glowMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
    if (type === "health") {
      const v = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.02), glowMat);
      v.position.set(0, 0.18, -0.16);
      group.add(v);
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.02), glowMat);
      h.position.set(0, 0.18, -0.16);
      group.add(h);
    } else if (type === "ammo") {
      for (let i = 0; i < 3; i++) {
        const round = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.04), glowMat);
        round.position.set(-0.08 + i * 0.08, 0.17, -0.18);
        group.add(round);
      }
    } else {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.025), glowMat);
      plate.position.set(0, 0.18, -0.17);
      group.add(plate);
    }
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.38, 0.012, 4, 24),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.48, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.04;
    group.add(ring);
    group.position.set(pos.x, 0, pos.z);
    group.rotation.y = Math.random() * Math.PI;
    this.scene.add(group);
    this.pickups.push({ group, type, ring, phase: Math.random() * 6, life: 0 });
  }

  clearPickups() {
    for (const p of this.pickups) this.scene.remove(p.group);
    this.pickups.length = 0;
  }

  updatePickups(dt) {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.life += dt;
      p.group.rotation.y += dt * 1.7;
      p.group.position.y = 0.04 + Math.sin(p.life * 2.6 + p.phase) * 0.05;
      p.ring.scale.setScalar(1 + Math.sin(p.life * 3 + p.phase) * 0.12);
      const d = Math.hypot(this.player.position.x - p.group.position.x, this.player.position.z - p.group.position.z);
      if (d < 1.25) {
        if (p.type === "ammo") {
          this.weapon.addAmmo(48);
          this.audio.pickup();
          this.toast("+48 ROUNDS", "AMMO CACHE");
        } else if (p.type === "health") {
          this.player.heal(38);
          this.audio.pickup();
          this.toast("+38 VITALS", "FIELD MEDKIT");
        } else {
          this.player.addArmor(40);
          this.audio.pickup();
          this.toast("PLATE RESTORED", "ARMOR CACHE");
        }
        this.scene.remove(p.group);
        this.pickups.splice(i, 1);
      }
    }
  }

  clearGrenades() {
    for (const g of this.grenadeProjectiles) this.scene.remove(g.mesh);
    this.grenadeProjectiles.length = 0;
  }

  throwGrenade() {
    if (this.state !== "playing" || this.grenades <= 0 || this.grenadeCooldown > 0) return;
    this.grenades--;
    this.grenadeCooldown = 0.8;
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const pos = new THREE.Vector3();
    this.camera.getWorldPosition(pos);
    pos.addScaledVector(dir, 0.55);
    pos.y -= 0.08;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x3b4032, roughness: 0.5, metalness: 0.4 }),
    );
    mesh.position.copy(pos);
    mesh.castShadow = true;
    this.scene.add(mesh);
    const velocity = dir.clone().multiplyScalar(15.5);
    velocity.y += 4.8;
    this.grenadeProjectiles.push({ mesh, velocity, fuse: 1.75 });
    this.audio.uiClick();
    this.toast("FRAG OUT", `${this.grenades} REMAINING`);
  }

  updateGrenades(dt) {
    this.grenadeCooldown = Math.max(0, this.grenadeCooldown - dt);
    for (let i = this.grenadeProjectiles.length - 1; i >= 0; i--) {
      const g = this.grenadeProjectiles[i];
      g.fuse -= dt;
      g.velocity.y -= 22 * dt;
      const next = g.mesh.position.clone().addScaledVector(g.velocity, dt);
      if (next.y < 0.12) {
        next.y = 0.12;
        g.velocity.y *= -0.35;
        g.velocity.x *= 0.7;
        g.velocity.z *= 0.7;
      }
      if (this.world.collidesAt(next.x, next.z, 0.12)) {
        g.velocity.x *= -0.35;
        g.velocity.z *= -0.35;
        next.x = g.mesh.position.x;
        next.z = g.mesh.position.z;
      }
      g.mesh.position.copy(next);
      g.mesh.rotation.x += dt * 9;
      g.mesh.rotation.z += dt * 7;
      if (g.fuse <= 0) {
        this.explodeGrenade(g.mesh.position.clone());
        this.scene.remove(g.mesh);
        this.grenadeProjectiles.splice(i, 1);
      }
    }
  }

  explodeGrenade(point) {
    this.fx.explosion(point, 5.5);
    this.audio.explosion();
    this.enemies.applyExplosion(point, 6.2, 190);
    const d = point.distanceTo(new THREE.Vector3(this.player.position.x, 1, this.player.position.z));
    if (d < 4.6) this.player.damage(Math.round(65 * (1 - d / 4.6)), point, "explosion");
    this.shakeScreen(0.9);
    flashScreen(0.18);
  }

  shakeScreen(amount) {
    this.player.shake = Math.min(1.4, this.player.shake + amount);
  }

  updateDeadCamera(dt) {
    this.deathTimer += dt;
    const t = Math.min(1, this.deathTimer / 1.4);
    this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, this.player.position.y + 0.45, 3.5, dt);
    this.camera.rotation.z = THREE.MathUtils.damp(this.camera.rotation.z, 0.55, 2.2, dt);
    this.camera.rotation.x = THREE.MathUtils.damp(this.camera.rotation.x, 0.12, 1.6, dt);
    if (this.deathTimer > 1.35 && !this.resultShown) this.endGame(false);
  }

  updateMenu(dt) {
    this.menuTime += dt;
    const t = this.menuTime;
    const radius = 23 + Math.sin(t * 0.075) * 4;
    const angle = t * 0.045 + 0.6;
    this.camera.position.set(Math.sin(angle) * radius, 5.7 + Math.sin(t * 0.09) * 1.5, 6 + Math.cos(angle) * radius);
    const target = new THREE.Vector3(Math.sin(t * 0.12) * 2.5, 2.7, -3 + Math.cos(t * 0.1) * 2);
    this.camera.lookAt(target);
    this.camera.rotation.z = Math.sin(t * 0.1) * 0.012;
    this.camera.fov = 62;
    this.camera.updateProjectionMatrix();
    this.enemies.update(dt, this.attractPlayer, this.time);
  }

  update(dt) {
    this.time += dt;
    this.frame++;
    this.world.update(dt, this.time);
    this.fx.update(dt);

    if (this.state === "menu") {
      this.updateMenu(dt);
      return;
    }
    if (this.state === "paused") return;
    if (this.state === "dead") {
      this.updateDeadCamera(dt);
      this.enemies.update(dt, this.player, this.time);
      this.fx.update(dt * 0.6);
      return;
    }
    if (this.state === "won") {
      this.enemies.update(dt, this.player, this.time);
      return;
    }

    this.runTime += dt;
    this.grenadeCooldown = Math.max(0, this.grenadeCooldown - dt);
    this.comboTimer -= dt;
    if (this.comboTimer <= 0) this.combo = 1;

    this.player.update(dt, this.input, this.weapon);
    this.weapon.update(dt, this.player, this.input, this.world, this.enemies);
    this.player.setAds(this.weapon.ads, this.weapon.def.adsFov);
    this.enemies.update(dt, this.player, this.time);
    this.updateWaves(dt);
    this.updatePickups(dt);
    this.updateGrenades(dt);

    this.damageDirTimer -= dt;
    if (this.damageDirTimer <= 0) $("hit-direction").style.opacity = "0";

    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.08;
      this.updateHud();
    }
    this.radarTimer -= dt;
    if (this.radarTimer <= 0) {
      this.radarTimer = 0.1;
      this.drawRadar();
    }
    if (this.player.dead && this.state === "playing") this.onDeath();
  }

  render() {
    if (this.quality === "low") {
      this.renderer.render(this.scene, this.camera);
    } else {
      this.grade.material.uniforms.uTime.value = this.time;
      this.composer.render();
    }
  }

  loop() {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    try {
      this.update(dt);
      this.render();
    } catch (err) {
      console.error(err);
      showBootError(err);
    }
  }
}

function flashScreen(amount) {
  const el = $("flash");
  el.style.transition = "none";
  el.style.opacity = String(amount);
  requestAnimationFrame(() => {
    el.style.transition = "opacity 0.28s ease-out";
    el.style.opacity = "0";
  });
}

function showBootError(err) {
  const el = $("boot-error");
  if (!el) return;
  el.classList.remove("hidden");
  el.textContent = `BLACKSITE BOOT FAILURE\n\n${err?.stack || err?.message || String(err)}\n\nReload the page. If this persists, WebGL2 may be unavailable.`;
}

window.addEventListener("error", (e) => {
  if (e?.error) console.error(e.error);
});
window.addEventListener("unhandledrejection", (e) => console.error(e.reason));

try {
  new Game();
} catch (err) {
  console.error(err);
  showBootError(err);
}
