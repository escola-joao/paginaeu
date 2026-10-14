import { GROUND_Y, VIEW_W } from "./levelgen.js";

const sgn = (n) => (n < 0 ? -1 : 1);

function aimed(e, c, speed, extra = {}, ox = 0, oy = 0) {
  const sx = e.x + e.w / 2 + ox, sy = e.y + e.h / 2 + oy;
  const dx = c.px - sx, dy = c.py - sy;
  const m = Math.hypot(dx, dy) || 1;
  c.spawn({ x: sx, y: sy, vx: (dx / m) * speed, vy: (dy / m) * speed, ...extra });
}

function updatePhase(e, thresholds) {
  const frac = e.hp / e.maxHp;
  let ph = 1;
  for (const t of thresholds) if (frac < t) ph++;
  e.phase = ph;
}

export function updateBoss(e, c) {
  e.facing = sgn(c.px - (e.x + e.w / 2));
  switch (e.type) {
    case "critic_king": return criticKing(e, c);
    case "bouncer": return bouncer(e, c);
    case "feedback": return feedback(e, c);
    case "clone": return clone(e, c);
    case "machine": return machine(e, c);
    case "god": return god(e, c);
  }
}

// ---------- CRITIC KING ----------
function criticKing(e, c) {
  updatePhase(e, [0.66, 0.32]);
  const spd = [0, 0.58, 0.86, 1.12][e.phase];
  e.timer--;
  if (e.state === "idle") {
    e.vx = e.facing * spd;
    if (e.timer <= 0) {
      e.counter++;
      if (e.counter % (e.phase === 3 ? 2 : 3) === 0) { e.state = "jump"; e.vy = -7; e.vx = e.facing * (e.phase === 3 ? 2.2 : 1.7); e.onGround = false; }
      else { e.state = "throw"; e.timer = e.phase === 3 ? 17 : 22; e.vx = 0; }
    }
  } else if (e.state === "throw") {
    e.vx = 0;
    if (e.timer <= 0) {
      const n = 3 + e.phase;
      for (let i = 0; i < n; i++) {
        const spread = i - (n - 1) / 2;
        c.spawn({
          x: e.x + e.w / 2, y: e.y + 4, vx: e.facing * (0.65 + spread * 0.32), vy: -2.6 - (n - Math.abs(spread)) * 0.16,
          grav: 0.13, kind: "paper", pink: i === Math.floor(n / 2), life: 210, r: 4,
        });
      }
      e.state = "idle"; e.timer = [0, 58, 44, 34][e.phase];
    }
  } else if (e.state === "jump") {
    if (e.onGround && e.vy >= 0 && e.timer < -2) {
      c.shake(6);
      const speed = e.phase === 3 ? 2.8 : 2.1;
      c.spawn({ x: e.x + e.w / 2, y: GROUND_Y - 5, vx: speed, vy: 0, kind: "shock", pink: true, life: 110, r: 5 });
      c.spawn({ x: e.x + e.w / 2, y: GROUND_Y - 5, vx: -speed, vy: 0, kind: "shock", pink: true, life: 110, r: 5 });
      if (e.phase === 3) {
        c.spawn({ x: e.x + e.w / 2, y: GROUND_Y - 12, vx: e.facing * 1.6, vy: -1.8, kind: "paper", pink: false, life: 100, r: 4, grav: 0.08 });
      }
      e.state = "idle"; e.timer = [0, 66, 52, 40][e.phase]; e.vx = 0;
    }
  }
}

// ---------- BOUNCER ----------
function bouncer(e, c) {
  updatePhase(e, [0.66, 0.32]);
  e.timer--;
  if (e.state === "idle") {
    e.vx = e.facing * 0.3;
    if (e.timer <= 0) {
      e.counter++;
      if (e.counter % 2 === 1) { e.state = "windup"; e.timer = e.phase === 3 ? 16 : 23; }
      else { e.state = "toss"; e.timer = 16; }
    }
  } else if (e.state === "windup") {
    e.vx = -e.facing * 0.2;
    if (e.timer <= 0) { e.state = "charge"; e.vx = e.facing * ([0, 3.8, 4.6, 5.3][e.phase]); e.timer = 200; }
  } else if (e.state === "charge") {
    if ((e.vx < 0 && e.x <= e.minX + 1) || (e.vx > 0 && e.x >= e.maxX - 1) || e.timer <= 0) {
      e.state = "stun"; e.timer = e.phase === 3 ? 36 : 48; e.vx = 0; c.shake(8);
      const waveSpeed = e.phase === 3 ? 2.4 : 1.8;
      c.spawn({ x: e.x + e.w / 2, y: GROUND_Y - 4, vx: -waveSpeed, vy: 0, kind: "shock", pink: false, life: 80, r: 4 });
      if (e.phase >= 2) c.spawn({ x: e.x + e.w / 2, y: GROUND_Y - 4, vx: waveSpeed, vy: 0, kind: "shock", pink: e.phase === 3, life: 80, r: 4 });
    }
  } else if (e.state === "stun") {
    e.vx = 0;
    if (e.timer <= 0) { e.state = "idle"; e.timer = e.phase === 3 ? 28 : 38; }
  } else if (e.state === "toss") {
    e.vx = 0;
    if (e.timer <= 0) {
      const n = e.phase;
      for (let i = 0; i < n; i++) {
        const spread = i - (n - 1) / 2;
        c.spawn({ x: e.x + e.w / 2, y: e.y + 6, vx: e.facing * (1.3 + spread * 0.6), vy: -3.3 + Math.abs(spread) * 0.5, grav: 0.11, kind: "ring", pink: i === Math.floor(n / 2), life: 220, r: 4 });
      }
      e.state = "idle"; e.timer = [0, 58, 46, 36][e.phase];
    }
  }
}

// ---------- FEEDBACK STACK ----------
function feedback(e, c) {
  updatePhase(e, [0.66, 0.32]);
  e.vx = 0;
  if (e.state === "burst") {
    e.timer--;
    if (e.timer <= 0) {
      aimed(e, c, 2 + e.phase * 0.45, { kind: "note", pink: e.fireCd % 3 === 0, life: 175, r: 3 }, 0, -6);
      e.fireCd--;
      e.timer = e.phase === 3 ? 7 : 10;
      if (e.fireCd <= 0) { e.state = "idle"; e.timer = e.phase === 3 ? 28 : 42; }
    }
    return;
  }
  e.timer--;
  if (e.timer > 0) return;
  e.counter++;
  const mode = e.counter % 3;
  const cx = e.x + e.w / 2, cy = e.y + 14;
  if (mode === 1) {
    const n = 8 + e.phase * 4;
    const speed = 0.95 + e.phase * 0.28;
    const off = e.counter % 2 === 0 ? Math.PI / n : 0;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + off;
      c.spawn({ x: cx, y: cy, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, kind: "ring", pink: i % 4 === 0, life: 210, r: 3 });
    }
    e.timer = [0, 76, 62, 48][e.phase];
  } else if (mode === 2) {
    e.state = "burst";
    e.fireCd = 3 + e.phase;
    e.timer = 1;
  } else {
    if (c.countType("critic") < (e.phase === 3 ? 3 : 2)) c.spawnEnemy(e.phase === 3 ? "suit" : "critic", e.x - 30);
    e.timer = [0, 52, 42, 32][e.phase];
  }
}

// ---------- CLONE ----------
function clone(e, c) {
  updatePhase(e, [0.66, 0.32]);
  e.timer--;
  const dist = c.px - (e.x + e.w / 2);
  if (e.state === "idle") {
    // hop to a random platform / spot periodically
    if (e.timer <= 0 && e.onGround) {
      const tops = c.platformsTops;
      const t = tops[Math.floor(Math.random() * tops.length)];
      const tx = t ? t.x + t.w / 2 : c.arenaMin + 40 + Math.random() * 200;
      e.vx = Math.max(-2.2, Math.min(2.2, (tx - e.x) / 40));
      e.vy = t && t.y < e.y ? -6.2 : -4.5;
      e.onGround = false;
      e.timer = 90 + Math.random() * 40;
      e.state = "hop";
    } else {
      e.vx *= 0.8;
    }
    if (Math.abs(dist) < 26 && e.fireCd <= 0 && e.onGround) {
      e.state = "dash"; e.vx = -sgn(dist) * (e.phase === 3 ? 5.4 : 4.5); e.timer = e.phase === 3 ? 15 : 12; e.fireCd = e.phase === 3 ? 56 : 76;
    }
  } else if (e.state === "hop") {
    if (e.onGround && e.vy >= 0) { e.state = "idle"; e.vx = 0; }
  } else if (e.state === "dash") {
    if (e.timer <= 0) { e.state = "idle"; e.vx = 0; e.timer = 30; }
  }
  e.fireCd--;
  e.counter++;
  const rate = [0, 72, 52, 36][e.phase];
  if (e.counter % rate === 0) {
    const n = e.phase;
    const dx = c.px - (e.x + e.w / 2), dy = c.py - (e.y + e.h / 2);
    const base = Math.atan2(dy, dx);
    for (let i = 0; i < n; i++) {
      const spread = (i - (n - 1) / 2) * 0.22;
      const a = base + spread;
      const speed = 2.8 + e.phase * 0.35;
      c.spawn({ x: e.x + e.w / 2, y: e.y + e.h / 2, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, kind: "note", pink: i === Math.floor(n / 2), life: 155, r: 3 });
    }
  }
}

// ---------- CORPORATE MACHINE (big boss) ----------
function machine(e, c) {
  updatePhase(e, [0.66, 0.33]);
  e.timer--;
  const cx = e.x + e.w / 2;
  if (e.state === "idle") {
    const dist = c.px - cx;
    e.vx = Math.abs(dist) > 76 ? e.facing * (0.45 + e.phase * 0.15) : 0;
    if (e.timer <= 0) {
      e.counter++;
      const cycle = e.phase === 1 ? ["spread", "rain"] : e.phase === 2 ? ["spread", "beam", "rain", "beam"] : ["berserk", "beam", "rain", "spread"];
      e.state = cycle[e.counter % cycle.length];
      e.timer = e.state === "spread" ? 20 : e.state === "rain" ? 16 : e.state === "beam" ? 34 : 8;
      e.fireCd = 0;
    }
  } else if (e.state === "spread") {
    e.vx = 0;
    if (e.timer <= 0) {
      const n = 6 + e.phase * 2;
      const speed = 1.7 + e.phase * 0.28;
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 3 + (i / (n - 1)) * (Math.PI * 2) / 3;
        const dir = e.facing;
        c.spawn({ x: cx + dir * 20, y: e.y + 14, vx: Math.cos(a) * speed * dir, vy: Math.sin(a) * speed, kind: "note", pink: i === Math.floor(n / 2), life: 200, r: 3 });
      }
      e.state = "idle"; e.timer = [0, 48, 38, 28][e.phase];
    }
  } else if (e.state === "rain") {
    e.vx = 0;
    if (e.timer <= 0) {
      const n = 6 + e.phase * 3;
      for (let i = 0; i < n; i++) {
        const x = c.arenaMin + 10 + Math.random() * (c.arenaMax - c.arenaMin - 20);
        c.spawn({ x, y: -10 - i * 12, vx: (c.px < x ? -0.1 : 0.1) * e.phase, vy: 0.5 + e.phase * 0.08, grav: 0.06, kind: "paper", pink: i % 4 === 0, life: 260, r: 4 });
      }
      e.state = "idle"; e.timer = [0, 70, 58, 44][e.phase];
    }
  } else if (e.state === "beam") {
    e.vx = 0;
    if (e.timer <= 0) {
      const low = Math.random() < 0.55;
      const y = low ? GROUND_Y - 12 : GROUND_Y - 44;
      const warning = [0, 34, 27, 21][e.phase];
      c.spawn({ x: c.arenaMin, y, vx: 0, vy: 0, w: c.arenaMax - c.arenaMin, h: low ? 10 : 14, kind: "beam", telegraph: warning, life: warning + 32, r: 0 });
      if (e.phase === 3) {
        const secondY = low ? GROUND_Y - 46 : GROUND_Y - 11;
        c.spawn({ x: c.arenaMin, y: secondY, vx: 0, vy: 0, w: c.arenaMax - c.arenaMin, h: 9, kind: "beam", telegraph: warning + 10, life: warning + 42, r: 0 });
      }
      e.state = "idle"; e.timer = [0, 82, 68, 54][e.phase];
    }
  } else if (e.state === "berserk") {
    e.vx = e.facing * (0.9 + e.phase * 0.2);
    e.fireCd++;
    const rate = [0, 15, 12, 9][e.phase];
    if (e.fireCd % rate === 0) aimed(e, c, 2.4 + e.phase * 0.28, { kind: "note", pink: e.fireCd % (rate * 3) === 0, life: 160, r: 3 }, 0, -10);
    if ((e.fireCd === 34 || e.fireCd === 68) && c.countType("suit") < 2) c.spawnEnemy("suit", c.arenaMin + 20);
    if (e.fireCd >= 96) { e.state = "idle"; e.timer = 46; c.shake(6); }
  }
}

// ---------- SELLOUT GOD (final big boss) ----------
function god(e, c) {
  updatePhase(e, [0.66, 0.33]);
  e.counter++;
  const spd = 0.8 + e.phase * 0.3;
  const cx = e.x + e.w / 2;
  // hover in sine
  const centerX = VIEW_W / 2 + Math.sin(e.counter * 0.012 * spd) * 100;
  e.vx = (centerX - cx) * 0.05;
  e.y = e.baseY + Math.sin(e.counter * 0.05) * 8;
  e.timer--;
  if (e.state === "idle") {
    if (e.timer <= 0) {
      const cycle = e.phase === 1 ? ["coins", "orbs", "hand"] : e.phase === 2 ? ["coins", "hand", "orbs", "clones"] : ["hand", "coins", "orbs", "hand", "clones"];
      e.state = cycle[(e.counter >> 4) % cycle.length];
      e.timer = e.phase === 3 ? 22 : 27;
      e.fireCd = 0;
    }
  } else if (e.state === "coins") {
    e.fireCd++;
    const coinRate = [0, 9, 7, 5][e.phase];
    if (e.fireCd % coinRate === 0) {
      const x = c.arenaMin + 12 + Math.random() * (c.arenaMax - c.arenaMin - 24);
      c.spawn({ x, y: -6, vx: (c.px < x ? -0.08 : 0.08) * e.phase, vy: 0.65 + e.phase * 0.08, grav: 0.07, kind: "coin", pink: e.fireCd % (coinRate * 4) === 0, life: 240, r: 3 });
    }
    if (e.fireCd > 60 + e.phase * 12) { e.state = "idle"; e.timer = e.phase === 3 ? 36 : 48; }
  } else if (e.state === "orbs") {
    if (e.timer <= 0) {
      const n = 7 + e.phase * 3;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + e.counter * 0.1;
        const speed = 0.95 + e.phase * 0.24;
        c.spawn({ x: cx, y: e.y + e.h / 2, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, kind: "ring", pink: i % 3 === 0, life: 220, r: 3 });
      }
      e.state = "idle"; e.timer = e.phase === 3 ? 48 : 60;
    }
  } else if (e.state === "hand") {
    if (e.timer <= 0) {
      const fromLeft = c.px > VIEW_W / 2;
      const w = 32 + e.phase * 2, h = 16;
      c.spawn({
        x: fromLeft ? c.arenaMin - w : c.arenaMax, y: GROUND_Y - h,
        vx: (fromLeft ? 1 : -1) * (1.9 + e.phase * 0.5), vy: 0, w, h, kind: "hand", telegraph: 26, life: 26 + 240, r: 0,
      });
      c.shake(4);
      e.state = "idle"; e.timer = e.phase === 3 ? 56 : 72;
    }
  } else if (e.state === "clones") {
    if (e.timer <= 0) {
      const maxClones = e.phase === 3 ? 2 : 1;
      if (c.countType("clone") < maxClones) c.spawnEnemy("clone", c.px < VIEW_W / 2 ? c.arenaMax - 40 : c.arenaMin + 30);
      e.state = "idle"; e.timer = e.phase === 3 ? 42 : 55;
    }
  }
}

export const KINDS = ["note", "paper", "ring", "coin", "beam", "shock", "hand", "ex"];
