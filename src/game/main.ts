/**
 * NOVA BREAKER — a complete neon brick-breaker arcade game.
 * Self-contained vanilla TypeScript on canvas. No external assets:
 * all visuals are drawn and all audio is synthesized with WebAudio.
 */

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const W = 960;
const H = 640;
const WALL = 10; // side/top wall thickness
const HUD_H = 52; // HUD strip height inside the playfield

const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

const rand = (min: number, max: number): number => min + Math.random() * (max - min);
const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;
const rrect = (x: number, y: number, w: number, h: number, r: number): void => {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
};

// ---------------------------------------------------------------------------
// Synthesized audio (no assets, created on first user gesture)
// ---------------------------------------------------------------------------

class Sound {
  private audioCtx: AudioContext | null = null;
  muted = false;

  unlock(): void {
    if (!this.audioCtx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return;
      this.audioCtx = new Ctor();
    }
    if (this.audioCtx.state === "suspended") void this.audioCtx.resume();
  }

  blip(
    freq: number,
    dur: number,
    type: OscillatorType = "square",
    vol = 0.08,
    slideTo = 0,
  ): void {
    if (this.muted || !this.audioCtx || this.audioCtx.state !== "running") return;
    const t = this.audioCtx.currentTime;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo > 0) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.audioCtx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  paddleHit(): void {
    this.blip(220, 0.08, "square", 0.09, 330);
  }
  brickHit(): void {
    this.blip(520, 0.07, "square", 0.07, 760);
  }
  brickBreak(combo: number): void {
    this.blip(420 + Math.min(combo, 10) * 55, 0.1, "triangle", 0.09, 900);
  }
  explosion(): void {
    this.blip(90, 0.35, "sawtooth", 0.16, 40);
  }
  powerup(): void {
    this.blip(600, 0.18, "sine", 0.12, 1300);
  }
  laser(): void {
    this.blip(1200, 0.06, "sawtooth", 0.05, 500);
  }
  death(): void {
    this.blip(300, 0.6, "sawtooth", 0.14, 60);
  }
  clear(): void {
    this.blip(500, 0.15, "triangle", 0.1);
    setTimeout(() => this.blip(700, 0.15, "triangle", 0.1), 120);
    setTimeout(() => this.blip(1000, 0.25, "triangle", 0.1), 240);
  }
  gameOver(): void {
    this.blip(200, 0.5, "triangle", 0.12, 100);
    setTimeout(() => this.blip(140, 0.8, "triangle", 0.12, 60), 350);
  }
}

const sound = new Sound();

// ---------------------------------------------------------------------------
// Level layouts (rows of 12 columns). Legend:
//  . empty | 1 light | 2 tough (2 hp) | 3 armored (3 hp) | X explosive
// ---------------------------------------------------------------------------

const LEVELS: string[][] = [
  [
    "............",
    "111111111111",
    "111111111111",
    "222222222222",
    "111111111111",
    "111111111111",
  ],
  [
    "2.11111111.2",
    "2.22222222.2",
    "..11111111..",
    "1.....2....1",
    "113333333311",
    "1.....2....1",
  ],
  [
    "X1111111111X",
    ".2222222222.",
    "..11111111..",
    "...333333...",
    "....1111....",
    ".....11.....",
  ],
  [
    "3.2.3.3.2.3.",
    ".1.1.1.1.1.1",
    "X222222222X.",
    ".1.1.1.1.1.1",
    "3.2.3.3.2.3.",
    "..X.....X...",
  ],
  [
    "333333333331",
    "2.2.2.2.2.2.",
    "111111111111",
    "X..2.22.2..X",
    "333333333331",
    "1.1.1.1.1.1.",
  ],
];

const BRICK_STYLE: Record<string, { fill: string; glow: string; hp: number; score: number }> = {
  "1": { fill: "#57e6ff", glow: "rgba(87,230,255,0.8)", hp: 1, score: 60 },
  "2": { fill: "#ffc65a", glow: "rgba(255,198,90,0.8)", hp: 2, score: 110 },
  "3": { fill: "#ff6b9d", glow: "rgba(255,107,157,0.8)", hp: 3, score: 200 },
  X: { fill: "#ff5f4d", glow: "rgba(255,95,77,0.95)", hp: 1, score: 150 },
};

const COLS = 12;
const BRICK_TOP = HUD_H + 34;
const BRICK_LEFT = WALL + 8;
const PLAY_W = W - BRICK_LEFT * 2;
const BRICK_W = PLAY_W / COLS;
const BRICK_H = 26;
const BRICK_GAP = 2;

// ---------------------------------------------------------------------------
// Power-ups
// ---------------------------------------------------------------------------

type PowerKind = "WIDE" | "MULTI" | "SLOW" | "LASER" | "LIFE";

const POWER_STYLE: Record<
  PowerKind,
  { label: string; color: string; weight: number }
> = {
  WIDE: { label: "W", color: "#7dfcff", weight: 28 },
  MULTI: { label: "M", color: "#b48cff", weight: 24 },
  SLOW: { label: "S", color: "#7dff9e", weight: 20 },
  LASER: { label: "L", color: "#ffd166", weight: 18 },
  LIFE: { label: "+", color: "#ff6b9d", weight: 10 },
};

const POWER_LIST = Object.keys(POWER_STYLE) as PowerKind[];

function rollPower(): PowerKind | null {
  if (Math.random() > 0.14) return null;
  const total = POWER_LIST.reduce((sum, k) => sum + POWER_STYLE[k].weight, 0);
  let ticket = Math.random() * total;
  for (const kind of POWER_LIST) {
    ticket -= POWER_STYLE[kind].weight;
    if (ticket <= 0) return kind;
  }
  return "WIDE";
}

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  stuck: boolean; // waiting on paddle to launch
}

interface Brick {
  col: number;
  row: number;
  type: string;
  hp: number;
  maxHp: number;
  alive: boolean;
  hitFlash: number;
}

interface Drop {
  x: number;
  y: number;
  vy: number;
  kind: PowerKind;
}

interface Laser {
  x: number;
  y: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

interface FloatText {
  x: number;
  y: number;
  text: string;
  life: number;
  color: string;
}

type GameState = "menu" | "playing" | "paused" | "clear" | "over";

// ---------------------------------------------------------------------------
// Game
// ---------------------------------------------------------------------------

const STORAGE_KEY = "nova-breaker-highscore";

class Game {
  state: GameState = "menu";
  score = 0;
  best = 0;
  level = 1;
  lives = 3;
  combo = 0;

  paddleW = 132;
  paddleBaseW = 132;
  paddleX = W / 2;
  paddleTargetX = W / 2;

  balls: Ball[] = [];
  bricks: Brick[] = [];
  drops: Drop[] = [];
  lasers: Laser[] = [];
  particles: Particle[] = [];
  floats: FloatText[] = [];

  wideTimer = 0;
  slowTimer = 0;
  laserTimer = 0;
  laserCooldown = 0;
  laserToShoot = false;

  shake = 0;
  keyLeft = false;
  keyRight = false;

  constructor() {
    try {
      this.best = Number(localStorage.getItem(STORAGE_KEY) ?? "0") || 0;
    } catch {
      this.best = 0;
    }
  }

  // ---- lifecycle --------------------------------------------------------

  startRun(): void {
    this.score = 0;
    this.level = 1;
    this.lives = 3;
    this.combo = 0;
    this.drops = [];
    this.lasers = [];
    this.wideTimer = this.slowTimer = this.laserTimer = 0;
    this.paddleW = this.paddleBaseW;
    this.loadLevel(this.level);
    this.state = "playing";
  }

  nextLevel(): void {
    this.level += 1;
    this.combo = 0;
    this.drops = [];
    this.lasers = [];
    this.wideTimer = this.slowTimer = this.laserTimer = 0;
    this.paddleW = this.paddleBaseW;
    this.loadLevel(this.level);
    this.state = "playing";
  }

  loadLevel(level: number): void {
    const pattern = LEVELS[(level - 1) % LEVELS.length];
    const speedBoost = Math.floor((level - 1) / LEVELS.length); // extra armor each full loop
    this.bricks = [];
    pattern.forEach((line, row) => {
      for (let col = 0; col < COLS; col++) {
        const type = line[col] ?? ".";
        if (type === ".") continue;
        let hp = BRICK_STYLE[type]?.hp ?? 1;
        if (type !== "X" && speedBoost > 0) hp += speedBoost;
        this.bricks.push({
          col,
          row,
          type,
          hp,
          maxHp: hp,
          alive: true,
          hitFlash: 0,
        });
      }
    });
    this.resetBallAndPaddle();
  }

  resetBallAndPaddle(): void {
    this.paddleX = W / 2;
    this.paddleTargetX = W / 2;
    this.balls = [this.newBall()];
  }

  newBall(): Ball {
    return {
      x: this.paddleX,
      y: H - 70,
      vx: 0,
      vy: 0,
      stuck: true,
    };
  }

  ballSpeed(): number {
    const base = 330 + (this.level - 1) * 16;
    return Math.min(base, 540);
  }

  // ---- input ------------------------------------------------------------

  pressAction(): void {
    if (this.state === "menu") {
      sound.unlock();
      this.startRun();
      return;
    }
    if (this.state === "over") {
      this.startRun();
      return;
    }
    if (this.state === "clear") {
      this.nextLevel();
      return;
    }
    if (this.state !== "playing") return;
    this.launchOrShoot();
  }

  launchOrShoot(): void {
    let launched = false;
    for (const ball of this.balls) {
      if (ball.stuck) {
        const speed = this.ballSpeed();
        const angle = rand(-0.55, 0.55) - Math.PI / 2;
        ball.vx = Math.cos(angle) * speed;
        ball.vy = Math.sin(angle) * speed;
        ball.stuck = false;
        launched = true;
      }
    }
    if (launched) sound.paddleHit();
    else if (this.laserTimer > 0 && this.laserCooldown <= 0) this.shoot();
  }

  shoot(): void {
    this.lasers.push({ x: this.paddleX - this.paddleW / 2 + 12, y: H - 64 });
    this.lasers.push({ x: this.paddleX + this.paddleW / 2 - 12, y: H - 64 });
    this.laserCooldown = 0.24;
    sound.laser();
  }

  togglePause(): void {
    if (this.state === "playing") this.state = "paused";
    else if (this.state === "paused") this.state = "playing";
  }

  // ---- simulation -------------------------------------------------------

  update(dt: number): void {
    if (this.state !== "playing") {
      this.stepParticles(dt);
      return;
    }

    // timers
    this.wideTimer = Math.max(0, this.wideTimer - dt);
    this.slowTimer = Math.max(0, this.slowTimer - dt);
    this.laserTimer = Math.max(0, this.laserTimer - dt);
    this.laserCooldown = Math.max(0, this.laserCooldown - dt);
    if (this.wideTimer === 0) this.paddleW = this.paddleBaseW;
    this.shake = Math.max(0, this.shake - dt * 40);

    // paddle: keyboard nudges the target, pointer sets it directly
    const keyStep = 620 * dt;
    if (this.keyLeft) this.paddleTargetX -= keyStep;
    if (this.keyRight) this.paddleTargetX += keyStep;
    const half = this.paddleW / 2;
    this.paddleTargetX = clamp(this.paddleTargetX, WALL + half, W - WALL - half);
    this.paddleX = this.paddleTargetX;

    const slowFactor = this.slowTimer > 0 ? 0.62 : 1;

    // balls
    let lostAny = false;
    for (const ball of this.balls) {
      if (ball.stuck) {
        ball.x = clamp(this.paddleX, WALL + 8, W - WALL - 8);
        ball.y = H - 70;
        continue;
      }
      // keep speed near target (slow-field shrinks it, restores after)
      const mag = Math.hypot(ball.vx, ball.vy) || 1;
      const target = this.ballSpeed() * slowFactor;
      const scale = target / mag;
      ball.vx *= scale;
      ball.vy *= scale;

      const steps = Math.max(1, Math.ceil((Math.hypot(ball.vx, ball.vy) * dt) / 8));
      const sub = dt / steps;
      for (let i = 0; i < steps; i++) {
        ball.x += ball.vx * sub;
        ball.y += ball.vy * sub;
        this.collideWalls(ball);
        this.collidePaddle(ball);
        this.collideBricks(ball);
        if (ball.y - 8 > H) {
          lostAny = true;
          break;
        }
        if (this.state !== "playing") return;
      }
      if (lostAny) break;
    }
    this.balls = this.balls.filter((b) => b.y - 8 <= H);

    if (this.balls.length === 0) {
      this.loseLife();
      if (this.state !== "playing") return;
    }
    if (this.laserTimer === 0) this.lasers.length = 0;

    // lasers
    for (const laser of this.lasers) {
      laser.y -= 700 * dt;
    }
    this.lasers = this.lasers.filter((l) => l.y > BRICK_TOP - 30);
    for (const laser of [...this.lasers]) {
      for (const brick of this.bricks) {
        if (!brick.alive) continue;
        const b = this.brickRect(brick);
        if (laser.x > b.x && laser.x < b.x + b.w && laser.y < b.y + b.h && laser.y > b.y) {
          this.hitBrick(brick, laser.x, laser.y);
          this.lasers = this.lasers.filter((l) => l !== laser);
          break;
        }
      }
    }

    // drops
    for (const drop of this.drops) {
      drop.y += drop.vy * dt;
      drop.vy = Math.min(drop.vy + 200 * dt, 420);
      if (
        drop.y > H - 60 &&
        drop.y < H - 34 &&
        Math.abs(drop.x - this.paddleX) < this.paddleW / 2 + 14
      ) {
        this.applyPower(drop.kind, drop.x);
        drop.y = H * 2; // consume
      }
    }
    this.drops = this.drops.filter((d) => d.y < H + 20);

    // brick flash decay + level clear check
    for (const brick of this.bricks) {
      if (brick.hitFlash > 0) brick.hitFlash = Math.max(0, brick.hitFlash - dt * 5);
    }
    this.stepParticles(dt);

    if (this.bricks.every((b) => !b.alive)) {
      this.state = "clear";
      this.score += 500 + this.level * 100;
      if (this.score > this.best) this.saveBest();
      sound.clear();
    }
  }

  stepParticles(dt: number): void {
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 420 * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const f of this.floats) {
      f.y -= 40 * dt;
      f.life -= dt;
    }
    this.floats = this.floats.filter((f) => f.life > 0);
  }

  collideWalls(ball: Ball): void {
    const r = 8;
    if (ball.x - r < WALL) {
      ball.x = WALL + r;
      ball.vx = Math.abs(ball.vx);
      sound.blip(180, 0.05, "sine", 0.05);
    } else if (ball.x + r > W - WALL) {
      ball.x = W - WALL - r;
      ball.vx = -Math.abs(ball.vx);
      sound.blip(180, 0.05, "sine", 0.05);
    }
    if (ball.y - r < HUD_H) {
      ball.y = HUD_H + r;
      ball.vy = Math.abs(ball.vy);
      sound.blip(180, 0.05, "sine", 0.05);
    }
  }

  collidePaddle(ball: Ball): void {
    const r = 8;
    const top = H - 46;
    if (ball.vy <= 0) return;
    if (ball.y + r < top || ball.y - r > top + 14) return;
    if (ball.x < this.paddleX - this.paddleW / 2 - r) return;
    if (ball.x > this.paddleX + this.paddleW / 2 + r) return;
    ball.y = top - r;
    this.combo = 0;
    const rel = clamp((ball.x - this.paddleX) / (this.paddleW / 2), -1, 1);
    const speed = Math.hypot(ball.vx, ball.vy) || this.ballSpeed();
    const angle = rel * 1.05 - Math.PI / 2; // -105° .. -75° widened by hit offset
    ball.vx = Math.cos(angle) * speed;
    ball.vy = Math.sin(angle) * speed;
    sound.paddleHit();
    this.spawnParticles(ball.x, top, 6, "#7dfcff");
  }

  brickRect(brick: Brick): { x: number; y: number; w: number; h: number } {
    return {
      x: BRICK_LEFT + brick.col * BRICK_W + BRICK_GAP,
      y: BRICK_TOP + brick.row * (BRICK_H + BRICK_GAP),
      w: BRICK_W - BRICK_GAP * 2,
      h: BRICK_H,
    };
  }

  collideBricks(ball: Ball): void {
    const r = 8;
    for (const brick of this.bricks) {
      if (!brick.alive) continue;
      const b = this.brickRect(brick);
      if (ball.x + r < b.x || ball.x - r > b.x + b.w) continue;
      if (ball.y + r < b.y || ball.y - r > b.y + b.h) continue;

      // resolve bounce axis: choose smaller penetration side
      const overlapLeft = ball.x + r - b.x;
      const overlapRight = b.x + b.w - (ball.x - r);
      const overlapTop = ball.y + r - b.y;
      const overlapBottom = b.y + b.h - (ball.y - r);
      const minHoriz = Math.min(overlapLeft, overlapRight);
      const minVert = Math.min(overlapTop, overlapBottom);
      if (minHoriz < minVert) {
        ball.vx = -ball.vx;
        ball.x += overlapLeft < overlapRight ? -minHoriz : minHoriz;
      } else {
        ball.vy = -ball.vy;
        ball.y += overlapTop < overlapBottom ? -minVert : minVert;
      }
      this.hitBrick(brick, ball.x, ball.y);
      break;
    }
  }

  hitBrick(brick: Brick, hx: number, hy: number): void {
    brick.hp -= 1;
    brick.hitFlash = 1;
    if (brick.hp > 0) {
      sound.brickHit();
      this.spawnParticles(hx, hy, 4, BRICK_STYLE[brick.type]?.fill ?? "#ffffff");
      return;
    }
    brick.alive = false;
    this.combo += 1;
    const style = BRICK_STYLE[brick.type] ?? { fill: "#ffffff", score: 50, glow: "" };
    const mult = Math.min(this.combo, 8);
    const gained = style.score * mult;
    this.score += gained;
    if (this.score > this.best) this.saveBest();
    this.floats.push({
      x: hx,
      y: hy,
      text: mult > 1 ? `+${gained} x${mult}` : `+${gained}`,
      life: 0.9,
      color: style.fill,
    });
    const rect = this.brickRect(brick);
    this.spawnParticles(
      rect.x + rect.w / 2,
      rect.y + rect.h / 2,
      14,
      style.fill,
    );
    sound.brickBreak(this.combo);

    if (brick.type === "X") {
      sound.explosion();
      this.shake = 14;
      this.spawnParticles(hx, hy, 26, "#ff8c5f");
      for (const other of this.bricks) {
        if (!other.alive || other === brick) continue;
        const o = this.brickRect(other);
        const dx = o.x + o.w / 2 - (rect.x + rect.w / 2);
        const dy = o.y + o.h / 2 - (rect.y + rect.h / 2);
        if (Math.abs(dx) <= BRICK_W * 1.5 && Math.abs(dy) <= BRICK_H * 2.5) {
          // chain via damage so armored neighbors can survive an edge hit
          other.hp -= 1;
          other.hitFlash = 1;
          if (other.hp <= 0) this.hitBrick(other, o.x + o.w / 2, o.y + o.h / 2);
        }
      }
    }

    const kind = rollPower();
    if (kind) {
      this.drops.push({
        x: rect.x + rect.w / 2,
        y: rect.y + rect.h / 2,
        vy: 140,
        kind,
      });
    }
  }

  applyPower(kind: PowerKind, x: number): void {
    sound.powerup();
    switch (kind) {
      case "WIDE":
        this.wideTimer = 12;
        this.paddleW = this.paddleBaseW * 1.5;
        break;
      case "MULTI": {
        const live = this.balls.filter((b) => !b.stuck).slice(0, 1);
        const extra: Ball[] = [];
        for (const src of live) {
          for (const dir of [-1, 1]) {
            const speed = Math.hypot(src.vx, src.vy) || this.ballSpeed();
            const angle = Math.atan2(src.vy, src.vx) + dir * 0.5;
            extra.push({
              x: src.x,
              y: src.y,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              stuck: false,
            });
          }
        }
        if (extra.length === 0) {
          // all stuck: spawn two loose balls slightly above the paddle
          for (const dir of [-1, 1]) {
            const speed = this.ballSpeed();
            const angle = -Math.PI / 2 + dir * 0.5;
            extra.push({
              x: this.paddleX + dir * 20,
              y: H - 90,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              stuck: false,
            });
          }
        }
        this.balls.push(...extra);
        break;
      }
      case "SLOW":
        this.slowTimer = 8;
        break;
      case "LASER":
        this.laserTimer = 10;
        break;
      case "LIFE":
        this.lives = Math.min(5, this.lives + 1);
        break;
    }
    this.floats.push({
      x,
      y: H - 80,
      text: POWER_STYLE[kind].label === "+" ? "+1 LIFE" : POWER_STYLE[kind].label,
      life: 1,
      color: POWER_STYLE[kind].color,
    });
  }

  loseLife(): void {
    this.lives -= 1;
    this.combo = 0;
    sound.death();
    this.shake = 18;
    if (this.lives <= 0) {
      this.state = "over";
      if (this.score > this.best) this.saveBest();
      sound.gameOver();
      return;
    }
    this.drops = [];
    this.lasers = [];
    this.wideTimer = this.slowTimer = this.laserTimer = 0;
    this.paddleW = this.paddleBaseW;
    this.resetBallAndPaddle();
  }

  saveBest(): void {
    this.best = this.score;
    try {
      localStorage.setItem(STORAGE_KEY, String(this.best));
    } catch {
      // storage unavailable — best score stays for the session only
    }
  }

  spawnParticles(x: number, y: number, count: number, color: string): void {
    for (let i = 0; i < count; i++) {
      const angle = rand(0, Math.PI * 2);
      const speed = rand(40, 260);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 60,
        life: rand(0.25, 0.7),
        maxLife: 0.7,
        size: rand(1.5, 3.5),
        color,
      });
    }
    if (this.particles.length > 400) this.particles.splice(0, this.particles.length - 400);
  }
}

const game = new Game();

// exposed for debugging and automated smoke tests
(window as unknown as { novaBreaker?: Game }).novaBreaker = game;

// ---------------------------------------------------------------------------
// Input wiring
// ---------------------------------------------------------------------------

const btnPause = document.getElementById("btnPause") as HTMLButtonElement;
const btnSound = document.getElementById("btnSound") as HTMLButtonElement;
const btnRestart = document.getElementById("btnRestart") as HTMLButtonElement;

btnPause.addEventListener("click", () => game.togglePause());
btnSound.addEventListener("click", () => {
  sound.unlock();
  sound.muted = !sound.muted;
  btnSound.textContent = sound.muted ? "Sound: Off (M)" : "Sound: On (M)";
});
btnRestart.addEventListener("click", () => {
  sound.unlock();
  game.startRun();
});

window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  switch (e.key) {
    case "ArrowLeft":
    case "a":
    case "A":
      game.keyLeft = true;
      e.preventDefault();
      break;
    case "ArrowRight":
    case "d":
    case "D":
      game.keyRight = true;
      e.preventDefault();
      break;
    case " ":
    case "Enter":
      sound.unlock();
      game.pressAction();
      e.preventDefault();
      break;
    case "p":
    case "P":
      game.togglePause();
      break;
    case "m":
    case "M":
      btnSound.click();
      break;
    case "r":
    case "R":
      sound.unlock();
      game.startRun();
      break;
  }
});
window.addEventListener("keyup", (e) => {
  if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") game.keyLeft = false;
  if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") game.keyRight = false;
});

function pointerToGameX(clientX: number): number {
  const rect = canvas.getBoundingClientRect();
  return clamp(((clientX - rect.left) / rect.width) * W, 0, W);
}

canvas.addEventListener("pointermove", (e) => {
  if (game.state === "playing" || game.state === "paused") {
    game.paddleTargetX = pointerToGameX(e.clientX);
  }
});
canvas.addEventListener("pointerdown", (e) => {
  sound.unlock();
  if (game.state === "playing" || game.state === "menu" || game.state === "over" || game.state === "clear") {
    game.paddleTargetX = pointerToGameX(e.clientX);
  }
  game.pressAction();
  e.preventDefault();
});

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function drawBackground(): void {
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#0b1030");
  grad.addColorStop(0.55, "#090d22");
  grad.addColorStop(1, "#05070f");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // faint grid
  ctx.strokeStyle = "rgba(120,150,255,0.05)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = WALL; x <= W - WALL; x += 40) {
    ctx.moveTo(x, HUD_H);
    ctx.lineTo(x, H);
  }
  for (let y = HUD_H; y <= H; y += 40) {
    ctx.moveTo(WALL, y);
    ctx.lineTo(W - WALL, y);
  }
  ctx.stroke();

  // neon frame
  ctx.shadowColor = "rgba(125,252,255,0.7)";
  ctx.shadowBlur = 12;
  ctx.strokeStyle = "rgba(125,252,255,0.45)";
  ctx.lineWidth = 2;
  ctx.strokeRect(WALL / 2, WALL / 2, W - WALL, H - WALL / 2);
  ctx.shadowBlur = 0;
}

function drawHud(): void {
  ctx.textBaseline = "middle";
  ctx.font = "600 18px 'Segoe UI', system-ui, sans-serif";

  ctx.fillStyle = "#7dfcff";
  ctx.textAlign = "left";
  ctx.fillText(`SCORE ${String(game.score).padStart(6, "0")}`, 24, 28);

  ctx.fillStyle = "#8ea0d8";
  ctx.font = "500 15px 'Segoe UI', system-ui, sans-serif";
  ctx.fillText(`BEST ${String(game.best).padStart(6, "0")}`, 220, 29);

  ctx.fillStyle = "#b48cff";
  ctx.font = "600 18px 'Segoe UI', system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`SECTOR ${((game.level - 1) % LEVELS.length) + 1}·${Math.ceil(game.level / LEVELS.length)}`, W / 2, 28);

  const comboMult = Math.min(game.combo, 8);
  if (comboMult > 1) {
    ctx.fillStyle = "#ffd166";
    ctx.fillText(`COMBO x${comboMult}`, W / 2, 46);
  }

  // lives as little paddles, right-aligned
  ctx.textAlign = "right";
  ctx.fillStyle = "#57e6ff";
  ctx.font = "600 14px 'Segoe UI', system-ui, sans-serif";
  ctx.fillText("LIVES", W - 24 - game.lives * 34, 28);
  for (let i = 0; i < game.lives; i++) {
    const x = W - 30 - i * 34;
    ctx.shadowColor = "rgba(87,230,255,0.8)";
    ctx.shadowBlur = 6;
    ctx.fillStyle = "#57e6ff";
    rrect(x - 26, 22, 26, 8, 4);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // active power-up timers, small pills bottom-left
  const active: string[] = [];
  if (game.wideTimer > 0) active.push(`W ${game.wideTimer.toFixed(1)}`);
  if (game.slowTimer > 0) active.push(`S ${game.slowTimer.toFixed(1)}`);
  if (game.laserTimer > 0) active.push(`L ${game.laserTimer.toFixed(1)}`);
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(200,215,255,0.8)";
  ctx.font = "500 12px 'Segoe UI', system-ui, sans-serif";
  ctx.fillText(active.join("   "), 24, H - 16);
}

function drawBricks(): void {
  for (const brick of game.bricks) {
    if (!brick.alive) continue;
    const b = game.brickRect(brick);
    const style = BRICK_STYLE[brick.type] ?? BRICK_STYLE["1"];
    const damaged = brick.hp < brick.maxHp;
    ctx.shadowColor = style.glow;
    ctx.shadowBlur = brick.type === "X" ? 14 : 8;
    ctx.fillStyle = damaged ? shade(style.fill) : style.fill;
    rrect(b.x, b.y, b.w, b.h, 5);
    ctx.fill();
    ctx.shadowBlur = 0;
    if (brick.hitFlash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${brick.hitFlash * 0.55})`;
      rrect(b.x, b.y, b.w, b.h, 5);
      ctx.fill();
    }
    // armored bricks show remaining hit pips
    if (brick.maxHp > 1) {
      ctx.fillStyle = "rgba(10,14,30,0.65)";
      for (let i = 0; i < brick.hp; i++) {
        ctx.beginPath();
        ctx.arc(b.x + 10 + i * 10, b.y + b.h / 2, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

const shadeCache = new Map<string, string>();

function shade(color: string): string {
  const cached = shadeCache.get(color);
  if (cached) return cached;
  const m = color.match(/^#([0-9a-f]{6})$/i);
  if (!m) return color;
  const n = parseInt(m[1], 16);
  const dims = [Math.round(((n >> 16) & 255) * 0.55), Math.round(((n >> 8) & 255) * 0.55), Math.round((n & 255) * 0.55)];
  const out = `#${dims.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
  shadeCache.set(color, out);
  return out;
}

function drawPaddle(): void {
  const half = game.paddleW / 2;
  const y = H - 46;
  const color = game.laserTimer > 0 ? "#ffd166" : "#7dfcff";
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  const grad = ctx.createLinearGradient(0, y, 0, y + 14);
  grad.addColorStop(0, color);
  grad.addColorStop(1, shade(color));
  ctx.fillStyle = grad;
  rrect(game.paddleX - half, y, game.paddleW, 14, 7);
  ctx.fill();
  ctx.shadowBlur = 0;
  if (game.laserTimer > 0) {
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillRect(game.paddleX - half + 9, y - 4, 5, 4);
    ctx.fillRect(game.paddleX + half - 14, y - 4, 5, 4);
  }
}

function drawBalls(): void {
  for (const ball of game.balls) {
    ctx.shadowColor = "#ffffff";
    ctx.shadowBlur = 16;
    ctx.fillStyle = game.slowTimer > 0 ? "#7dff9e" : "#ffffff";
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

function drawDrops(): void {
  for (const drop of game.drops) {
    const style = POWER_STYLE[drop.kind];
    ctx.shadowColor = style.color;
    ctx.shadowBlur = 10;
    ctx.fillStyle = style.color;
    rrect(drop.x - 14, drop.y - 10, 28, 20, 6);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#0a0f24";
    ctx.font = "700 13px 'Segoe UI', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(style.label, drop.x, drop.y + 1);
  }
}

function drawLasers(): void {
  ctx.shadowColor = "#ffd166";
  ctx.shadowBlur = 8;
  ctx.fillStyle = "#fff3c4";
  for (const laser of game.lasers) {
    ctx.fillRect(laser.x - 1.5, laser.y, 3, 16);
  }
  ctx.shadowBlur = 0;
}

function drawParticles(): void {
  for (const p of game.particles) {
    ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
  for (const f of game.floats) {
    ctx.globalAlpha = clamp(f.life, 0, 1);
    ctx.fillStyle = f.color;
    ctx.font = "700 15px 'Segoe UI', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

function overlayBox(lines: { text: string; size: number; color: string; gapAfter?: number }[]): void {
  ctx.fillStyle = "rgba(5,8,20,0.78)";
  ctx.fillRect(0, 0, W, H);
  let y = H / 2 - (lines.length * 30) / 2;
  for (const line of lines) {
    ctx.fillStyle = line.color;
    ctx.font = `${line.size >= 40 ? 800 : 600} ${line.size}px 'Segoe UI', system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (line.size >= 40) {
      ctx.shadowColor = line.color;
      ctx.shadowBlur = 24;
    }
    ctx.fillText(line.text, W / 2, y);
    ctx.shadowBlur = 0;
    y += line.size + (line.gapAfter ?? 10) + 12;
  }
}

function drawOverlay(): void {
  if (game.state === "menu") {
    overlayBox([
      { text: "NOVA BREAKER", size: 46, color: "#7dfcff", gapAfter: 6 },
      { text: "DEEMANNIE'S DIGITAL · ARCADE WING", size: 14, color: "#8ea0d8", gapAfter: 18 },
      { text: "Mouse / touch / ← → move the paddle", size: 16, color: "#e7ecff" },
      { text: "SPACE or click to launch · P pause · M mute · R restart", size: 16, color: "#e7ecff" },
      { text: "Clear all bricks to jump to the next sector", size: 16, color: "#e7ecff" },
      { text: "Catch capsules: W wide · M multi · S slow · L laser · + life", size: 15, color: "#b48cff", gapAfter: 22 },
      { text: "PRESS SPACE / TAP TO START", size: 20, color: "#ffd166" },
    ]);
  } else if (game.state === "paused") {
    overlayBox([
      { text: "PAUSED", size: 40, color: "#7dfcff", gapAfter: 14 },
      { text: "P or click Pause to resume", size: 17, color: "#e7ecff" },
    ]);
  } else if (game.state === "clear") {
    overlayBox([
      { text: `SECTOR ${game.level} CLEAN`, size: 40, color: "#7dff9e", gapAfter: 10 },
      { text: `+${500 + game.level * 100} sector bonus — score ${game.score}`, size: 17, color: "#e7ecff", gapAfter: 16 },
      { text: "SPACE / TAP for the next sector", size: 20, color: "#ffd166" },
    ]);
  } else if (game.state === "over") {
    overlayBox([
      { text: "SIGNAL LOST", size: 44, color: "#ff6b9d", gapAfter: 10 },
      { text: `Final score ${game.score}${game.score >= game.best && game.score > 0 ? "  ·  NEW BEST!" : `  ·  best ${game.best}`}`, size: 18, color: "#e7ecff", gapAfter: 18 },
      { text: "SPACE / TAP to run it back", size: 20, color: "#ffd166" },
    ]);
  }
}

function render(): void {
  ctx.save();
  if (game.shake > 0 && game.state !== "over") {
    ctx.translate(rand(-game.shake, game.shake) * 0.5, rand(-game.shake, game.shake) * 0.5);
  }
  drawBackground();
  if (game.state !== "menu") {
    drawBricks();
    drawDrops();
    drawLasers();
    drawPaddle();
    drawBalls();
    drawHud();
  }
  drawParticles();
  ctx.restore();
  drawOverlay();
}

// ---------------------------------------------------------------------------
// Main loop — fixed timestep for stable physics
// ---------------------------------------------------------------------------

let last = performance.now();
let acc = 0;
const STEP = 1 / 120;

function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  acc += dt;
  while (acc >= STEP) {
    game.update(STEP);
    acc -= STEP;
  }
  render();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
