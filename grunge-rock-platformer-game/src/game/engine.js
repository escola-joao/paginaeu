import { VIEW_W, VIEW_H, GROUND_Y, makeEnemy } from "./levelgen.js";
import { updateBoss } from "./bosses.js";
import * as S from "./sprites.js";
import * as A from "./audio.js";

export { VIEW_W, VIEW_H };

const GRAVITY = 0.28;
const MOVE = 0.42;
const FRICTION = 0.72;
const MAX_VX = 2.1;
const JUMP_V = -5.5;
const MAX_HP = 100;
const FUZZ_COOLDOWN = 60; // one heavy beam roughly every second
const BASE_SHOT_LIFE = 34; // shorter range than the pedal beams
const CHORUS_DAMAGE = 0.75;

/** Every attack has its own weight — the health bar is not chunked in hearts. */
const HIT_DMG = {
  paper: 6, note: 8, ring: 9, coin: 10, ex: 10, shock: 15, beam: 24, hand: 28,
};
const TOUCH_DMG = { grunt: 9, mini: 15, big: 22 };

export class Game {
  status = "menu";
  level;
  p;
  riffs = [];
  particles = [];
  enemies;
  platforms;
  pickups;
  camX = 0;
  camMin = 0;
  camShake = 0;
  t = 0;
  score = 0;
  cards = 0;
  overdrive = false;
  banner = "";
  bannerSub = "";
  bannerT = 0;
  flash = 0;
  dmgFlash = 0;
  lastHit = 0;
  lastHitT = 0;
  bossActive = null;
  bossDefeated = false;
  koT = 0;
  enemyId = 0;
  idMap = new WeakMap();
  sprites = S.playerSprites();
  cloneSprites = S.playerSprites({ h: "k", g: "r", d: "v", j: "n" });
  onStatus;

  constructor(level, startScore = 0, startHp = MAX_HP, startCards = 0) {
    this.level = level;
    this.score = startScore;
    this.cards = startCards;
    this.platforms = level.platforms.map((p) => ({ ...p }));
    this.enemies = level.enemies.map((e) => ({ ...e }));
    this.pickups = level.pickups.map((p) => ({ ...p }));
    this.p = {
      x: level.playerStart.x, y: level.playerStart.y, w: 10, h: 18, vx: 0, vy: 0,
      onGround: false, facing: 1, hp: startHp, maxHp: MAX_HP, shootCd: 0, invuln: 0, animT: 0, strum: 0,
      dashT: 0, dashCd: 0, parryT: 0, aimX: 1, aimY: 0, locked: false,
      activePedal: null, pedalT: 0, speedT: 0,
      prevJump: false, prevDash: false, prevEx: false, prevSup: false,
    };
    if (level.bigBoss) {
      this.showBanner("VS", "");
    }
  }

  start() { this.status = "playing"; this.onStatus?.(this.status); }
  setStatus(s) { this.status = s; this.onStatus?.(s); }
  showBanner(t, sub, frames = 110) { this.banner = t; this.bannerSub = sub; this.bannerT = frames; }

  getHUD() {
    const b = this.bossActive && this.bossActive.alive ? this.bossActive : undefined;
    return {
      hp: this.p.hp, maxHp: this.p.maxHp, score: this.score, cards: this.cards, overdrive: this.overdrive,
      pedal: this.p.activePedal ? this.p.activePedal.toUpperCase() : undefined,
      pedalTime: this.p.pedalT, speedBoost: this.p.speedT > 0, speedTime: this.p.speedT,
      dmgFlash: this.dmgFlash, lastHit: this.lastHitT > 0 ? this.lastHit : 0,
      levelName: this.level.name, songLine: this.level.songLine,
      boss: b ? { name: b.name, hp: b.hp, max: b.maxHp, big: b.big } : undefined,
      banner: this.bannerT > 0 ? this.banner : undefined,
      bannerSub: this.bannerT > 0 ? this.bannerSub : undefined,
    };
  }

  // ---------- helpers ----------
  aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  solid(p) { return p.kind !== "stage"; }

  moveBody(b, oneWay = true) {
    b.x += b.vx;
    for (const pl of this.platforms) {
      if (!this.solid(pl)) continue;
      if (this.aabb(b, pl)) {
        if (b.vx > 0) b.x = pl.x - b.w; else if (b.vx < 0) b.x = pl.x + pl.w;
        b.vx = 0;
      }
    }
    b.onGround = false;
    const prevBottom = b.y + b.h;
    b.y += b.vy;
    for (const pl of this.platforms) {
      if (!this.aabb(b, pl)) continue;
      if (this.solid(pl)) {
        if (b.vy > 0) { b.y = pl.y - b.h; b.onGround = true; } else if (b.vy < 0) b.y = pl.y + pl.h;
        b.vy = 0;
      } else if (oneWay && b.vy >= 0 && prevBottom <= pl.y + 1) {
        b.y = pl.y - b.h; b.onGround = true; b.vy = 0;
      }
    }
  }

  idOf(e) {
    let id = this.idMap.get(e);
    if (id === undefined) { id = ++this.enemyId; this.idMap.set(e, id); }
    return id;
  }

  burst(x, y, color, n, speed = 1.5) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = Math.random() * speed + 0.3;
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.5, life: 25 + Math.random() * 20, maxLife: 40, color, size: 1 + Math.floor(Math.random() * 2) });
    }
  }

  spawnRiff(r) {
    this.riffs.push({
      vx: 0, vy: 0, life: 120, friendly: false, wave: 0, power: 1, r: 3, kind: "note", pink: false,
      grav: 0, pierce: false, w: 0, h: 0, telegraph: 0, ...r,
    });
  }

  spawnEnemy(type, x) {
    const e = makeEnemy(type, x, this.level.arenaX + 6, this.level.width - 16, this.level.index);
    e.dormant = false; e.boss = false; e.y = 60;
    if (type === "clone") { e.hp = 10; e.maxHp = 10; }
    this.enemies.push(e);
    this.burst(x + e.w / 2, 70, "#ff3fa4", 10, 2);
  }

  // ---------- player actions ----------
  shoot() {
    const p = this.p;
    if (p.shootCd > 0) return;
    p.strum = 6;
    const ax = p.aimX, ay = p.aimY;
    const m = Math.hypot(ax, ay) || 1;
    const nx = ax / m, ny = ay / m;
    const bx = p.x + p.w / 2 + nx * 10, by = p.y + 9 + ny * 8;
    const angle = Math.atan2(ny, nx);

    if (p.activePedal === "chorus") {
      // Continuous ROUNDED wave beam, refreshed while fire is held. Reach is unbounded.
      p.shootCd = 2;
      this.spawnRiff({ x: bx, y: by, life: 3, friendly: true, power: CHORUS_DAMAGE, r: 1, kind: "chorus", angle, beamLength: 0, hitIds: new Set() });
      if (this.t % 10 === 0) A.playBeam("chorus");
      return;
    }

    if (p.activePedal === "fuzz") {
      // One heavy TRIANGULAR beam about once a second — slower than a SMG, heavier than a pistol.
      p.shootCd = FUZZ_COOLDOWN;
      p.strum = 14;
      this.spawnRiff({ x: bx, y: by, life: 20, friendly: true, power: 6, r: 1, kind: "fuzz", angle, beamLength: 0, hitIds: new Set() });
      A.playBeam("fuzz");
      this.camShake = Math.min(this.camShake + 3, 7);
      this.burst(bx, by, "#f2c826", 12, 2.4);
      this.flash = 3;
      return;
    }

    if (p.activePedal === "distortion") {
      // The orange pedal fires a broad, short-range fan of guitar picks.
      p.shootCd = 19;
      const spread = [-0.42, -0.28, -0.14, 0, 0.14, 0.28, 0.42];
      spread.forEach((offset, i) => {
        const a = angle + offset;
        const speed = 4.1 + (i % 3) * 0.25;
        this.spawnRiff({
          x: bx, y: by, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
          life: 24, friendly: true, power: 1, r: 2, kind: "shotgun", angle: a,
        });
      });
      A.playRiff(2);
      this.camShake = Math.min(this.camShake + 1.5, 4);
      this.burst(bx, by, "#ff7a1a", 9, 1.8);
      return;
    }

    p.shootCd = this.overdrive ? 6 : 9;
    const spreads = this.overdrive ? [-0.14, 0, 0.14] : [0];
    for (const s of spreads) {
      const ca = Math.cos(s), sa = Math.sin(s), speed = 4.6;
      this.spawnRiff({ x: bx, y: by, vx: (nx * ca - ny * sa) * speed, vy: (nx * sa + ny * ca) * speed, life: BASE_SHOT_LIFE, friendly: true, power: 1, r: 3, kind: "note" });
    }
    A.playRiff(1);
    this.burst(bx, by, "#f2c826", 3, 1);
    this.camShake = Math.min(this.camShake + 0.6, 2);
  }

  exMove() {
    const p = this.p;
    if (this.cards < 1) return;
    this.cards -= 1;
    const m = Math.hypot(p.aimX, p.aimY) || 1;
    const nx = p.aimX / m, ny = p.aimY / m;
    this.spawnRiff({ x: p.x + p.w / 2 + nx * 10, y: p.y + 9, vx: nx * 3, vy: ny * 3, life: 90, friendly: true, power: 6, r: 8, kind: "ex", pierce: true, hitIds: new Set() });
    A.playRiff(2); A.playRiff(2);
    this.camShake = 4;
    p.vx -= nx * 1.5;
    this.burst(p.x + p.w / 2, p.y + 9, "#ff3fa4", 14, 2.5);
  }

  superMove() {
    if (this.cards < 5) return;
    this.cards = 0;
    this.flash = 18;
    this.camShake = 10;
    A.playRiff(2); A.playDeath();
    for (const e of this.enemies) {
      if (!e.alive || e.dormant) continue;
      if (e.x + e.w > this.camX && e.x < this.camX + VIEW_W) this.damage(e, e.big ? 30 : e.boss ? 36 : 99);
    }
    for (const r of this.riffs) if (!r.friendly && r.kind !== "beam" && r.kind !== "hand") r.life = 0;
    this.showBanner("POWER CHORD!", "", 50);
  }

  hurt(dmg) {
    const p = this.p;
    if (p.invuln > 0 || p.dashT > 0) return;
    p.hp -= dmg;
    p.invuln = dmg >= 20 ? 74 : 50;
    this.camShake = Math.min(9, 3 + dmg * 0.25);
    this.dmgFlash = Math.min(18, 5 + dmg * 0.5);
    this.lastHit = dmg;
    this.lastHitT = 70;
    A.playHit();
    this.burst(p.x + p.w / 2, p.y + p.h / 2, "#ff2a2a", 8 + Math.round(dmg / 3), 2);
    // damage number pops out of the player
    this.particles.push({
      x: p.x + p.w / 2, y: p.y - 3, vx: 0, vy: -0.55,
      life: 42, maxLife: 42, color: dmg >= 20 ? "#ff2a2a" : "#ffe9a8", size: 1,
    });
    if (p.hp <= 0) {
      p.hp = 0;
      A.playDeath(); A.stopMusic();
      this.setStatus("dead");
    }
  }

  damage(e, amt) {
    if (e.type === "bouncer" && e.state === "stun") amt *= 2;
    e.hp -= amt;
    e.hitFlash = 6;
    this.cards = Math.min(5, this.cards + 0.05 * amt);
    if (e.hp <= 0) {
      e.hp = 0; e.alive = false;
      if (e.boss && e === this.bossActive) this.bossDefeated = true;
      const pts = e.big ? 2500 : e.boss ? 800 : e.type === "suit" ? 150 : 100;
      this.score += pts;
      this.burst(e.x + e.w / 2, e.y + e.h / 2, "#ff7a1a", e.boss ? 40 : 14, e.boss ? 3 : 2);
      this.burst(e.x + e.w / 2, e.y + e.h / 2, "#f2c826", e.boss ? 30 : 6, e.boss ? 3 : 2);
      if (e.boss) {
        this.camShake = 12; this.koT = 90;
        this.showBanner("KNOCKOUT!", "A wonderful time!", 120);
        this.platforms = this.platforms.filter((pl) => !(pl.kind === "wall" && pl.x === this.level.arenaX - 10));
        for (const r of this.riffs) if (!r.friendly) r.life = 0;
        A.playPickup();
      }
    }
  }

  // ---------- update ----------
  update(inp) {
    if (this.status !== "playing") return;
    this.t++;
    const p = this.p;
    p.animT++;
    if (this.bannerT > 0) this.bannerT--;
    if (this.flash > 0) this.flash--;
    if (this.dmgFlash > 0) this.dmgFlash--;
    if (this.lastHitT > 0) this.lastHitT--;
    if (this.koT > 0) this.koT--;

    // boss intro freeze
    const intro = this.bossActive && this.bannerT > 60 && this.banner === "VS";
    if (this.level.bigBoss && this.t < 60) {
      const b = this.enemies.find((e) => e.big);
      this.bossActive = b;
      this.bannerSub = b.name;
    }

    // aim
    const hx = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    let ay = 0;
    if (inp.up) ay = -1;
    else if (inp.down && !p.onGround) ay = 1;
    p.locked = inp.down && p.onGround;
    if (hx !== 0) p.facing = hx;
    p.aimX = hx !== 0 ? hx : ay !== 0 && (inp.up || inp.down) && hx === 0 ? 0 : p.facing;
    p.aimY = ay;
    if (p.aimX === 0 && p.aimY === 0) p.aimX = p.facing;

    // dash
    const dashPress = inp.dash && !p.prevDash;
    if (dashPress && p.dashCd <= 0 && p.dashT <= 0) {
      p.dashT = 11; p.dashCd = 34;
      A.playJump();
      this.burst(p.x + p.w / 2, p.y + p.h - 2, "#f2f2f2", 6, 1);
    }
    if (p.dashCd > 0) p.dashCd--;

    if (p.dashT > 0) {
      p.dashT--;
      p.vx = p.facing * (p.speedT > 0 ? 5.3 : 4.2);
      p.vy = 0;
      if (p.dashT % 2 === 0) this.particles.push({ x: p.x + p.w / 2, y: p.y + 6 + Math.random() * 8, vx: -p.facing * 0.5, vy: 0, life: 12, maxLife: 12, color: "#b0c4de", size: 1 });
    } else {
      const speedBoost = p.speedT > 0 ? 1.42 : 1;
      if (!p.locked && !intro) {
        if (inp.left) p.vx -= MOVE * speedBoost;
        if (inp.right) p.vx += MOVE * speedBoost;
      }
      if ((!inp.left && !inp.right) || p.locked) p.vx *= FRICTION;
      p.vx = Math.max(-MAX_VX * speedBoost, Math.min(MAX_VX * speedBoost, p.vx));
      const jumpPress = inp.jump && !p.prevJump;
      if (jumpPress && !intro) {
        if (p.onGround) {
          p.vy = JUMP_V; p.onGround = false;
          A.playJump();
          this.burst(p.x + p.w / 2, p.y + p.h, "#8a8a92", 4, 1);
        } else {
          // An airborne jump press opens the Cuphead-style parry window, not another jump.
          p.parryT = 10;
        }
      }
      if (!inp.jump && p.vy < -2) p.vy *= 0.85; // variable jump
      p.vy += GRAVITY;
      if (p.vy > 6.5) p.vy = 6.5;
    }
    if (p.parryT > 0) p.parryT--;

    if (inp.shoot && !intro) this.shoot();
    if (inp.ex && !p.prevEx && !intro) this.exMove();
    if (inp.sup && !p.prevSup && !intro) this.superMove();
    p.prevJump = inp.jump; p.prevDash = inp.dash; p.prevEx = inp.ex; p.prevSup = inp.sup;

    if (p.shootCd > 0) p.shootCd--;
    if (p.strum > 0) p.strum--;
    if (p.invuln > 0) p.invuln--;

    this.moveBody(p);

    if (p.x < this.camMin) { p.x = this.camMin; p.vx = 0; }
    if (p.x + p.w > this.level.width) p.x = this.level.width - p.w;
    if (p.y > VIEW_H + 40) this.hurt(999);

    if (p.pedalT > 0 && --p.pedalT <= 0) {
      p.activePedal = null;
      this.overdrive = false;
      this.showBanner("PEDAL OFF", "", 35);
    }
    if (p.speedT > 0) p.speedT--;

    // boss trigger
    if (!this.bossActive && this.level.arenaX > 0 && p.x > this.level.arenaX + 20) {
      const b = this.enemies.find((e) => e.boss && e.dormant);
      if (b) {
        b.dormant = false;
        this.bossActive = b;
        this.camMin = this.level.arenaX;
        this.platforms.push({ x: this.level.arenaX - 10, y: -50, w: 10, h: 250, kind: "wall" });
        this.showBanner("VS", b.name, 110);
        this.camShake = 4;
        A.playDeath();
      }
    }
    if (this.level.bigBoss && this.t === 60) {
      const b = this.enemies.find((e) => e.big);
      b.dormant = false;
      this.showBanner("VS", b.name, 110);
    }

    this.updateRiffs();
    if (!intro) this.updateEnemies();
    this.updatePickups();
    this.updateParticles();

    // camera
    const target = p.x + p.w / 2 - VIEW_W / 2;
    this.camX += (target - this.camX) * 0.12;
    this.camX = Math.max(this.camMin, Math.min(this.level.width - VIEW_W, this.camX));
    if (this.camShake > 0) this.camShake *= 0.85;

    // A stage only clears after its active boss is defeated; reaching the edge is never enough.
    if (this.bossDefeated && this.koT <= 0) {
      A.stopMusic(); this.setStatus("levelclear");
    }
  }

  /** Sharp triangle oscillation in -1..1 — the fuzz beam's hard-edged profile. */
  triWave(v) {
    const tau = Math.PI * 2;
    const n = (((v % tau) + tau) % tau) / tau;
    return n < 0.25 ? n * 4 : n < 0.75 ? 2 - n * 4 : n * 4 - 4;
  }

  /** Vertical offset of a beam at distance d along its direction. */
  beamOffset(r, d) {
    return r.kind === "chorus"
      ? Math.sin(r.wave * 1.6 + d * 0.26) * 1.8
      : this.triWave(r.wave * 1.2 + d * 0.24) * 2.8;
  }

  /**
   * March a beam forward until it leaves the view or meets solid geometry, so the
   * reach is effectively infinite. Everything living on the path takes the hit.
   */
  traceBeam(r) {
    const angle = r.angle ?? 0;
    const dx = Math.cos(angle), dy = Math.sin(angle);
    r.hitIds ??= new Set();

    const camL = this.camX - 30, camR = this.camX + VIEW_W + 30;
    let maxLen = 900;
    if (dx > 1e-4) maxLen = Math.min(maxLen, (camR - r.x) / dx);
    else if (dx < -1e-4) maxLen = Math.min(maxLen, (camL - r.x) / dx);
    if (dy > 1e-4) maxLen = Math.min(maxLen, (VIEW_H + 30 - r.y) / dy);
    else if (dy < -1e-4) maxLen = Math.min(maxLen, (-30 - r.y) / dy);
    maxLen = Math.max(6, maxLen);

    const spark = r.kind === "chorus" ? "#857bff" : "#f2c826";
    let len = 0;
    const step = 2;
    let blocked = false;
    while (len < maxLen) {
      const x = r.x + dx * len;
      const y = r.y + dy * len + this.beamOffset(r, len);
      for (const e of this.enemies) {
        if (!e.alive || e.dormant) continue;
        const id = this.idOf(e);
        if (r.hitIds.has(id)) continue;
        if (x > e.x - 1 && x < e.x + e.w + 1 && y > e.y - 1 && y < e.y + e.h + 1) {
          r.hitIds.add(id);
          this.damage(e, r.power);
          this.burst(x, y, spark, r.kind === "fuzz" ? 8 : 4, r.kind === "fuzz" ? 2 : 1.2);
          A.playHit();
        }
      }
      for (const pl of this.platforms) {
        if (!this.solid(pl)) continue;
        if (x >= pl.x && x <= pl.x + pl.w && y >= pl.y && y <= pl.y + pl.h) { blocked = true; break; }
      }
      if (blocked) break;
      len += step;
    }
    r.beamLength = len;
    r.endX = r.x + dx * len;
    r.endY = r.y + dy * len + this.beamOffset(r, len);
    if (blocked && r.kind === "fuzz" && (this.t & 1) === 0) {
      this.burst(r.endX, r.endY, "#ffe9a8", 3, 1.6);
    }
  }

  updateRiffs() {
    const p = this.p;
    for (const r of this.riffs) {
      r.wave += 0.4;
      if (r.telegraph > 0) { r.telegraph--; r.life--; continue; }
      // Both pedal beams: traced fresh every frame, unbounded reach, piercing.
      if ((r.kind === "chorus" || r.kind === "fuzz") && r.friendly) {
        r.life--;
        this.traceBeam(r);
        continue;
      }
      r.vy += r.grav;
      r.x += r.vx; r.y += r.vy;
      if (r.kind === "fuzz") r.y += Math.round(Math.sin(r.wave * 1.6) * 2);
      r.life--;
      const box = r.w > 0 ? { x: r.x, y: r.y, w: r.w, h: r.h } : { x: r.x - r.r, y: r.y - r.r, w: r.r * 2, h: r.r * 2 };
      if (r.friendly) {
        for (const e of this.enemies) {
          if (!e.alive || e.dormant) continue;
          if (this.aabb(box, e)) {
            if (r.pierce) { if (r.hitIds.has(this.idOf(e))) continue; r.hitIds.add(this.idOf(e)); }
            else r.life = 0;
            this.damage(e, r.power);
            this.burst(r.x, r.y, "#f2c826", 4, 1.2);
            A.playHit();
            if (!r.pierce) break;
          }
        }
      } else {
        const pbox = { x: p.x - 3, y: p.y - 3, w: p.w + 6, h: p.h + 6 };
        if (r.pink && p.parryT > 0 && this.aabb(box, pbox)) {
          r.life = 0;
          p.vy = JUMP_V * 0.95;
          p.parryT = 0;
          this.cards = Math.min(5, this.cards + 1);
          this.burst(r.x, r.y, "#ff3fa4", 16, 2.5);
          this.flash = 4;
          this.showBanner("PARRY!", "", 30);
          A.playPickup();
          continue;
        }
        if (this.aabb(box, p)) {
          if (r.kind !== "beam" && r.kind !== "hand") r.life = 0;
          this.hurt(HIT_DMG[r.kind] ?? 8);
        }
      }
      if (r.kind !== "beam" && r.kind !== "hand" && r.kind !== "shock") {
        for (const pl of this.platforms) {
          if (!this.solid(pl) || pl.kind === "wall" && r.friendly === false && r.kind === "ring") continue;
          if (this.solid(pl) && this.aabb(box, pl)) {
            if (r.pierce && pl.kind !== "ground" && pl.kind !== "wall") continue;
            r.life = 0; this.burst(r.x, r.y, "#8a8a92", 3, 1); break;
          }
        }
      }
      if (r.kind === "shock" && (r.x < this.camMin || r.x > this.level.width)) r.life = 0;
    }
    this.riffs = this.riffs.filter((r) => r.life > 0);
  }

  bossCtx() {
    const p = this.p;
    return {
      px: p.x + p.w / 2, py: p.y + p.h / 2,
      spawn: (r) => this.spawnRiff(r),
      spawnEnemy: (t, x) => this.spawnEnemy(t, x),
      shake: (n) => { this.camShake = Math.max(this.camShake, n); },
      countType: (t) => this.enemies.filter((e) => e.alive && e.type === t).length,
      platformsTops: this.platforms.filter((pl) => pl.kind === "stage" && pl.x >= this.level.arenaX).map((pl) => ({ x: pl.x, y: pl.y, w: pl.w })),
      arenaMin: this.level.arenaX, arenaMax: this.level.width,
    };
  }

  updateEnemies() {
    const p = this.p;
    const ctx = this.bossCtx();
    for (const e of this.enemies) {
      if (!e.alive || e.dormant) continue;
      if (e.hitFlash > 0) e.hitFlash--;
      const onScreen = e.x + e.w > this.camX - 40 && e.x < this.camX + VIEW_W + 40;
      if (!onScreen) continue;

      if (e.boss || e.type === "clone") {
        updateBoss(e, ctx);
      } else if (e.type === "critic") {
        if (e.x < e.minX) { e.x = e.minX; e.vx = Math.abs(e.vx); }
        if (e.x > e.maxX) { e.x = e.maxX; e.vx = -Math.abs(e.vx); }
        e.facing = e.vx < 0 ? -1 : 1;
      } else if (e.type === "suit") {
        const dist = p.x - e.x;
        e.facing = dist < 0 ? -1 : 1;
        if (Math.abs(dist) < 140) {
          e.vx = 0;
          e.fireCd--;
          if (e.fireCd <= 0) {
            e.fireCd = 102;
            const dx = p.x + p.w / 2 - (e.x + e.w / 2), dy = p.y + p.h / 2 - (e.y + 6);
            const m = Math.hypot(dx, dy) || 1;
            this.spawnRiff({ x: e.x + e.w / 2, y: e.y + 6, vx: (dx / m) * 1.95, vy: (dy / m) * 1.95, kind: "note", pink: Math.random() < 0.35, life: 150 });
          }
        } else {
          e.vx = e.facing * 0.5;
          if (e.x < e.minX) { e.x = e.minX; e.vx = 0.5; }
          if (e.x > e.maxX) { e.x = e.maxX; e.vx = -0.5; }
        }
      }

      if (!e.flying) {
        e.vy += GRAVITY;
        if (e.vy > 6) e.vy = 6;
        this.moveBody(e, e.type === "clone");
        if (e.y > VIEW_H + 20) { e.alive = false; }
      } else {
        e.x += e.vx;
      }
      if (e.boss) {
        if (e.x < e.minX) { e.x = e.minX; if (e.state === "charge") e.vx = 0; }
        if (e.x > e.maxX) { e.x = e.maxX; }
      }

      // contact
      if (this.aabb(p, e)) {
        if (!e.big && !e.boss && p.vy > 0.5 && p.y + p.h - 6 < e.y + 4) {
          this.damage(e, 1); p.vy = JUMP_V * 0.65; A.playHit();
          this.burst(e.x + e.w / 2, e.y, "#ff7a1a", 6, 1.5);
        } else this.hurt(e.big ? TOUCH_DMG.big : e.boss ? TOUCH_DMG.mini : TOUCH_DMG.grunt);
      }
    }
    this.enemies = this.enemies.filter((e) => e.alive || e.boss);
  }

  updatePickups() {
    const p = this.p;
    for (const k of this.pickups) {
      if (k.taken) continue;
      k.bob += 0.08;
      if (this.aabb(p, k)) {
        if (k.type === "medkit" && p.hp >= p.maxHp) continue;
        k.taken = true; A.playPickup();
        if (k.type === "vinyl") this.score += 50;
        else if (k.type === "cassette") { this.score += 25; p.hp = Math.min(p.maxHp, p.hp + 28); this.burst(p.x + 5, p.y + 9, "#5cff9d", 10, 1.6); }
        else if (k.type === "medkit") {
          p.hp = Math.min(p.maxHp, p.hp + 40);
          this.score += 40;
          this.showBanner("KIT MÉDICO!", "VIDA +40", 44);
          this.burst(p.x + 5, p.y + 9, "#ff5a5a", 16, 2.2);
        }
        else if (k.type === "serum") {
          this.score += 75;
          p.speedT = 600;
          this.showBanner("SERINGA!", "VELOCIDADE TURBINADA", 50);
          this.burst(p.x + 5, p.y + 9, "#5cff9d", 18, 2.4);
        } else {
          p.activePedal = k.type;
          p.pedalT = 600;
          this.overdrive = true;
          this.score += 100;
          const color = k.type === "chorus" ? "#817dff" : k.type === "fuzz" ? "#f2c826" : "#ff7a1a";
          this.showBanner(`${k.type.toUpperCase()}!`, "NOVO SOM EQUIPADO", 48);
          this.burst(p.x + 5, p.y + 9, color, 20, 2.5);
        }
      }
    }
  }

  updateParticles() {
    for (const pt of this.particles) { pt.x += pt.vx; pt.y += pt.vy; pt.vy += 0.05; pt.life--; }
    this.particles = this.particles.filter((pt) => pt.life > 0);
  }

  // ============ RENDER ============
  render(ctx) {
    ctx.imageSmoothingEnabled = false;
    const sx = Math.round((Math.random() - 0.5) * this.camShake);
    const sy = Math.round((Math.random() - 0.5) * this.camShake);
    const cam = Math.round(this.camX);
    this.drawBackground(ctx, cam);
    ctx.save();
    ctx.translate(-cam + sx, sy);
    this.drawPlatforms(ctx, cam);
    this.drawPickups(ctx);
    this.drawGoal(ctx);
    this.drawEnemies(ctx);
    this.drawPlayer(ctx);
    this.drawRiffs(ctx);
    this.drawParticles(ctx);
    ctx.restore();
    this.drawVignette(ctx);
    // damage wash — heavier hits bleed more red across the frame
    if (this.dmgFlash > 0) {
      ctx.fillStyle = `rgba(190,20,40,${Math.min(0.5, this.dmgFlash / 34)})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.fillStyle = `rgba(255,60,80,${Math.min(0.35, this.dmgFlash / 40)})`;
      ctx.fillRect(0, 0, VIEW_W, 3); ctx.fillRect(0, VIEW_H - 3, VIEW_W, 3);
    }
    if (this.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${this.flash / 20})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
    if (this.overdrive) {
      const edge = this.p.activePedal === "chorus" ? ((this.t >> 2) % 2 ? "#817dff" : "#55d9ff")
        : this.p.activePedal === "fuzz" ? "#f2c826"
        : this.p.activePedal === "distortion" ? "#ff7a1a" : "#ff3fa4";
      ctx.strokeStyle = edge;
      ctx.lineWidth = 2; ctx.strokeRect(1, 1, VIEW_W - 2, VIEW_H - 2);
    }
    if (this.p.speedT > 0 && (this.t >> 2) % 2 === 0) {
      ctx.fillStyle = "#5cff9d";
      for (let x = 6; x < VIEW_W; x += 18) ctx.fillRect(x, VIEW_H - 3, 2, 1);
    }
    const hpPct = this.p.hp / this.p.maxHp;
    if (hpPct <= 0.25) {
      // critical health: pulsing frame + heartbeat haze
      const beat = (this.t >> 4) % 2 === 0;
      ctx.strokeStyle = beat ? "rgba(255,42,42,0.55)" : "rgba(255,42,42,0.25)";
      ctx.lineWidth = 2; ctx.strokeRect(1, 1, VIEW_W - 2, VIEW_H - 2);
      if (beat) {
        ctx.globalAlpha = 0.07; ctx.fillStyle = "#ff2a2a";
        ctx.fillRect(0, 0, VIEW_W, VIEW_H); ctx.globalAlpha = 1;
      }
    }
  }

  hash(n) {
    const x = Math.sin(n * 127.1) * 43758.5453;
    return x - Math.floor(x);
  }

  drawBackground(ctx, cam) {
    const big = this.level.bigBoss;
    const t = this.t;

    // ---- 1. banded sky with dithered seams ----
    const bands = big
      ? ["#1c070e", "#280d16", "#341420", "#401c28", "#4a2330"]
      : ["#0d0a13", "#141020", "#1b1628", "#221c31", "#2a2239"];
    const bh = Math.ceil(VIEW_H / bands.length);
    bands.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(0, i * bh, VIEW_W, bh + 1); });
    for (let i = 1; i < bands.length; i++) {
      ctx.fillStyle = bands[i];
      for (let x = 0; x < VIEW_W; x += 2) ctx.fillRect(x, i * bh - 1, 1, 1);
    }

    // ---- 2. drifting smoke ----
    ctx.globalAlpha = 0.055;
    ctx.fillStyle = big ? "#ff5a3c" : "#8f7bff";
    for (let i = 0; i < 4; i++) {
      const hx = ((i * 130 - t * 0.25) % (VIEW_W + 160) + VIEW_W + 160) % (VIEW_W + 160) - 80;
      const hy = 28 + i * 24 + Math.round(Math.sin(t * 0.01 + i) * 6);
      ctx.fillRect(Math.round(hx), hy, 92, 16);
      ctx.fillRect(Math.round(hx) + 12, hy - 5, 58, 6);
    }
    ctx.globalAlpha = 1;

    // ---- 3. brick back wall (parallax .35) ----
    const wallOff = Math.round(cam * 0.35);
    ctx.fillStyle = "#150f1b";
    ctx.fillRect(0, 40, VIEW_W, 104);
    for (let row = 0; row < 9; row++) {
      const y = 42 + row * 11;
      const shift = (row % 2) * 8 - (wallOff % 16);
      for (let x = -16 + shift; x < VIEW_W + 16; x += 16) {
        const hs = this.hash(Math.floor((x + wallOff) / 16) + row * 57);
        ctx.fillStyle = hs > 0.9 ? "#241a2b" : hs > 0.72 ? "#1d1626" : hs > 0.4 ? "#191222" : "#161020";
        ctx.fillRect(x, y, 15, 10);
        if (hs > 0.965) { ctx.fillStyle = "#0d0912"; ctx.fillRect(x + 4, y + 3, 5, 3); }
      }
      ctx.fillStyle = "#100c16";
      ctx.fillRect(0, y + 10, VIEW_W, 1);
    }

    // ---- 4. wall props: posters, graffiti, neon, road cases ----
    for (let x = -((wallOff % 104) + 104); x < VIEW_W + 104; x += 104) {
      const idx = Math.floor((x + wallOff) / 104);
      const kind = ((idx % 4) + 4) % 4;
      if (kind === 0) {
        ctx.fillStyle = "#0f0b14"; ctx.fillRect(x + 14, 58, 30, 40);
        ctx.fillStyle = "#6d3a3c"; ctx.fillRect(x + 15, 59, 28, 38);
        ctx.fillStyle = "#c9a227"; ctx.fillRect(x + 18, 63, 22, 3);
        ctx.fillStyle = "#b8202e"; ctx.fillRect(x + 18, 69, 22, 14);
        ctx.fillStyle = "#e7c675"; ctx.fillRect(x + 21, 72, 3, 3); ctx.fillRect(x + 32, 76, 3, 3);
        ctx.fillStyle = "#0f0b14"; ctx.fillRect(x + 34, 87, 9, 10);
        ctx.fillStyle = "#241a2b"; ctx.fillRect(x + 17, 90, 12, 2);
      } else if (kind === 1) {
        ctx.fillStyle = "#ff3fa4";
        for (let i = 0; i < 7; i++) ctx.fillRect(x + 20 + i * 3, 66 + (i % 3) * 4, 3, 8);
        ctx.fillStyle = "#55d9ff"; ctx.fillRect(x + 18, 80, 26, 2);
        ctx.fillStyle = "#f2c826"; ctx.fillRect(x + 44, 62, 3, 3);
        ctx.fillStyle = "rgba(255,63,164,0.12)"; ctx.fillRect(x + 16, 60, 34, 24);
      } else if (kind === 2) {
        const on = (t >> 4) % 7 !== 0;
        ctx.fillStyle = "#0f0b14"; ctx.fillRect(x + 18, 56, 34, 16);
        ctx.fillStyle = on ? "#ff2a5a" : "#3a1020";
        ctx.fillRect(x + 20, 58, 30, 1); ctx.fillRect(x + 20, 69, 30, 1);
        ctx.fillRect(x + 20, 58, 1, 12); ctx.fillRect(x + 49, 58, 1, 12);
        for (let i = 0; i < 10; i++) ctx.fillRect(x + 23 + i * 2, 63 + (i % 2 ? 1 : -1), 2, 1);
        if (on) { ctx.globalAlpha = 0.15; ctx.fillStyle = "#ff2a5a"; ctx.fillRect(x + 14, 52, 42, 24); ctx.globalAlpha = 1; }
      } else {
        ctx.fillStyle = "#0d0d0d"; ctx.fillRect(x + 16, 74, 34, 24);
        ctx.fillStyle = "#2b2b33"; ctx.fillRect(x + 18, 76, 30, 20);
        ctx.fillStyle = "#0d0d0d"; ctx.fillRect(x + 18, 85, 30, 1);
        ctx.fillStyle = "#c9a227"; ctx.fillRect(x + 20, 79, 6, 2); ctx.fillRect(x + 40, 79, 6, 2);
        ctx.fillStyle = "#3c3c44"; ctx.fillRect(x + 24, 66, 20, 8);
        ctx.fillStyle = "#0d0d0d"; ctx.fillRect(x + 26, 68, 16, 4);
      }
    }
    // ---- 5. light rig: truss, swinging fixtures, dithered cones ----
    const lightScroll = Math.round(cam * 0.2);
    for (let i = 0; i < 6; i++) {
      const raw = ((i * 97 - lightScroll) % (VIEW_W + 60) + VIEW_W + 60) % (VIEW_W + 60) - 30;
      const lx = Math.round(raw);
      const hue = (i * 63 + t * (big ? 1.1 : 0.5)) % 360;
      const swing = Math.sin(t * 0.012 + i * 1.7) * 16;
      for (let step = 0; step < 11; step++) {
        const bw = 5 + step * 6;
        const cxp = Math.round(lx + swing * (step / 11));
        ctx.fillStyle = `hsla(${hue},85%,62%,0.075)`;
        ctx.fillRect(cxp - (bw >> 1), 14 + step * 11, bw, 10);
        ctx.globalAlpha = 0.05;
        ctx.fillRect(cxp - (bw >> 1) - 1, 14 + step * 11, 1, 10);
        ctx.fillRect(cxp + (bw >> 1), 14 + step * 11, 1, 10);
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = "#15151b"; ctx.fillRect(lx - 3, 7, 7, 6);
      ctx.fillStyle = "#3c3c44"; ctx.fillRect(lx - 2, 12, 5, 2);
      ctx.fillStyle = `hsl(${hue},92%,70%)`; ctx.fillRect(lx - 1, 13, 3, 1);
      ctx.globalAlpha = 0.22; ctx.fillStyle = `hsl(${hue},95%,78%)`;
      ctx.fillRect(lx - 4, 11, 9, 5); ctx.globalAlpha = 1;
    }
    // truss
    ctx.fillStyle = "#2a2a32";
    ctx.fillRect(0, 3, VIEW_W, 1); ctx.fillRect(0, 11, VIEW_W, 1);
    for (let x = -(lightScroll % 12); x < VIEW_W; x += 12) {
      ctx.fillRect(x, 4, 1, 7);
      ctx.fillStyle = "#22222a"; ctx.fillRect(x + 1, 5, 5, 1); ctx.fillRect(x + 6, 8, 5, 1);
      ctx.fillStyle = "#2a2a32";
    }
    // ---- 6. PA speaker stacks (parallax .55) ----
    const spkOff = Math.round(cam * 0.55);
    for (let x = -((spkOff % 150) + 150); x < VIEW_W + 150; x += 150) {
      const sx = Math.round(x);
      ctx.fillStyle = "#0b0b0f"; ctx.fillRect(sx, 96, 26, 48);
      ctx.fillStyle = "#1c1c24"; ctx.fillRect(sx + 2, 98, 22, 44);
      ctx.fillStyle = "#0b0b0f"; ctx.fillRect(sx + 5, 101, 16, 14);
      ctx.fillStyle = "#2a2a32"; ctx.fillRect(sx + 8, 104, 10, 8);
      ctx.fillStyle = "#3c3c44"; ctx.fillRect(sx + 11, 106, 4, 4);
      ctx.fillStyle = "#0b0b0f"; ctx.fillRect(sx + 5, 120, 16, 16);
      ctx.fillStyle = "#2a2a32"; ctx.fillRect(sx + 9, 124, 8, 8);
      ctx.fillStyle = "#3c3c44"; ctx.fillRect(sx + 12, 127, 3, 3);
      // grille highlight + power LED on the beat
      ctx.fillStyle = "rgba(255,255,255,0.05)"; ctx.fillRect(sx + 2, 98, 22, 1);
      ctx.fillStyle = (t >> 3) % 2 ? "#ff2a2a" : "#5a1010"; ctx.fillRect(sx + 21, 99, 2, 2);
      // cone thump pulse
      if ((t >> 2) % 8 < 2) {
        ctx.globalAlpha = 0.12; ctx.fillStyle = "#ffe9a8";
        ctx.fillRect(sx + 4, 100, 18, 16); ctx.globalAlpha = 1;
      }
    }

    // ---- 7. crowd (parallax .7) ----
    const coff = Math.round(cam * 0.7);
    for (let i = -2; i < VIEW_W / 9 + 3; i++) {
      const wx = i + Math.floor(coff / 9);
      const x = Math.round(i * 9 - (coff % 9));
      const hs = this.hash(wx * 3.7);
      const bob = Math.round(Math.sin(t * 0.15 + wx * 1.3) * 2 + (hs > 0.7 ? Math.sin(t * 0.31 + wx) : 0));
      const shirt = ["#1a1020", "#221428", "#141018", "#2a1520"][Math.floor(hs * 4)];
      ctx.fillStyle = shirt; ctx.fillRect(x, 137 + bob, 7, 15);
      ctx.fillStyle = hs > 0.5 ? "#171220" : "#0d0a12"; ctx.fillRect(x + 1, 132 + bob, 5, 5);
      if (hs > 0.82) { ctx.fillStyle = "#3a2a44"; ctx.fillRect(x + 1, 130 + bob, 5, 2); }
      ctx.fillStyle = "rgba(255,120,180,0.10)"; ctx.fillRect(x, 137 + bob, 7, 1);
      if (hs > 0.62) {
        const arm = (t >> 3) % 2;
        ctx.fillStyle = shirt; ctx.fillRect(x + 6, 126 + bob + arm, 2, 10);
        ctx.fillStyle = "#241a2b"; ctx.fillRect(x + 5, 124 + bob + arm, 3, 2);
      } else if (hs < 0.2) {
        ctx.fillStyle = shirt; ctx.fillRect(x - 1, 132 + bob, 2, 8);
      }
      if (hs > 0.93 && (t >> 2) % 6 < 4) {
        ctx.fillStyle = "#ffe9a8"; ctx.fillRect(x + 6, 121 + bob, 1, 1);
        ctx.globalAlpha = 0.22; ctx.fillRect(x + 5, 120 + bob, 3, 3); ctx.globalAlpha = 1;
      }
      if (hs > 0.45 && hs < 0.55) { ctx.fillStyle = "#b8202e"; ctx.fillRect(x + 2, 141 + bob, 3, 2); }
    }

    // ---- 8. floor haze ----
    ctx.globalAlpha = 0.13;
    ctx.fillStyle = big ? "#ff7a4a" : "#7a6aa8";
    for (let x = 0; x < VIEW_W; x += 4) {
      const hh = 3 + Math.round(Math.sin(x * 0.11 + t * 0.03) * 2 + Math.sin(x * 0.05 - t * 0.02) * 2);
      ctx.fillRect(x, 150 - hh, 4, hh);
    }
    ctx.globalAlpha = 1;
  }

  drawPlatforms(ctx, cam) {
    for (const p of this.platforms) {
      if (p.x + p.w < cam - 10 || p.x > cam + VIEW_W + 10) continue;
      if (p.kind === "ground") {
        // body
        ctx.fillStyle = "#1b1520"; ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.fillStyle = "#150f19"; ctx.fillRect(p.x, p.y + 14, p.w, p.h - 14);
        // worn top lip
        ctx.fillStyle = "#4a3848"; ctx.fillRect(p.x, p.y, p.w, 1);
        ctx.fillStyle = "#332634"; ctx.fillRect(p.x, p.y + 1, p.w, 2);
        ctx.fillStyle = "#241b26";
        for (let x = p.x; x < p.x + p.w; x += 2) if (((x >> 1) & 1) === 0) ctx.fillRect(x, p.y + 3, 1, 1);
        // gravel + cracks (deterministic)
        for (let x = p.x; x < p.x + p.w; x += 6) {
          const hs = this.hash(x * 0.37);
          ctx.fillStyle = hs > 0.6 ? "#2c2230" : "#120d16";
          ctx.fillRect(x + Math.floor(hs * 4), p.y + 6 + Math.floor(hs * 12), 2, 1);
          if (hs > 0.88) {
            ctx.fillStyle = "#0e0a12";
            ctx.fillRect(x + 1, p.y + 5, 1, 4); ctx.fillRect(x + 2, p.y + 8, 1, 3);
          }
          if (hs > 0.95) { ctx.fillStyle = "#b8202e"; ctx.fillRect(x + 3, p.y + 4, 2, 1); } // dropped pick
          if (hs < 0.05) { ctx.fillStyle = "#8a8a92"; ctx.fillRect(x + 2, p.y + 3, 1, 2); } // cigarette
        }
        // cable run
        ctx.fillStyle = "#0a0a0e"; ctx.fillRect(p.x, p.y + 9, p.w, 2);
        ctx.fillStyle = "#1e1e26"; ctx.fillRect(p.x, p.y + 9, p.w, 1);
        for (let x = p.x + 20; x < p.x + p.w; x += 60) {
          ctx.fillStyle = "#3c3c44"; ctx.fillRect(x, p.y + 8, 4, 4);
          ctx.fillStyle = "#0a0a0e"; ctx.fillRect(x + 1, p.y + 9, 2, 2);
        }
        // coloured light spill pooling on the floor
        ctx.globalAlpha = 0.07;
        for (let x = p.x; x < p.x + p.w; x += 48) {
          ctx.fillStyle = this.level.bigBoss ? "#ff5a3c" : "#8f7bff";
          ctx.fillRect(x + 6, p.y + 1, 30, 5);
        }
        ctx.globalAlpha = 1;
      } else if (p.kind === "stage") {
        // wooden riser
        ctx.fillStyle = "#4a2f18"; ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.fillStyle = "#7a5a30"; ctx.fillRect(p.x, p.y, p.w, 1);
        ctx.fillStyle = "#8f6b3a";
        for (let x = p.x; x < p.x + p.w; x += 3) ctx.fillRect(x, p.y + 1, 1, 1);
        ctx.fillStyle = "#2d1b0c"; ctx.fillRect(p.x, p.y + p.h - 1, p.w, 1);
        ctx.fillStyle = "#3a2410"; ctx.fillRect(p.x, p.y + p.h - 2, p.w, 1);
        // plank seams + nail heads
        for (let x = p.x + 5; x < p.x + p.w - 2; x += 11) {
          ctx.fillStyle = "#2d1b0c"; ctx.fillRect(x, p.y + 2, 1, p.h - 4);
          ctx.fillStyle = "#c9a227"; ctx.fillRect(x - 3, p.y + 2, 1, 1);
          ctx.fillStyle = "#c9a227"; ctx.fillRect(x + 3, p.y + 3, 1, 1);
        }
        // support brackets
        ctx.fillStyle = "#241508";
        ctx.fillRect(p.x + 3, p.y + p.h, 3, 4);
        ctx.fillRect(p.x + p.w - 6, p.y + p.h, 3, 4);
        ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(p.x, p.y + p.h, p.w, 2);
      } else if (p.kind === "amp") {
        const x = p.x, y = p.y, w = p.w, h = p.h;
        // tolex body
        ctx.fillStyle = "#0b0b0f"; ctx.fillRect(x, y, w, h);
        ctx.fillStyle = "#191920"; ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
        // chrome corner protectors
        ctx.fillStyle = "#8a8a92";
        ctx.fillRect(x, y, 3, 1); ctx.fillRect(x, y, 1, 3);
        ctx.fillRect(x + w - 3, y, 3, 1); ctx.fillRect(x + w - 1, y, 1, 3);
        ctx.fillRect(x, y + h - 1, 3, 1); ctx.fillRect(x, y + h - 3, 1, 3);
        ctx.fillRect(x + w - 3, y + h - 1, 3, 1); ctx.fillRect(x + w - 1, y + h - 3, 1, 3);
        // grille cloth weave
        ctx.fillStyle = "#33333c"; ctx.fillRect(x + 3, y + 6, w - 6, h - 10);
        ctx.fillStyle = "#191920";
        for (let gy = y + 7; gy < y + h - 5; gy += 2) for (let gx = x + 4; gx < x + w - 4; gx += 2) ctx.fillRect(gx, gy, 1, 1);
        ctx.fillStyle = "rgba(255,255,255,0.05)"; ctx.fillRect(x + 3, y + 6, w - 6, 1);
        // control panel
        ctx.fillStyle = "#2a2018"; ctx.fillRect(x + 2, y + 2, w - 4, 4);
        ctx.fillStyle = "#c9a227"; ctx.fillRect(x + 4, y + 3, 7, 1); // logo plate
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = "#0b0b0f"; ctx.fillRect(x + 13 + i * 4, y + 2, 3, 3);
          ctx.fillStyle = "#e8e8f0"; ctx.fillRect(x + 14 + i * 4, y + 3, 1, 1);
        }
        // power jewel
        ctx.fillStyle = (this.t >> 3) % 2 ? "#ff2a2a" : "#6a1010"; ctx.fillRect(x + w - 5, y + 3, 2, 2);
        // handle
        ctx.fillStyle = "#0b0b0f"; ctx.fillRect(x + w / 2 - 4, y - 2, 8, 2);
        ctx.fillStyle = "#3c3c44"; ctx.fillRect(x + w / 2 - 3, y - 1, 6, 1);
      } else if (p.kind === "crate") {
        const x = p.x, y = p.y, w = p.w, h = p.h;
        ctx.fillStyle = "#5a3a1e"; ctx.fillRect(x, y, w, h);
        ctx.fillStyle = "#7a5230"; ctx.fillRect(x + 1, y + 1, w - 2, 1);
        ctx.fillStyle = "#2d1b0c"; ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x + w - 1, y, 1, h);
        // diagonal braces
        for (let i = 1; i < w - 1; i++) {
          ctx.fillStyle = "#3a2410";
          ctx.fillRect(x + i, y + i, 1, 1);
          ctx.fillRect(x + w - 1 - i, y + i, 1, 1);
        }
        ctx.fillStyle = "#8f6b3a";
        for (let i = 2; i < w - 2; i++) ctx.fillRect(x + i, y + i - 1, 1, 1);
        // steel corners
        ctx.fillStyle = "#8a8a92";
        ctx.fillRect(x, y, 3, 1); ctx.fillRect(x, y, 1, 3);
        ctx.fillRect(x + w - 3, y + h - 1, 3, 1); ctx.fillRect(x + w - 1, y + h - 3, 1, 3);
        // stencilled label
        ctx.fillStyle = "#c9a227"; ctx.fillRect(x + 4, y + h / 2 - 1, w - 8, 2);
        ctx.fillStyle = "#5a3a1e"; ctx.fillRect(x + 5, y + h / 2 - 1, 1, 2); ctx.fillRect(x + w - 6, y + h / 2 - 1, 1, 2);
      }
    }
  }

  drawPickups(ctx) {
    for (const k of this.pickups) {
      if (k.taken) continue;
      const spr = k.type === "vinyl" ? S.VINYL
        : k.type === "cassette" ? S.CASSETTE
        : k.type === "chorus" ? S.CHORUS_PEDAL
        : k.type === "fuzz" ? S.FUZZ_PEDAL
        : k.type === "distortion" ? S.DISTORTION_PEDAL
        : k.type === "serum" ? S.SYRINGE : S.MEDKIT;
      const glowCol = k.type === "chorus" ? "#8275ff"
        : k.type === "fuzz" ? "#f2c826"
        : k.type === "distortion" ? "#ff7a1a"
        : k.type === "serum" ? "#5cff9d"
        : k.type === "medkit" ? "#ff5a5a"
        : k.type === "vinyl" ? "#b8202e" : "#ffe9a8";
      const isPower = k.type === "chorus" || k.type === "fuzz" || k.type === "distortion" || k.type === "serum" || k.type === "medkit";

      const bob = Math.sin(k.bob) * 2;
      const sx = Math.round(k.x + (k.w - spr.w) / 2);
      const sy = Math.round(k.y + (k.h - spr.h) / 2 + bob);

      // floor shadow (squashes as the item bobs)
      const shW = Math.max(3, spr.w - 2 - Math.round(Math.abs(bob)));
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.fillRect(Math.round(sx + (spr.w - shW) / 2), Math.round(k.y + k.h + 1), shW, 1);

      if (isPower) {
        // pulsing halo
        const pulse = 0.5 + Math.sin(this.t * 0.12) * 0.5;
        const hr = 3 + Math.round(pulse * 3);
        ctx.globalAlpha = 0.1 + pulse * 0.12;
        ctx.fillStyle = glowCol;
        for (let ring = hr; ring > 0; ring -= 2) {
          ctx.fillRect(sx + spr.w / 2 - ring, sy + spr.h / 2 - ring, ring * 2, ring * 2);
        }
        ctx.globalAlpha = 1;
        // orbiting spark
        const a = this.t * 0.08 + k.bob;
        ctx.fillStyle = glowCol;
        ctx.fillRect(
          Math.round(sx + spr.w / 2 + Math.cos(a) * (spr.w / 2 + 3)),
          Math.round(sy + spr.h / 2 + Math.sin(a) * (spr.h / 2 + 3)),
          1, 1
        );
      }
      S.drawSprite(ctx, spr, sx, sy);
      // specular blink on the chassis corner
      if (isPower && (this.t >> 4) % 5 === 0) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(sx + 1, sy + 1, 2, 1);
        ctx.fillRect(sx + 1, sy + 2, 1, 1);
      }
    }
  }

  drawGoal(ctx) {
    if (this.level.goalX <= 0) return;
    if (this.bossActive && this.bossActive.alive) return;
    const gx = this.level.goalX;
    // pole
    ctx.fillStyle = "#3c3c44"; ctx.fillRect(gx, GROUND_Y - 62, 2, 62);
    ctx.fillStyle = "#8a8a92"; ctx.fillRect(gx, GROUND_Y - 62, 1, 62);
    // sign board
    ctx.fillStyle = "#0d0d0d"; ctx.fillRect(gx + 2, GROUND_Y - 60, 26, 18);
    ctx.fillStyle = (this.t >> 3) % 2 ? "#b8202e" : "#8a1020"; ctx.fillRect(gx + 3, GROUND_Y - 59, 24, 16);
    ctx.fillStyle = "#f2c826"; ctx.fillRect(gx + 3, GROUND_Y - 59, 24, 1);
    ctx.fillStyle = "#5a1020"; ctx.fillRect(gx + 3, GROUND_Y - 45, 24, 1);
    // animated chevrons
    for (let i = 0; i < 3; i++) {
      const on = (((this.t >> 2) + i) % 3) === 0;
      ctx.fillStyle = on ? "#ffffff" : "#f2c826";
      const ax = gx + 6 + i * 6;
      ctx.fillRect(ax, GROUND_Y - 55, 2, 8);
      ctx.fillRect(ax + 2, GROUND_Y - 54, 1, 6);
      ctx.fillRect(ax + 3, GROUND_Y - 53, 1, 4);
    }
    // light pool on the floor
    ctx.globalAlpha = 0.14; ctx.fillStyle = "#f2c826";
    ctx.fillRect(gx - 6, GROUND_Y - 2, 36, 2);
    ctx.globalAlpha = 1;
  }

  drawEnemies(ctx) {
    for (const e of this.enemies) {
      if (!e.alive || e.dormant) continue;
      const flip = e.facing === 1;
      const hitFlash = e.hitFlash > 0 && (e.hitFlash >> 1) % 2 === 0;
      const stun = e.state === "stun";
      let spr;
      switch (e.type) {
        case "critic": spr = S.CRITIC; break;
        case "suit": spr = S.SUIT; break;
        case "critic_king": spr = S.CRITIC_KING; break;
        case "bouncer": spr = S.BOUNCER; break;
        case "feedback": spr = S.FEEDBACK; break;
        case "clone": {
          const moving = Math.abs(e.vx) > 0.3;
          spr = !e.onGround ? this.cloneSprites.jump : moving ? ((this.t >> 3) % 2 ? this.cloneSprites.run1 : this.cloneSprites.run2) : this.cloneSprites.idle;
          break;
        }
        case "machine": spr = S.MACHINE; break;
        default: spr = S.GOD;
      }
      const bobY = e.type === "critic" || e.type === "suit" ? (Math.abs(e.vx) > 0.1 ? ((this.t >> 3) % 2) : 0) : 0;
      const ox = e.x + (e.w - spr.w) / 2, oy = e.y + e.h - spr.h - bobY;
      // shadow + coloured stage under-glow
      if (!e.flying) {
        ctx.globalAlpha = e.boss ? 0.2 : 0.13;
        ctx.fillStyle = e.boss ? "#ff5a3c" : "#ff3fa4";
        ctx.fillRect(Math.round(e.x - 1), Math.round(e.y + e.h - 2), e.w + 2, 2);
        ctx.globalAlpha = 1;
        ctx.fillStyle = "rgba(0,0,0,0.42)"; ctx.fillRect(Math.round(e.x + 1), Math.round(e.y + e.h - 1), e.w - 2, 1);
        ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.fillRect(Math.round(e.x), Math.round(e.y + e.h), e.w, 1);
      }
      // windup/charge glow
      if (e.state === "windup" && (this.t >> 2) % 2) { ctx.fillStyle = "rgba(255,42,42,0.3)"; ctx.fillRect(Math.round(e.x - 2), Math.round(e.y - 2), e.w + 4, e.h + 4); }
      if (e.type === "feedback") {
        const glow = e.phase === 2 ? 0.35 : 0.2;
        ctx.fillStyle = `rgba(255,42,42,${glow * (0.5 + Math.sin(this.t * 0.2) * 0.5)})`;
        ctx.fillRect(Math.round(e.x - 4), Math.round(e.y - 4), e.w + 8, e.h + 8);
      }
      if (e.type === "god") {
        ctx.fillStyle = `rgba(242,200,38,${0.12 + Math.sin(this.t * 0.1) * 0.06})`;
        ctx.beginPath(); ctx.arc(Math.round(e.x + e.w / 2), Math.round(e.y + e.h / 2), 30, 0, Math.PI * 2); ctx.fill();
      }
      S.drawSprite(ctx, spr, ox, oy, flip && e.type !== "feedback", stun ? Math.sin(this.t * 0.4) * 0.15 : 0);
      if (e.type === "clone") this.drawGuitar(ctx, e.x + e.w / 2, e.y + 9, e.facing, 0, 0);
      if (hitFlash) {
        ctx.globalCompositeOperation = "source-atop";
        ctx.fillStyle = "rgba(255,255,255,0.8)"; ctx.fillRect(Math.round(ox), Math.round(oy), spr.w, spr.h);
        ctx.globalCompositeOperation = "source-over";
      }
      if (stun) {
        for (let i = 0; i < 3; i++) {
          const a = this.t * 0.15 + i * 2.1;
          ctx.fillStyle = "#f2c826"; ctx.fillRect(Math.round(e.x + e.w / 2 + Math.cos(a) * 10), Math.round(e.y - 6 + Math.sin(a) * 3), 2, 2);
        }
      }
      if (!e.boss && e.maxHp > 2 && e.hp < e.maxHp) {
        ctx.fillStyle = "#0d0d0d"; ctx.fillRect(Math.round(e.x), Math.round(e.y - 4), e.w, 2);
        ctx.fillStyle = "#ff2a2a"; ctx.fillRect(Math.round(e.x), Math.round(e.y - 4), Math.round((e.w * e.hp) / e.maxHp), 2);
      }
    }
  }

  drawGuitar(ctx, cx, cy, facing, aimX, aimY, strum = 0) {
    const ang = aimX === 0 && aimY === 0 ? 0 : Math.atan2(aimY, Math.abs(aimX) || (aimY !== 0 ? 0.0001 : 1));
    const flip = facing === -1;
    ctx.save();
    ctx.translate(Math.round(cx), Math.round(cy));
    if (flip) ctx.scale(-1, 1);
    ctx.rotate(ang + (strum > 0 ? -0.12 : 0));
    ctx.drawImage(S.GUITAR.c, -4, -3);
    ctx.restore();
  }

  drawPlayer(ctx) {
    const p = this.p;
    if (p.invuln > 0 && (p.invuln >> 2) % 2 === 0) return;
    const moving = Math.abs(p.vx) > 0.3;
    const spr = !p.onGround ? this.sprites.jump : moving && !p.locked ? ((p.animT >> 3) % 2 ? this.sprites.run1 : this.sprites.run2) : this.sprites.idle;
    const flip = p.facing === -1;
    ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.fillRect(Math.round(p.x), Math.round(p.y + p.h - 1), p.w, 1);
    ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y + p.h), p.w + 2, 1);

    // active-pedal aura
    const aura = p.activePedal === "chorus" ? "#8275ff"
      : p.activePedal === "fuzz" ? "#f2c826"
      : p.activePedal === "distortion" ? "#ff7a1a" : null;
    if (aura) {
      const pulse = (this.t >> 2) % 4;
      ctx.globalAlpha = 0.16 + (3 - pulse) * 0.05;
      ctx.fillStyle = aura;
      ctx.fillRect(Math.round(p.x) - 1 - pulse, Math.round(p.y) - 2, p.w + 2 + pulse * 2, p.h + 3);
      ctx.globalAlpha = 1;
      // rising sparks
      if ((this.t & 3) === 0) {
        ctx.fillStyle = aura;
        ctx.fillRect(Math.round(p.x + Math.random() * p.w), Math.round(p.y + p.h - (this.t % 18)), 1, 1);
      }
    }
    if (p.speedT > 0) {
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = "#5cff9d";
      for (let i = 1; i <= 3; i++) {
        ctx.fillRect(Math.round(p.x - p.vx * i * 1.6), Math.round(p.y + 2 + i), p.w, 1);
      }
      ctx.globalAlpha = 1;
    }
    if (p.speedT > 0 && moving && (this.t & 3) === 0) {
      ctx.globalAlpha = 0.28;
      S.drawSprite(ctx, spr, p.x - p.vx * 3, p.y - 1, flip);
      ctx.globalAlpha = 1;
    }
    if (p.dashT > 0) {
      ctx.globalAlpha = 0.4;
      S.drawSprite(ctx, spr, p.x - 1 - p.facing * 6, p.y - 1, flip);
      ctx.globalAlpha = 1;
    }
    const oy = p.locked ? p.y + 1 : p.y - 1;
    S.drawSprite(ctx, spr, p.x - 1, oy, flip);
    // guitar aim
    let ax = p.aimX, ay = p.aimY;
    if (ax === 0) ax = 0.0001 * p.facing;
    this.drawGuitar(ctx, p.x + p.w / 2 + p.facing * 2, oy + 11, p.facing, Math.abs(ax), ay, p.strum);
    if (p.parryT > 0) {
      ctx.strokeStyle = "#ff3fa4"; ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(p.x - 3) + 0.5, Math.round(p.y - 3) + 0.5, p.w + 6, p.h + 6);
    }
  }

  drawRiffs(ctx) {
    for (const r of this.riffs) {
      const x = Math.round(r.x), y = Math.round(r.y);
      if (r.kind === "beam") {
        if (r.telegraph > 0) {
          if ((this.t >> 2) % 2) { ctx.fillStyle = "rgba(255,42,42,0.25)"; ctx.fillRect(r.x, r.y, r.w, r.h); }
          ctx.fillStyle = "#ff2a2a"; ctx.fillRect(r.x, r.y + r.h / 2, r.w, 1);
        } else {
          ctx.fillStyle = "#ff2a2a"; ctx.fillRect(r.x, r.y, r.w, r.h);
          ctx.fillStyle = "#ffe9a8"; ctx.fillRect(r.x, r.y + 2, r.w, r.h - 4);
          ctx.fillStyle = "#fff"; for (let i = 0; i < r.w; i += 6) ctx.fillRect(r.x + i + (this.t % 6), r.y + r.h / 2, 3, 1);
        }
        continue;
      }
      if (r.kind === "hand") {
        if (r.telegraph > 0) { ctx.fillStyle = (this.t >> 2) % 2 ? "rgba(242,200,38,0.5)" : "transparent"; ctx.fillRect(r.vx > 0 ? this.camMin : this.level.width - 6, r.y, 6, r.h); continue; }
        ctx.fillStyle = "#c9a227"; ctx.fillRect(x, y, r.w, r.h);
        ctx.fillStyle = "#f2c826"; ctx.fillRect(x + 2, y + 2, r.w - 4, r.h - 4);
        ctx.fillStyle = "#0d0d0d"; for (let i = 0; i < 4; i++) ctx.fillRect(x + 3 + i * 6, y + 1, 1, r.h - 2);
        continue;
      }
      if (r.kind === "chorus" || r.kind === "fuzz") {
        const angle = r.angle ?? 0;
        const dx = Math.cos(angle), dy = Math.sin(angle);
        const len = r.beamLength ?? 0;
        const chorus = r.kind === "chorus";
        const fade = Math.min(1, r.life / (chorus ? 3 : 12));

        // muzzle bloom at the guitar head
        ctx.globalAlpha = 0.3 * fade;
        ctx.fillStyle = chorus ? "#8275ff" : "#f2c826";
        ctx.fillRect(Math.round(r.x) - 3, Math.round(r.y) - 3, 7, 7);
        ctx.globalAlpha = 0.75 * fade;
        ctx.fillRect(Math.round(r.x) - 1, Math.round(r.y) - 1, 3, 3);
        ctx.globalAlpha = 1;

        for (let d = 0; d <= len; d += 2) {
          const off = this.beamOffset(r, d);
          const bx = Math.round(r.x + dx * d);
          const by = Math.round(r.y + dy * d + off);
          if (chorus) {
            // rounded, liquid wave: violet/cyan body with a soft crest
            ctx.fillStyle = (d + (this.t >> 1)) % 6 < 3 ? "#8275ff" : "#57d9ff";
            ctx.fillRect(bx, by - 1, 2, 3);
            ctx.fillStyle = "#e3dcff";
            ctx.fillRect(bx, by, 2, 1);
          } else {
            // triangular, hard-edged: yellow core, white crests, burnt underside
            ctx.fillStyle = "#f2c826";
            ctx.fillRect(bx, by - 1, 2, 3);
            ctx.fillStyle = "#fff3a1";
            ctx.fillRect(bx, by, 2, 1);
            if (Math.abs(off) > 2.1) { ctx.fillStyle = "#ffffff"; ctx.fillRect(bx, by - 2, 2, 1); }
            ctx.fillStyle = "#b8450f";
            ctx.fillRect(bx, by + 2, 2, 1);
          }
        }

        // impact flare where the beam meets geometry
        if (r.endX !== undefined && len > 6) {
          const ix = Math.round(r.endX), iy = Math.round(r.endY ?? 0);
          const s = chorus ? 2 : 3 + Math.round(fade * 2);
          ctx.fillStyle = chorus ? "#57d9ff" : "#ffffff";
          ctx.fillRect(ix - s, iy, s * 2, 1);
          ctx.fillRect(ix, iy - s, 1, s * 2);
          ctx.fillStyle = chorus ? "#8275ff" : "#f2c826";
          ctx.fillRect(ix - s - 1, iy, 1, 1); ctx.fillRect(ix + s, iy, 1, 1);
          ctx.fillRect(ix, iy - s - 1, 1, 1); ctx.fillRect(ix, iy + s, 1, 1);
        }
        continue;
      }
      if (r.kind === "shotgun") {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(r.angle ?? 0);
        ctx.fillStyle = "#c84913";
        ctx.fillRect(-4, -2, 8, 4);
        ctx.fillStyle = "#ff7a1a";
        ctx.fillRect(-2, -2, 6, 3);
        ctx.fillStyle = "#ffe9a8";
        ctx.fillRect(2, -1, 2, 1);
        ctx.fillStyle = "#f2c826";
        ctx.fillRect(-7, -1, 2, 1);
        ctx.restore();
        continue;
      }
      const col = r.friendly ? (r.kind === "ex" ? "#ff3fa4" : r.power > 1 ? "#ff7a1a" : "#f2c826") : r.pink ? "#ff3fa4" : "#ff2a2a";
      ctx.fillStyle = col;
      if (r.kind === "note" || r.kind === "ex") {
        const s = r.kind === "ex" ? 2 : 1;
        // musical note: head + stem + wave trail
        ctx.fillRect(x - 2 * s, y - s, 4 * s, 3 * s);
        ctx.fillRect(x + 1 * s, y - 5 * s, 1 * s, 5 * s);
        ctx.fillRect(x + 2 * s, y - 5 * s, 2 * s, 1 * s);
        const dir = Math.sign(r.vx) || 1;
        for (let i = 1; i <= 4; i++) {
          ctx.fillStyle = i < 3 ? col : "rgba(255,255,255,0.3)";
          ctx.fillRect(x - dir * (3 + i * 2) * s, y + Math.round(Math.sin(r.wave + i) * 2 * s), 1 * s, 1 * s);
        }
        if (r.pink) { ctx.fillStyle = "rgba(255,63,164,0.35)"; ctx.fillRect(x - 4, y - 6, 9, 9); }
      } else if (r.kind === "paper") {
        ctx.fillStyle = r.pink ? "#ff3fa4" : "#f2f2f2"; ctx.fillRect(x - 3, y - 4, 6, 8);
        ctx.fillStyle = "#0d0d0d"; ctx.fillRect(x - 2, y - 2, 4, 1); ctx.fillRect(x - 2, y, 3, 1); ctx.fillRect(x - 2, y + 2, 4, 1);
      } else if (r.kind === "ring") {
        ctx.fillStyle = col; ctx.fillRect(x - 3, y - 1, 6, 2); ctx.fillRect(x - 1, y - 3, 2, 6);
        ctx.fillStyle = r.pink ? "#ffe9a8" : "#ffb0b0"; ctx.fillRect(x - 1, y - 1, 2, 2);
      } else if (r.kind === "coin") {
        ctx.fillStyle = r.pink ? "#ff3fa4" : "#f2c826"; ctx.fillRect(x - 2, y - 3, 4, 6); ctx.fillRect(x - 3, y - 2, 6, 4);
        ctx.fillStyle = "#0d0d0d"; ctx.fillRect(x, y - 2, 1, 4);
      } else if (r.kind === "shock") {
        const h = 4 + Math.round(Math.sin(r.wave * 2) * 2);
        ctx.fillStyle = col; ctx.fillRect(x - 3, y - h, 6, h + 3);
        ctx.fillStyle = "#ffe9a8"; ctx.fillRect(x - 1, y - h - 2, 2, 2);
      }
    }
  }

  drawParticles(ctx) {
    for (const pt of this.particles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, pt.life / pt.maxLife + 0.2));
      ctx.fillStyle = pt.color; ctx.fillRect(Math.round(pt.x), Math.round(pt.y), pt.size, pt.size);
    }
    ctx.globalAlpha = 1;
  }

  drawVignette(ctx) {
    // boss-arena heat haze
    if (this.level.bigBoss) {
      ctx.globalAlpha = 0.07 + Math.sin(this.t * 0.05) * 0.03;
      ctx.fillStyle = "#ff2a2a";
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.globalAlpha = 1;
    }
    // banded corner vignette
    ctx.fillStyle = "rgba(0,0,0,0.16)";
    ctx.fillRect(0, 0, VIEW_W, 3); ctx.fillRect(0, VIEW_H - 3, VIEW_W, 3);
    ctx.fillRect(0, 0, 3, VIEW_H); ctx.fillRect(VIEW_W - 3, 0, 3, VIEW_H);
    ctx.fillStyle = "rgba(0,0,0,0.34)";
    ctx.fillRect(0, 0, VIEW_W, 1); ctx.fillRect(0, VIEW_H - 1, VIEW_W, 1);
    ctx.fillRect(0, 0, 1, VIEW_H); ctx.fillRect(VIEW_W - 1, 0, 1, VIEW_H);
    // film grain
    ctx.globalAlpha = 0.05;
    const seed = this.t * 7.13;
    for (let i = 0; i < 90; i++) {
      const gx = (this.hash(i * 3.1 + seed) * VIEW_W) | 0;
      const gy = (this.hash(i * 7.7 + seed * 1.3) * VIEW_H) | 0;
      ctx.fillStyle = i & 1 ? "#ffffff" : "#000000";
      ctx.fillRect(gx, gy, 1, 1);
    }
    ctx.globalAlpha = 1;
    // scanlines
    ctx.fillStyle = "rgba(0,0,0,0.13)";
    for (let y = 0; y < VIEW_H; y += 2) ctx.fillRect(0, y, VIEW_W, 1);
  }
}

