import { Sfx } from "@/game/audio";
import { bestScore, loadSettings, saveSettings } from "@/game/scores";
import { PALETTE, type ControlsProbe, type EnemyKind, type Hud, type Phase, type PickupKind } from "@/game/types";

const STEP = 1 / 60;
const MAX_HP = 100;

type Bullet = {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  friendly: boolean;
  dmg: number;
};

type Enemy = {
  active: boolean;
  kind: EnemyKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  r: number;
  speed: number;
  score: number;
  shootCd: number;
  phase: number;
  hurt: number;
};

type Pickup = {
  active: boolean;
  kind: PickupKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
};

type Particle = {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
};

type Floater = {
  active: boolean;
  x: number;
  y: number;
  text: string;
  life: number;
  max: number;
  color: string;
};

type Star = {
  nx: number;
  ny: number;
  layer: 0 | 1 | 2;
  r: number;
  a: number;
  tw: number;
  color: string;
};

const STATS: Record<EnemyKind, { hp: number; speed: number; r: number; score: number; cd: number }> = {
  scout: { hp: 3, speed: 82, r: 16, score: 100, cd: 2.05 },
  dart: { hp: 2, speed: 168, r: 13, score: 150, cd: 99 },
  weaver: { hp: 4, speed: 112, r: 15, score: 220, cd: 1.65 },
  bruiser: { hp: 10, speed: 54, r: 24, score: 420, cd: 2.25 },
  ace: { hp: 20, speed: 74, r: 30, score: 1200, cd: 1.3 },
};

function makePool<T>(n: number, create: () => T): T[] {
  return Array.from({ length: n }, create);
}

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

export class Engine {
  private ctx: CanvasRenderingContext2D;
  private audio = new Sfx();
  private raf = 0;
  private last = 0;
  private acc = 0;
  private time = 0;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private reduceMotion = false;

  private phase: Phase = "title";
  private keys = new Set<string>();
  private keysOverride: Set<string> | null = null;
  private steerOverride: number | null = null;
  private keyboardUntil = 0;
  private pointer = {
    x: 0,
    y: 0,
    ox: 0,
    oy: 0,
    down: false,
    dragged: false,
    seen: false,
    button: 0,
    type: "mouse",
  };
  private stickX = 0;
  private stickY = 0;
  private fireHeld = false;

  private player = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    aim: -Math.PI / 2,
    r: 15,
    invuln: 0,
    fireCd: 0,
    flash: 0,
    recoil: 0,
  };

  private hp = MAX_HP;
  private score = 0;
  private best = 0;
  private wave = 1;
  private combo = 0;
  private comboT = 0;
  private shieldHits = 0;
  private shieldT = 0;
  private multi = 0;
  private multiT = 0;
  private boostT = 0;
  private banner = "";
  private bannerT = 0;
  private spawnLeft = 0;
  private spawnTimer = 0;
  private pendingAce = false;
  private clearArmed = false;
  private clearTimer = 0;
  private trauma = 0;
  private hitstop = 0;
  private aftermath = 0;
  private shotsFired = 0;
  private hitLog: number[] = [];
  private shakeOn = true;
  private killCount = 0;
  private lastEmit = "";

  private bullets: Bullet[] = [];
  private enemies: Enemy[] = [];
  private pickups: Pickup[] = [];
  private particles: Particle[] = [];
  private floaters: Floater[] = [];
  private stars: Star[] = [];
  private starOx = [0, 0, 0];
  private starOy = [0, 0, 0];

  private onKeyDown!: (e: KeyboardEvent) => void;
  private onKeyUp!: (e: KeyboardEvent) => void;
  private onBlur!: () => void;
  private onVis!: () => void;
  private onResize!: () => void;
  private onContext!: (e: Event) => void;
  private onPointerDown!: (e: PointerEvent) => void;
  private onPointerMove!: (e: PointerEvent) => void;
  private onPointerUp!: (e: PointerEvent) => void;

  constructor(
    private canvas: HTMLCanvasElement,
    private onHud: (hud: Hud) => void,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("无法创建画布");
    this.ctx = ctx;
    this.reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const settings = loadSettings();
    this.audio.muted = settings.mute;
    this.shakeOn = settings.shake ?? !this.reduceMotion;
    this.best = bestScore();
    this.seedStars();
    this.pool();
    this.bind(canvas);
    this.resize();
    this.player.x = this.w * 0.5;
    this.player.y = this.h * 0.62;
    this.installProbe();
    this.emit();
    this.render();
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("visibilitychange", this.onVis);
    window.removeEventListener("resize", this.onResize);
    this.canvas.removeEventListener("contextmenu", this.onContext);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
    if (window.__controlsTest) delete window.__controlsTest;
  }

  unlock(): void {
    this.audio.unlock();
  }

  startRun(): void {
    this.audio.unlock();
    this.clearWorld();
    this.phase = "playing";
    this.hp = MAX_HP;
    this.score = 0;
    this.combo = 0;
    this.comboT = 0;
    this.shieldHits = 0;
    this.shieldT = 0;
    this.multi = 0;
    this.multiT = 0;
    this.boostT = 0;
    this.killCount = 0;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.aim = -Math.PI / 2;
    this.player.invuln = 1.15;
    this.player.fireCd = 0.2;
    this.player.x = this.w * 0.5;
    this.player.y = this.h * 0.58;
    this.best = bestScore();
    this.startWave(1);
    this.emit();
  }

  toTitle(): void {
    this.phase = "title";
    this.clearWorld();
    this.banner = "";
    this.pointer.down = false;
    this.emit();
  }

  togglePause(): void {
    if (this.phase === "playing") this.phase = "paused";
    else if (this.phase === "paused") this.phase = "playing";
    this.audio.playUi();
    this.emit();
  }

  pauseForMenu(): void {
    if (this.phase === "playing") this.phase = "paused";
    this.emit();
  }

  setMuted(muted: boolean): void {
    this.audio.unlock();
    this.audio.setMuted(muted);
    saveSettings({ mute: muted, shake: this.shakeOn });
    this.emit();
  }

  setShake(shake: boolean): void {
    this.shakeOn = shake;
    saveSettings({ mute: this.audio.muted, shake });
    this.emit();
  }

  setStick(x: number, y: number): void {
    this.stickX = x;
    this.stickY = y;
  }

  setFireHeld(held: boolean): void {
    this.fireHeld = held;
    if (held) this.audio.unlock();
  }

  setBest(score: number): void {
    this.best = score;
    this.emit();
  }

  private installProbe(): void {
    const qa =
      import.meta.env.DEV || new URLSearchParams(window.location.search).has("qa");
    if (!qa) return;
    const probe: ControlsProbe = {
      getYaw: () => this.player.aim,
      getSpeed: () => Math.hypot(this.player.vx, this.player.vy),
      getPos: () => ({ x: this.player.x, y: this.player.y }),
      setSteer: (v) => {
        this.steerOverride = v;
      },
      setKeys: (codes) => {
        this.keysOverride = new Set(codes);
      },
      getShots: () => this.shotsFired,
      getPhase: () => this.phase,
      getScore: () => this.score,
      getHp: () => this.hp,
      getHits: () => this.hitLog.slice(),
    };
    window.__controlsTest = probe;
  }

  private bind(canvas: HTMLCanvasElement): void {
    this.onKeyDown = (e) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
      this.audio.unlock();
      if (e.code === "KeyP" || e.code === "Escape") {
        if (this.phase === "playing" || this.phase === "paused") this.togglePause();
        return;
      }
      if ((e.code === "Enter" || e.code === "Space") && this.phase === "title") {
        this.startRun();
        return;
      }
      this.keys.add(e.code);
    };
    this.onKeyUp = (e) => {
      this.keys.delete(e.code);
    };
    this.onBlur = () => {
      this.keys.clear();
      this.fireHeld = false;
      this.pointer.down = false;
    };
    this.onVis = () => {
      if (document.hidden && this.phase === "playing") {
        this.phase = "paused";
        this.emit();
      }
      this.audio.resume();
    };
    this.onResize = () => this.resize();
    this.onContext = (e) => e.preventDefault();
    const pos = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      this.pointer.x = e.clientX - r.left;
      this.pointer.y = e.clientY - r.top;
      this.pointer.seen = true;
      this.pointer.type = e.pointerType || "mouse";
    };
    this.onPointerDown = (e) => {
      if (this.phase !== "playing") return;
      canvas.setPointerCapture(e.pointerId);
      pos(e);
      this.pointer.down = true;
      this.pointer.button = e.button;
      this.pointer.dragged = false;
      this.pointer.ox = this.pointer.x;
      this.pointer.oy = this.pointer.y;
      this.audio.unlock();
    };
    this.onPointerMove = (e) => {
      pos(e);
      if (!this.pointer.down) return;
      const d = Math.hypot(this.pointer.x - this.pointer.ox, this.pointer.y - this.pointer.oy);
      if (d > 8) this.pointer.dragged = true;
    };
    this.onPointerUp = (e) => {
      pos(e);
      this.pointer.down = false;
      this.pointer.dragged = false;
    };
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("visibilitychange", this.onVis);
    window.addEventListener("resize", this.onResize);
    canvas.addEventListener("contextmenu", this.onContext);
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(1, rect.width);
    this.h = Math.max(1, rect.height);
    this.canvas.width = Math.max(1, Math.round(this.w * this.dpr));
    this.canvas.height = Math.max(1, Math.round(this.h * this.dpr));
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.phase === "playing") {
      this.player.x = clamp(this.player.x, 24, this.w - 24);
      this.player.y = clamp(this.player.y, 24, this.h - 24);
    }
  }

  private pool(): void {
    this.bullets = makePool(180, () => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      r: 3.2,
      life: 0,
      friendly: true,
      dmg: 1,
    }));
    this.enemies = makePool(40, () => ({
      active: false,
      kind: "scout" as EnemyKind,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      hp: 1,
      maxHp: 1,
      r: 16,
      speed: 80,
      score: 100,
      shootCd: 2,
      phase: 0,
      hurt: 0,
    }));
    this.pickups = makePool(12, () => ({
      active: false,
      kind: "multi" as PickupKind,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 12,
    }));
    this.particles = makePool(420, () => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      max: 1,
      size: 2,
      color: PALETTE.ice,
    }));
    this.floaters = makePool(24, () => ({
      active: false,
      x: 0,
      y: 0,
      text: "",
      life: 0,
      max: 1,
      color: PALETTE.prize,
    }));
  }

  private seedStars(): void {
    const colors = [PALETTE.ice, PALETTE.ice, PALETTE.flare, PALETTE.prize];
    const push = (n: number, layer: 0 | 1 | 2, r0: number, r1: number, a: number) => {
      for (let i = 0; i < n; i++) {
        this.stars.push({
          nx: Math.random(),
          ny: Math.random(),
          layer,
          r: r0 + Math.random() * (r1 - r0),
          a: a * (0.55 + Math.random() * 0.45),
          tw: 0.6 + Math.random() * 2.2,
          color: colors[Math.floor(Math.random() * colors.length)] ?? PALETTE.ice,
        });
      }
    };
    push(80, 0, 0.4, 1.1, 0.45);
    push(46, 1, 0.8, 1.5, 0.7);
    push(22, 2, 1.2, 2.1, 0.95);
  }

  private clearWorld(): void {
    for (const b of this.bullets) b.active = false;
    for (const e of this.enemies) e.active = false;
    for (const p of this.pickups) p.active = false;
    for (const p of this.particles) p.active = false;
    for (const f of this.floaters) f.active = false;
    this.spawnLeft = 0;
    this.pendingAce = false;
    this.clearArmed = false;
  }

  private frame = (now: number): void => {
    if (!this.last) this.last = now;
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.1) dt = 0.1;
    if (dt < 0) dt = 0;

    if (this.hitstop > 0) {
      this.hitstop -= dt;
      this.render();
      this.raf = requestAnimationFrame(this.frame);
      return;
    }

    this.time += dt;
    if (this.phase === "playing") {
      this.acc += dt;
      let guard = 0;
      while (this.acc >= STEP && guard++ < 5) {
        this.step(STEP);
        this.acc -= STEP;
      }
    } else {
      this.acc = 0;
      if (this.phase === "title" || this.phase === "paused") this.idleDrift(dt);
      if (this.phase === "over" && this.aftermath > 0) {
        this.decayFx(dt);
        this.aftermath -= dt;
      }
    }
    this.render();
    this.emit();
    this.raf = requestAnimationFrame(this.frame);
  };

  private idleDrift(dt: number): void {
    this.starOx[0] += dt * 0.004;
    this.starOx[1] += dt * 0.009;
    this.starOx[2] += dt * 0.015;
    this.starOy[1] += dt * 0.002;
  }

  private step(dt: number): void {
    const input = this.readControl();
    this.stepPlayer(dt, input);
    this.stepEnemies(dt);
    this.stepBullets(dt);
    this.stepPickups(dt);
    this.collide();
    this.updateSpawns(dt);
    this.maybeAdvance(dt);
    this.decayFx(dt);
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.banner = "";
    }
    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) this.combo = 0;
    }
    if (this.shieldT > 0) {
      this.shieldT -= dt;
      if (this.shieldT <= 0) this.shieldHits = 0;
    }
    if (this.multiT > 0) {
      this.multiT -= dt;
      if (this.multiT <= 0) this.multi = 0;
    }
    if (this.boostT > 0) this.boostT -= dt;
    const parallax = [0.08, 0.18, 0.4];
    for (let i = 0; i < 3; i++) {
      this.starOx[i] -= (this.player.vx * dt * parallax[i]) / Math.max(this.w, 1);
      this.starOy[i] -= (this.player.vy * dt * parallax[i]) / Math.max(this.h, 1);
    }
    if (this.trauma > 0) this.trauma = Math.max(0, this.trauma - dt * 1.5);
  }

  private readControl(): { x: number; y: number; aimTo: number | null; fire: boolean; thrust: boolean } {
    const keys = this.keysOverride ?? this.keys;
    let x = 0;
    let y = 0;
    if (keys.has("KeyA") || keys.has("ArrowLeft")) x -= 1;
    if (keys.has("KeyD") || keys.has("ArrowRight")) x += 1;
    if (keys.has("KeyW") || keys.has("ArrowUp")) y -= 1;
    if (keys.has("KeyS") || keys.has("ArrowDown")) y += 1;
    if (this.steerOverride != null) x -= this.steerOverride;
    const keyActive = Math.hypot(x, y) > 0.01 || this.steerOverride != null;
    if (keyActive) this.keyboardUntil = performance.now() + 2500;
    x += this.stickX;
    y += this.stickY;
    const manual = Math.hypot(x, y) > 0.08 || performance.now() < this.keyboardUntil;

    let pointerDriving = false;
    const touch = this.pointer.type === "touch";
    const allowPointer = touch ? this.pointer.down : this.pointer.down && this.pointer.dragged;
    if (!manual && allowPointer) {
      const dx = this.pointer.x - this.player.x;
      const dy = this.pointer.y - this.player.y;
      const d = Math.hypot(dx, dy);
      if (d > 40) {
        const mag = Math.min(1, (d - 40) / 110);
        x = (dx / d) * mag;
        y = (dy / d) * mag;
        pointerDriving = true;
      }
    }

    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }

    let aimTo: number | null = null;
    const mouseAim = this.pointer.seen && this.pointer.type !== "touch";
    if (mouseAim && !pointerDriving) {
      aimTo = Math.atan2(this.pointer.y - this.player.y, this.pointer.x - this.player.x);
    } else if (len > 0.2) {
      aimTo = Math.atan2(y, x);
    } else if (this.fireHeld || keys.has("Space")) {
      const near = this.nearestEnemy(520);
      if (near) aimTo = Math.atan2(near.y - this.player.y, near.x - this.player.x);
    }

    const mouseDown = this.pointer.down && this.pointer.type !== "touch" && this.pointer.button === 0;
    const fire = keys.has("Space") || this.fireHeld || mouseDown || (pointerDriving && touch);
    return { x, y, aimTo, fire, thrust: len > 0.08 };
  }

  private stepPlayer(
    dt: number,
    input: { x: number; y: number; aimTo: number | null; fire: boolean; thrust: boolean },
  ): void {
    const boosted = this.boostT > 0;
    const accel = boosted ? 1950 : 1480;
    const max = boosted ? 470 : 330;
    this.player.vx += input.x * accel * dt;
    this.player.vy += input.y * accel * dt;
    const drag = Math.exp(-3.5 * dt);
    this.player.vx *= drag;
    this.player.vy *= drag;
    const sp = Math.hypot(this.player.vx, this.player.vy);
    if (sp > max) {
      this.player.vx = (this.player.vx / sp) * max;
      this.player.vy = (this.player.vy / sp) * max;
    }
    this.player.x += this.player.vx * dt;
    this.player.y += this.player.vy * dt;
    const pad = this.player.r + 6;
    if (this.player.x < pad) {
      this.player.x = pad;
      this.player.vx = 0;
    } else if (this.player.x > this.w - pad) {
      this.player.x = this.w - pad;
      this.player.vx = 0;
    }
    if (this.player.y < pad) {
      this.player.y = pad;
      this.player.vy = 0;
    } else if (this.player.y > this.h - pad) {
      this.player.y = this.h - pad;
      this.player.vy = 0;
    }

    if (input.aimTo != null) {
      const diff = Math.atan2(
        Math.sin(input.aimTo - this.player.aim),
        Math.cos(input.aimTo - this.player.aim),
      );
      this.player.aim += diff * (1 - Math.exp(-14 * dt));
    }
    if (this.player.invuln > 0) this.player.invuln -= dt;
    if (this.player.flash > 0) this.player.flash -= dt;
    if (this.player.recoil > 0) this.player.recoil *= Math.exp(-12 * dt);
    if (this.player.fireCd > 0) this.player.fireCd -= dt;

    if (input.fire && this.player.fireCd <= 0 && this.hp > 0) this.fire();

    if (input.thrust && Math.random() < 0.85) {
      const back = this.player.aim + Math.PI;
      const spread = (Math.random() - 0.5) * 0.5;
      this.spawnParticle(
        this.player.x + Math.cos(back) * 14,
        this.player.y + Math.sin(back) * 14,
        Math.cos(back + spread) * (70 + Math.random() * 50) + this.player.vx * 0.15,
        Math.sin(back + spread) * (70 + Math.random() * 50) + this.player.vy * 0.15,
        boosted ? PALETTE.prize : PALETTE.flare,
        0.22,
        2 + Math.random() * 1.6,
      );
    }
  }

  private fire(): void {
    const n = 1 + this.multi * 2;
    const step = 0.16;
    const start = -step * ((n - 1) / 2);
    const nose = 20;
    const speed = 700;
    for (let i = 0; i < n; i++) {
      const ang = this.player.aim + start + i * step;
      const b = this.alloc(this.bullets);
      if (!b) break;
      b.active = true;
      b.friendly = true;
      b.dmg = 1;
      b.r = 3.3;
      b.life = 0.9;
      b.x = this.player.x + Math.cos(ang) * nose;
      b.y = this.player.y + Math.sin(ang) * nose;
      b.vx = Math.cos(ang) * speed;
      b.vy = Math.sin(ang) * speed;
    }
    this.player.fireCd = this.multi >= 2 ? 0.11 : 0.135;
    this.player.flash = 0.055;
    this.player.recoil = 7;
    this.shotsFired += 1;
    this.trauma = Math.min(1, this.trauma + 0.045);
    this.audio.playShoot();
    for (let i = 0; i < 4; i++) {
      const a = this.player.aim + (Math.random() - 0.5) * 0.8;
      this.spawnParticle(
        this.player.x + Math.cos(this.player.aim) * 18,
        this.player.y + Math.sin(this.player.aim) * 18,
        Math.cos(a) * (80 + Math.random() * 120),
        Math.sin(a) * (80 + Math.random() * 120),
        i % 2 ? PALETTE.ice : PALETTE.flare,
        0.12,
        2,
      );
    }
  }

  private stepEnemies(dt: number): void {
    const px = this.player.x;
    const py = this.player.y;
    for (const e of this.enemies) {
      if (!e.active) continue;
      let dx = px - e.x;
      let dy = py - e.y;
      let dist = Math.hypot(dx, dy) || 1;
      let ux = dx / dist;
      let uy = dy / dist;
      if (e.kind === "dart") {
        const side = Math.sin(this.time * 5.5 + e.phase);
        const sx = -uy * side * 0.95;
        const sy = ux * side * 0.95;
        ux = ux * 0.55 + sx;
        uy = uy * 0.55 + sy;
        const l = Math.hypot(ux, uy) || 1;
        ux /= l;
        uy /= l;
      } else if (e.kind === "weaver") {
        e.phase += dt * 1.5;
        const tx = px + Math.cos(e.phase) * 150;
        const ty = py + Math.sin(e.phase) * 110;
        dx = tx - e.x;
        dy = ty - e.y;
        dist = Math.hypot(dx, dy) || 1;
        ux = dx / dist;
        uy = dy / dist;
      } else if (e.kind === "ace" && dist < 190) {
        ux = -ux;
        uy = -uy;
      }

      let sepX = 0;
      let sepY = 0;
      for (const o of this.enemies) {
        if (!o.active || o === e) continue;
        const ox = e.x - o.x;
        const oy = e.y - o.y;
        const d = Math.hypot(ox, oy);
        if (d > 0 && d < e.r + o.r + 22) {
          sepX += ox / d;
          sepY += oy / d;
        }
      }
      const speedScale = 1 + (this.wave - 1) * 0.03;
      const desiredX = ux * e.speed * speedScale + sepX * 46;
      const desiredY = uy * e.speed * speedScale + sepY * 46;
      const k = 1 - Math.exp(-3.2 * dt);
      e.vx += (desiredX - e.vx) * k;
      e.vy += (desiredY - e.vy) * k;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      const m = e.r + 2;
      if (e.x < m) {
        e.x = m;
        e.vx = Math.abs(e.vx);
      } else if (e.x > this.w - m) {
        e.x = this.w - m;
        e.vx = -Math.abs(e.vx);
      }
      if (e.y < m) {
        e.y = m;
        e.vy = Math.abs(e.vy);
      } else if (e.y > this.h - m) {
        e.y = this.h - m;
        e.vy = -Math.abs(e.vy);
      }
      if (e.hurt > 0) e.hurt -= dt;
      if (e.kind !== "dart") {
        e.shootCd -= dt;
        if (e.shootCd <= 0 && dist < 640) {
          this.enemyShoot(e);
          const base = STATS[e.kind].cd * Math.max(0.58, 1 - (this.wave - 1) * 0.03);
          e.shootCd = base;
        }
      }
    }
  }

  private enemyShoot(e: Enemy): void {
    const ang = Math.atan2(this.player.y - e.y, this.player.x - e.x);
    const volleys = e.kind === "ace" ? 5 : e.kind === "bruiser" ? 3 : 1;
    const spread = e.kind === "ace" ? 0.22 : 0.28;
    const speed = e.kind === "bruiser" ? 200 : e.kind === "ace" ? 250 : 230;
    const start = -spread * ((volleys - 1) / 2);
    for (let i = 0; i < volleys; i++) {
      const a = ang + start + i * spread;
      const b = this.alloc(this.bullets);
      if (!b) return;
      b.active = true;
      b.friendly = false;
      b.dmg = e.kind === "ace" ? 16 : 13;
      b.r = e.kind === "ace" ? 5 : 4.4;
      b.life = 3.2;
      b.x = e.x + Math.cos(a) * (e.r + 4);
      b.y = e.y + Math.sin(a) * (e.r + 4);
      b.vx = Math.cos(a) * speed;
      b.vy = Math.sin(a) * speed;
    }
  }

  private stepBullets(dt: number): void {
    for (const b of this.bullets) {
      if (!b.active) continue;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (
        b.life <= 0 ||
        b.x < -50 ||
        b.y < -50 ||
        b.x > this.w + 50 ||
        b.y > this.h + 50
      ) {
        b.active = false;
      }
    }
  }

  private stepPickups(dt: number): void {
    for (const p of this.pickups) {
      if (!p.active) continue;
      const dx = this.player.x - p.x;
      const dy = this.player.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d < 120 && d > 0.01) {
        p.vx += (dx / d) * 520 * dt;
        p.vy += (dy / d) * 520 * dt;
      }
      p.vx *= Math.exp(-2.2 * dt);
      p.vy *= Math.exp(-2.2 * dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) p.active = false;
      if (d < this.player.r + 18) this.collect(p);
    }
  }

  private collide(): void {
    const pr = this.player.r;
    for (const b of this.bullets) {
      if (!b.active || !b.friendly) continue;
      for (const e of this.enemies) {
        if (!e.active) continue;
        const dx = b.x - e.x;
        const dy = b.y - e.y;
        const rr = b.r + e.r;
        if (dx * dx + dy * dy <= rr * rr) {
          b.active = false;
          this.damageEnemy(e, b.dmg);
          break;
        }
      }
    }
    for (const b of this.bullets) {
      if (!b.active || b.friendly) continue;
      const dx = b.x - this.player.x;
      const dy = b.y - this.player.y;
      const rr = b.r + pr - 2;
      if (dx * dx + dy * dy <= rr * rr) {
        b.active = false;
        this.hurt(b.dmg);
      }
    }
    for (const e of this.enemies) {
      if (!e.active) continue;
      const dx = this.player.x - e.x;
      const dy = this.player.y - e.y;
      const dist = Math.hypot(dx, dy);
      const min = e.r + pr;
      if (dist < min && dist > 0.01) {
        const overlap = min - dist;
        const nx = dx / dist;
        const ny = dy / dist;
        this.player.x += nx * overlap * 0.65;
        this.player.y += ny * overlap * 0.65;
        e.x -= nx * overlap * 0.45;
        e.y -= ny * overlap * 0.45;
        const ram = e.kind === "ace" ? 26 : e.kind === "bruiser" ? 20 : 12;
        this.hurt(ram);
      }
    }
  }

  private damageEnemy(e: Enemy, amount: number): void {
    e.hp -= amount;
    e.hurt = 0.08;
    this.audio.playHit();
    this.spawnParticle(e.x, e.y, (Math.random() - 0.5) * 80, (Math.random() - 0.5) * 80, PALETTE.ice, 0.15, 2);
    if (e.hp > 0) return;
    this.killEnemy(e);
  }

  private killEnemy(e: Enemy): void {
    const base = e.score;
    this.combo += 1;
    this.comboT = 2;
    const mult = Math.min(4, 1 + Math.floor((this.combo - 1) / 2));
    const gained = Math.round(base * mult);
    this.score += gained;
    this.killCount += 1;
    this.floater(e.x, e.y - e.r, `+${gained}`, mult > 1 ? PALETTE.prize : PALETTE.ice);
    this.burst(e.x, e.y, e.kind === "ace" ? 28 : 14, e.kind === "ace" ? PALETTE.prize : PALETTE.ember);
    this.hitstop = e.kind === "ace" ? 0.09 : 0.04;
    this.trauma = Math.min(1, this.trauma + (e.kind === "ace" ? 0.55 : 0.16));
    this.audio.playExplode();
    const drop = e.kind === "ace" || this.killCount % 7 === 0 || Math.random() < 0.26;
    if (drop) this.spawnPickup(e.x, e.y);
    e.active = false;
  }

  private hurt(amount: number): void {
    if (this.phase !== "playing" || this.hp <= 0 || this.player.invuln > 0) return;
    this.hitLog.push(amount);
    if (this.hitLog.length > 24) this.hitLog.shift();
    if (this.shieldHits > 0 && this.shieldT > 0) {
      this.shieldHits -= 1;
      this.player.invuln = 0.32;
      this.trauma = Math.min(1, this.trauma + 0.2);
      this.audio.playShield();
      this.burst(this.player.x, this.player.y, 10, PALETTE.flare);
      if (this.shieldHits <= 0) this.shieldT = 0;
      return;
    }
    this.hp = Math.max(0, this.hp - amount);
    this.player.invuln = 0.78;
    this.combo = 0;
    this.comboT = 0;
    this.trauma = Math.min(1, this.trauma + 0.36);
    this.audio.playHurt();
    this.burst(this.player.x, this.player.y, 8, PALETTE.ember);
    if (this.hp <= 0) this.die();
  }

  private die(): void {
    this.phase = "over";
    this.aftermath = 1.15;
    this.hitstop = 0.1;
    this.trauma = 0.8;
    this.pointer.down = false;
    this.fireHeld = false;
    this.burst(this.player.x, this.player.y, 36, PALETTE.flare);
    this.burst(this.player.x, this.player.y, 18, PALETTE.prize);
    this.audio.playExplode();
    this.banner = "";
  }

  private collect(p: Pickup): void {
    p.active = false;
    this.audio.playPickup();
    if (p.kind === "multi") {
      this.multi = Math.min(2, this.multi + 1);
      this.multiT = 14;
      this.floater(p.x, p.y, "多重射击", PALETTE.flare);
    } else if (p.kind === "shield") {
      this.shieldHits = Math.min(6, this.shieldHits + 3);
      this.shieldT = 16;
      this.floater(p.x, p.y, "护盾", PALETTE.flare);
    } else {
      this.boostT = 9;
      this.floater(p.x, p.y, "加速", PALETTE.prize);
    }
  }

  private updateSpawns(dt: number): void {
    if (this.pendingAce) {
      this.pendingAce = false;
      this.spawnEnemy("ace");
    }
    if (this.spawnLeft <= 0) return;
    let alive = 0;
    for (const e of this.enemies) if (e.active) alive += 1;
    if (alive >= 14) return;
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnEnemy(this.pickKind());
    this.spawnLeft -= 1;
    this.spawnTimer = Math.max(0.22, 0.62 - this.wave * 0.025);
  }

  private maybeAdvance(dt: number): void {
    if (this.spawnLeft > 0 || this.pendingAce) return;
    for (const e of this.enemies) if (e.active) return;
    if (!this.clearArmed) {
      this.clearArmed = true;
      this.clearTimer = 1.25;
      const bonus = 120 * this.wave;
      this.score += bonus;
      this.floater(this.player.x, this.player.y - 36, `清空 +${bonus}`, PALETTE.prize);
      this.banner = "波次清空";
      this.bannerT = 1.1;
    } else {
      this.clearTimer -= dt;
      if (this.clearTimer <= 0) this.startWave(this.wave + 1);
    }
  }

  private startWave(n: number): void {
    this.wave = n;
    this.clearArmed = false;
    this.pendingAce = n % 5 === 0;
    this.spawnLeft = Math.min(22, 4 + n * 2);
    if (this.pendingAce) this.spawnLeft = Math.max(3, this.spawnLeft - 3);
    this.spawnTimer = 0.45;
    this.banner = this.pendingAce ? `第 ${n} 波 · 王牌` : `第 ${n} 波`;
    this.bannerT = 1.7;
    this.audio.playWave();
  }

  private pickKind(): EnemyKind {
    const w = this.wave;
    const r = Math.random();
    if (w >= 4 && r < 0.16) return "bruiser";
    if (w >= 3 && r < 0.4) return "weaver";
    if (w >= 2 && r < 0.68) return "dart";
    return "scout";
  }

  private spawnEnemy(kind: EnemyKind): void {
    const e = this.alloc(this.enemies);
    if (!e) return;
    const stat = STATS[kind];
    const scale = 1 + (this.wave - 1) * (kind === "ace" ? 0.08 : 0.14);
    const spot = this.spawnPoint(stat.r + 10);
    e.active = true;
    e.kind = kind;
    e.x = spot.x;
    e.y = spot.y;
    e.vx = 0;
    e.vy = 0;
    e.maxHp = Math.max(1, Math.round(stat.hp * scale));
    e.hp = e.maxHp;
    e.r = stat.r;
    e.speed = stat.speed;
    e.score = stat.score;
    e.shootCd = kind === "dart" ? 99 : 0.8 + Math.random() * 0.6;
    e.phase = Math.random() * Math.PI * 2;
    e.hurt = 0;
  }

  private spawnPoint(margin: number): { x: number; y: number } {
    for (let i = 0; i < 14; i++) {
      const edge = Math.floor(Math.random() * 4);
      let x = margin;
      let y = margin;
      if (edge === 0) {
        x = margin + Math.random() * (this.w - margin * 2);
        y = margin;
      } else if (edge === 1) {
        x = this.w - margin;
        y = margin + Math.random() * (this.h - margin * 2);
      } else if (edge === 2) {
        x = margin + Math.random() * (this.w - margin * 2);
        y = this.h - margin;
      } else {
        x = margin;
        y = margin + Math.random() * (this.h - margin * 2);
      }
      if (Math.hypot(x - this.player.x, y - this.player.y) > 190) return { x, y };
    }
    return { x: margin, y: this.h * 0.5 };
  }

  private spawnPickup(x: number, y: number): void {
    const p = this.alloc(this.pickups);
    if (!p) return;
    const roll = Math.random();
    p.active = true;
    p.kind = roll < 0.36 ? "multi" : roll < 0.68 ? "shield" : "boost";
    p.x = x;
    p.y = y;
    p.vx = (Math.random() - 0.5) * 40;
    p.vy = (Math.random() - 0.5) * 40;
    p.life = 12;
  }

  private nearestEnemy(maxDist: number): Enemy | null {
    let best: Enemy | null = null;
    let bestD = maxDist;
    for (const e of this.enemies) {
      if (!e.active) continue;
      const d = Math.hypot(e.x - this.player.x, e.y - this.player.y);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  private alloc<T extends { active: boolean }>(pool: T[]): T | null {
    for (const item of pool) if (!item.active) return item;
    return null;
  }

  private spawnParticle(
    x: number,
    y: number,
    vx: number,
    vy: number,
    color: string,
    life: number,
    size: number,
  ): void {
    const p = this.alloc(this.particles);
    if (!p) return;
    p.active = true;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.life = life;
    p.max = life;
    p.size = size;
    p.color = color;
  }

  private burst(x: number, y: number, n: number, color: string): void {
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.2;
      const s = 40 + Math.random() * 180;
      this.spawnParticle(x, y, Math.cos(a) * s, Math.sin(a) * s, i % 3 === 0 ? PALETTE.ice : color, 0.35 + Math.random() * 0.25, 1.5 + Math.random() * 2.4);
    }
  }

  private floater(x: number, y: number, text: string, color: string): void {
    const f = this.alloc(this.floaters);
    if (!f) return;
    f.active = true;
    f.x = x;
    f.y = y;
    f.text = text;
    f.life = 0.7;
    f.max = 0.7;
    f.color = color;
  }

  private decayFx(dt: number): void {
    for (const p of this.particles) {
      if (!p.active) continue;
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.exp(-1.4 * dt);
      p.vy *= Math.exp(-1.4 * dt);
      if (p.life <= 0) p.active = false;
    }
    for (const f of this.floaters) {
      if (!f.active) continue;
      f.life -= dt;
      f.y -= 28 * dt;
      if (f.life <= 0) f.active = false;
    }
    if (this.trauma > 0 && this.phase !== "playing") {
      this.trauma = Math.max(0, this.trauma - dt * 1.2);
    }
  }

  private emit(): void {
    const mult = this.combo > 0 ? Math.min(4, 1 + Math.floor((this.combo - 1) / 2)) : 1;
    const hud: Hud = {
      phase: this.phase,
      hp: this.hp,
      maxHp: MAX_HP,
      score: this.score,
      best: this.best,
      wave: this.wave,
      combo: this.combo,
      comboMult: mult,
      shieldHits: this.shieldHits,
      shieldTime: Math.max(0, this.shieldT),
      multi: this.multi,
      multiTime: Math.max(0, this.multiT),
      boostTime: Math.max(0, this.boostT),
      banner: this.bannerT > 0 ? this.banner : "",
      muted: this.audio.muted,
      shake: this.shakeOn,
    };
    const key = [
      hud.phase,
      hud.hp,
      hud.score,
      hud.best,
      hud.wave,
      hud.combo,
      hud.shieldHits,
      Math.ceil(hud.shieldTime),
      hud.multi,
      Math.ceil(hud.multiTime),
      Math.ceil(hud.boostTime),
      hud.banner,
      hud.muted ? 1 : 0,
      hud.shake ? 1 : 0,
    ].join("|");
    if (key === this.lastEmit) return;
    this.lastEmit = key;
    this.onHud(hud);
  }

  private render(): void {
    const ctx = this.ctx;
    const { w, h } = this;
    if (w < 2 || h < 2) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = PALETTE.void;
    ctx.fillRect(0, 0, w, h);
    this.drawNebula(ctx);
    this.drawStars(ctx);

    ctx.save();
    if (this.shakeOn && !this.reduceMotion && this.trauma > 0) {
      const s = this.trauma * this.trauma;
      const ox = Math.sin(this.time * 43) * 14 * s;
      const oy = Math.cos(this.time * 37) * 11 * s;
      ctx.translate(w / 2, h / 2);
      ctx.rotate(Math.sin(this.time * 31) * 0.018 * s);
      ctx.translate(-w / 2 + ox, -h / 2 + oy);
    }

    this.drawPickups(ctx);
    this.drawEnemyAim(ctx);
    this.drawBullets(ctx);
    this.drawEnemies(ctx);
    if (this.phase === "title") this.drawHero(ctx);
    else if (this.phase !== "over") this.drawPlayer(ctx);
    this.drawParticles(ctx);
    this.drawFloaters(ctx);
    ctx.restore();
    this.drawVignette(ctx);
  }

  private drawNebula(ctx: CanvasRenderingContext2D): void {
    const blobs = [
      { x: 0.22, y: 0.3, r: 0.48, c: "rgba(62,231,255,0.10)" },
      { x: 0.78, y: 0.62, r: 0.5, c: "rgba(255,92,69,0.07)" },
      { x: 0.48, y: 0.85, r: 0.36, c: "rgba(255,200,87,0.05)" },
    ];
    for (const b of blobs) {
      const x = ((b.x + this.starOx[0] * 0.25) % 1) * this.w;
      const y = ((b.y + Math.sin(this.time * 0.05 + b.x) * 0.02) % 1) * this.h;
      const rad = b.r * Math.max(this.w, this.h);
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, b.c);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.w, this.h);
    }
  }

  private drawStars(ctx: CanvasRenderingContext2D): void {
    for (const s of this.stars) {
      const x = (((s.nx + this.starOx[s.layer]) % 1) + 1) % 1 * this.w;
      const y = (((s.ny + this.starOy[s.layer]) % 1) + 1) % 1 * this.h;
      const tw = this.reduceMotion ? 1 : 0.62 + 0.38 * Math.sin(this.time * s.tw + s.nx * 20);
      ctx.globalAlpha = s.a * tw;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(x, y, s.r, 0, Math.PI * 2);
      ctx.fill();
      if (s.layer === 2 && s.r > 1.6) {
        ctx.globalAlpha *= 0.7;
        ctx.fillRect(x - s.r * 2.2, y - 0.4, s.r * 4.4, 0.8);
        ctx.fillRect(x - 0.4, y - s.r * 2.2, 0.8, s.r * 4.4);
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawPickups(ctx: CanvasRenderingContext2D): void {
    for (const p of this.pickups) {
      if (!p.active) continue;
      const bob = Math.sin(this.time * 4 + p.x) * 3;
      const y = p.y + bob;
      ctx.save();
      ctx.translate(p.x, y);
      ctx.rotate(this.time * 1.4);
      if (p.kind === "shield") {
        ctx.strokeStyle = PALETTE.flare;
        ctx.fillStyle = "rgba(62,231,255,0.18)";
        ctx.lineWidth = 2;
        this.poly(ctx, 0, 0, 12, 6);
        ctx.fill();
        ctx.stroke();
      } else if (p.kind === "boost") {
        ctx.fillStyle = PALETTE.prize;
        ctx.beginPath();
        ctx.moveTo(0, -12);
        ctx.lineTo(8, 8);
        ctx.lineTo(0, 3);
        ctx.lineTo(-8, 8);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.strokeStyle = PALETTE.flare;
        ctx.fillStyle = PALETTE.ice;
        ctx.lineWidth = 1.5;
        for (const ang of [-0.5, 0, 0.5]) {
          ctx.beginPath();
          ctx.moveTo(Math.cos(ang) * 4, Math.sin(ang) * 4);
          ctx.lineTo(Math.cos(ang) * 13, Math.sin(ang) * 13);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(0, 0, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private drawEnemyAim(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.lineWidth = 1;
    for (const e of this.enemies) {
      if (!e.active || e.kind === "dart" || e.shootCd > 0.32) continue;
      const ang = Math.atan2(this.player.y - e.y, this.player.x - e.x);
      ctx.globalAlpha = 0.35 + (0.32 - e.shootCd) * 1.4;
      ctx.strokeStyle = e.kind === "ace" ? PALETTE.prize : PALETTE.ember;
      ctx.beginPath();
      ctx.moveTo(e.x + Math.cos(ang) * e.r, e.y + Math.sin(ang) * e.r);
      ctx.lineTo(e.x + Math.cos(ang) * (e.r + 46), e.y + Math.sin(ang) * (e.r + 46));
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  private drawBullets(ctx: CanvasRenderingContext2D): void {
    for (const b of this.bullets) {
      if (!b.active) continue;
      const color = b.friendly ? PALETTE.flare : PALETTE.ember;
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = b.friendly ? 2 : 2.4;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - b.vx * 0.018, b.y - b.vy * 0.018);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = b.friendly ? PALETTE.ice : PALETTE.prize;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawEnemies(ctx: CanvasRenderingContext2D): void {
    for (const e of this.enemies) {
      if (!e.active) continue;
      const ang = Math.atan2(this.player.y - e.y, this.player.x - e.x);
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(ang);
      const hurt = e.hurt > 0;
      if (e.kind === "scout") this.drawScout(ctx, hurt);
      else if (e.kind === "dart") this.drawDart(ctx, hurt);
      else if (e.kind === "weaver") this.drawWeaver(ctx, hurt);
      else if (e.kind === "bruiser") this.drawBruiser(ctx, hurt);
      else this.drawAce(ctx, hurt);
      ctx.restore();
      if (e.kind === "bruiser" || e.kind === "ace") {
        const pct = clamp(e.hp / e.maxHp, 0, 1);
        const bw = e.kind === "ace" ? 36 : 26;
        ctx.fillStyle = "rgba(7,9,16,0.7)";
        ctx.fillRect(e.x - bw / 2, e.y - e.r - 10, bw, 3);
        ctx.fillStyle = e.kind === "ace" ? PALETTE.prize : PALETTE.ember;
        ctx.fillRect(e.x - bw / 2, e.y - e.r - 10, bw * pct, 3);
      }
    }
  }

  private drawScout(ctx: CanvasRenderingContext2D, hurt: boolean): void {
    ctx.fillStyle = hurt ? PALETTE.ice : PALETTE.emberDeep;
    ctx.strokeStyle = hurt ? PALETTE.ice : PALETTE.ember;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 16, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(6, 5);
    ctx.lineTo(6, -5);
    ctx.closePath();
    ctx.fillStyle = hurt ? PALETTE.ice : PALETTE.ember;
    ctx.fill();
    ctx.fillStyle = PALETTE.prize;
    ctx.beginPath();
    ctx.arc(2, 0, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawDart(ctx: CanvasRenderingContext2D, hurt: boolean): void {
    ctx.fillStyle = hurt ? PALETTE.ice : PALETTE.ember;
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-12, 7);
    ctx.lineTo(-6, 0);
    ctx.lineTo(-12, -7);
    ctx.closePath();
    ctx.fill();
  }

  private drawWeaver(ctx: CanvasRenderingContext2D, hurt: boolean): void {
    ctx.fillStyle = hurt ? PALETTE.ice : PALETTE.ember;
    ctx.strokeStyle = PALETTE.prize;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      ctx.rotate((Math.PI * 2) / 3);
      ctx.beginPath();
      ctx.moveTo(4, 0);
      ctx.quadraticCurveTo(14, 6, 16, 0);
      ctx.quadraticCurveTo(14, -6, 4, 0);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fillStyle = hurt ? PALETTE.ice : PALETTE.ink;
    ctx.fill();
    ctx.stroke();
  }

  private drawBruiser(ctx: CanvasRenderingContext2D, hurt: boolean): void {
    ctx.fillStyle = hurt ? PALETTE.ice : "#3a1614";
    ctx.strokeStyle = hurt ? PALETTE.ice : PALETTE.ember;
    ctx.lineWidth = 2.5;
    this.poly(ctx, 0, 0, 22, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = hurt ? PALETTE.ice : PALETTE.emberDeep;
    ctx.fillRect(-8, -6, 16, 12);
    ctx.fillStyle = PALETTE.prize;
    ctx.fillRect(8, -2, 8, 4);
  }

  private drawAce(ctx: CanvasRenderingContext2D, hurt: boolean): void {
    ctx.fillStyle = hurt ? PALETTE.ice : "#2a120f";
    ctx.strokeStyle = hurt ? PALETTE.ice : PALETTE.prize;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(28, 0);
    ctx.lineTo(6, 16);
    ctx.lineTo(-18, 12);
    ctx.lineTo(-10, 0);
    ctx.lineTo(-18, -12);
    ctx.lineTo(6, -16);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = PALETTE.ember;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-4, 7);
    ctx.lineTo(-4, -7);
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = PALETTE.prize;
    ctx.beginPath();
    ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawPlayer(ctx: CanvasRenderingContext2D): void {
    const blink = this.player.invuln > 0 && Math.sin(this.time * 38) > 0;
    const alpha = blink ? 0.4 : 1;
    const rx = this.player.x - Math.cos(this.player.aim) * this.player.recoil;
    const ry = this.player.y - Math.sin(this.player.aim) * this.player.recoil;
    this.paintShip(ctx, rx, ry, this.player.aim, 1, this.player.flash > 0 || Math.hypot(this.player.vx, this.player.vy) > 40, alpha);
    if (this.shieldHits > 0 && this.shieldT > 0) {
      ctx.save();
      ctx.translate(this.player.x, this.player.y);
      ctx.rotate(this.time * 1.6);
      ctx.strokeStyle = PALETTE.flare;
      ctx.globalAlpha = 0.35 + this.shieldHits * 0.1;
      ctx.lineWidth = 2;
      this.poly(ctx, 0, 0, 28, 6);
      ctx.stroke();
      ctx.restore();
    }
    if (this.player.flash > 0) {
      const n = 22;
      ctx.save();
      ctx.translate(rx, ry);
      ctx.rotate(this.player.aim);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = Math.min(1, this.player.flash * 16);
      const g = ctx.createRadialGradient(n, 0, 0, n, 0, 26);
      g.addColorStop(0, "rgba(255,255,255,0.95)");
      g.addColorStop(0.35, "rgba(62,231,255,0.8)");
      g.addColorStop(1, "rgba(62,231,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(n - 4, 0);
      ctx.lineTo(n + 22, 9);
      ctx.lineTo(n + 22, -9);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(n + 4, 0, 5, 0, Math.PI * 2);
      ctx.fillStyle = PALETTE.ice;
      ctx.fill();
      ctx.restore();
    }
  }

  private drawHero(ctx: CanvasRenderingContext2D): void {
    const wide = this.w >= 900;
    const bob = this.reduceMotion ? 0 : Math.sin(this.time * 1.4) * 8;
    const x = wide ? this.w * 0.74 : this.w * 0.5;
    const y = (wide ? this.h * 0.56 : this.h * 0.8) + bob;
    const aim = -Math.PI / 2 + Math.sin(this.time * 0.65) * 0.2;
    const scale = wide ? 2.7 : 1.85;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.time * 0.15);
    ctx.strokeStyle = "rgba(62,231,255,0.28)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 78 * (scale / 2.2), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    this.paintShip(ctx, x, y, aim, scale, true, 1);
  }

  private paintShip(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    aim: number,
    scale: number,
    flame: boolean,
    alpha: number,
  ): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(aim);
    ctx.scale(scale, scale);
    ctx.globalAlpha = alpha;
    if (flame) {
      const len = 10 + Math.sin(this.time * 28) * 4;
      ctx.fillStyle = this.boostT > 0 ? PALETTE.prize : PALETTE.flare;
      ctx.globalAlpha = alpha * 0.9;
      ctx.beginPath();
      ctx.moveTo(-10, 3.5);
      ctx.lineTo(-10 - len, 0);
      ctx.lineTo(-10, -3.5);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = alpha;
    }
    ctx.fillStyle = PALETTE.flareDeep;
    ctx.strokeStyle = PALETTE.flare;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(20, 0);
    ctx.lineTo(2, 5);
    ctx.lineTo(-10, 11);
    ctx.lineTo(-4, 3.5);
    ctx.lineTo(-14, 5);
    ctx.lineTo(-9, 0);
    ctx.lineTo(-14, -5);
    ctx.lineTo(-4, -3.5);
    ctx.lineTo(-10, -11);
    ctx.lineTo(2, -5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = PALETTE.ice;
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(2, 2.4);
    ctx.lineTo(2, -2.4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PALETTE.ink;
    ctx.beginPath();
    ctx.ellipse(1, 0, 4.2, 2.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.flare;
    ctx.stroke();
    ctx.restore();
  }

  private drawParticles(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const p of this.particles) {
      if (!p.active) continue;
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawFloaters(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.font = "700 13px Orbitron, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const f of this.floaters) {
      if (!f.active) continue;
      ctx.globalAlpha = Math.max(0, f.life / f.max);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.restore();
  }

  private drawVignette(ctx: CanvasRenderingContext2D): void {
    const g = ctx.createRadialGradient(
      this.w / 2,
      this.h / 2,
      Math.min(this.w, this.h) * 0.35,
      this.w / 2,
      this.h / 2,
      Math.max(this.w, this.h) * 0.72,
    );
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.45)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
    if (this.phase === "playing" && this.hp < MAX_HP * 0.35 && this.hp > 0) {
      const pulse = this.reduceMotion ? 0.45 : 0.35 + 0.15 * Math.sin(this.time * 5);
      const a = (1 - this.hp / MAX_HP) * pulse;
      const vg = ctx.createRadialGradient(
        this.w / 2,
        this.h / 2,
        Math.min(this.w, this.h) * 0.2,
        this.w / 2,
        this.h / 2,
        Math.max(this.w, this.h) * 0.65,
      );
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, `rgba(255,92,69,${a.toFixed(3)})`);
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, this.w, this.h);
    }
  }

  private poly(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, sides: number): void {
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = (Math.PI * 2 * i) / sides - Math.PI / 2;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }
}
