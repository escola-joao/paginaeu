// Pixel-art sprite system: string grids -> cached canvases.
export const PAL = {
  k: "#0d0d0d", w: "#f2f2f2", s: "#e8b98a", h: "#d8b74a", g: "#6f7f3a", d: "#4b5828",
  j: "#4c6a8a", r: "#b8202e", y: "#f2c826", p: "#ff3fa4", m: "#8a8a92", n: "#3c3c44",
  o: "#6b4423", b: "#2a2f5e", c: "#d6a06c", e: "#ff2a2a", q: "#1e1e26", l: "#b0c4de",
  t: "#2e8b57", a: "#c9a227", u: "#7a5cff", f: "#ff7a1a", v: "#5a1020", i: "#ffe9a8",
  z: "#55d9ff", x: "#3b2a9a", F: "#b8450f", G: "#5cff9d", A: "#8a6a12", D: "#7a1020",
  H: "#e8e8f0", W: "#ffffff",
};

const cache = new Map();

export function makeSprite(rows, key, swap) {
  const ck = key + (swap ? JSON.stringify(swap) : "");
  const hit = cache.get(ck);
  if (hit) return hit;
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      let ch = rows[y][x];
      if (ch === "." || ch === " ") continue;
      if (swap && swap[ch]) ch = swap[ch];
      ctx.fillStyle = PAL[ch] ?? ch;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const s = { c, w, h };
  cache.set(ck, s);
  return s;
}

export function drawSprite(ctx, s, x, y, flip = false, rot = 0) {
  x = Math.round(x); y = Math.round(y);
  if (!flip && rot === 0) { ctx.drawImage(s.c, x, y); return; }
  ctx.save();
  ctx.translate(x + s.w / 2, y + s.h / 2);
  if (flip) ctx.scale(-1, 1);
  if (rot) ctx.rotate(rot);
  ctx.drawImage(s.c, -s.w / 2, -s.h / 2);
  ctx.restore();
}

// ---- Grid painter for large / procedural sprites ----
class Grid {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.rows = Array.from({ length: h }, () => Array(w).fill("."));
  }
  rect(x, y, w, h, ch) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++)
      if (xx >= 0 && yy >= 0 && xx < this.w && yy < this.h) this.rows[yy][xx] = ch;
    return this;
  }
  px(x, y, ch) { return this.rect(x, y, 1, 1, ch); }
  circle(cx, cy, r, ch) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++)
      if (x * x + y * y <= r * r + r * 0.5) this.px(cx + x, cy + y, ch);
    return this;
  }
  /** checkerboard fill — used for dithered shading */
  dither(x, y, w, h, ch, parity = 0) {
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++)
      if ((xx + yy + parity) % 2 === 0) this.px(x + xx, y + yy, ch);
    return this;
  }
  /** 1px hollow outline around a filled region */
  outlineBox(x, y, w, h, ch) {
    this.rect(x, y, w, 1, ch).rect(x, y + h - 1, w, 1, ch);
    this.rect(x, y, 1, h, ch).rect(x + w - 1, y, 1, h, ch);
    return this;
  }
  text(x, y, s, ch) {
    const F = {
      $: ["_#_", "##_", "_#_", "_##", "_#_"],
      S: ["###", "#__", "###", "__#", "###"],
      E: ["###", "#__", "##_", "#__", "###"],
      C: ["###", "#__", "#__", "#__", "###"],
      A: ["_#_", "#_#", "###", "#_#", "#_#"],
      M: ["#_#", "###", "###", "#_#", "#_#"],
      P: ["###", "#_#", "###", "#__", "#__"],
      H: ["#_#", "#_#", "###", "#_#", "#_#"],
      O: ["###", "#_#", "#_#", "#_#", "###"],
      R: ["###", "#_#", "##_", "#_#", "#_#"],
      U: ["#_#", "#_#", "#_#", "#_#", "###"],
      I: ["###", "_#_", "_#_", "_#_", "###"],
      T: ["###", "_#_", "_#_", "_#_", "_#_"],
      N: ["##_", "##_", "###", "_##", "_#_"],
      D: ["##_", "#_#", "#_#", "#_#", "##_"],
      F2: ["###", "#__", "##_", "#__", "#__"],
      L: ["#__", "#__", "#__", "#__", "###"],
      V: ["#_#", "#_#", "#_#", "_#_", "_#_"],
      G: ["###", "#__", "#_#", "#_#", "###"],
      B: ["###", "#_#", "##_", "#_#", "###"],
      W: ["#_#", "#_#", "###", "###", "#_#"],
      K: ["#__", "#_#", "##_", "#_#", "#__"],
      Y: ["#_#", "#_#", "_#_", "_#_", "_#_"],
      X: ["#_#", "_#_", "_#_", "_#_", "#_#"],
      F: ["###", "#__", "##_", "#__", "#__"],
      Z: ["###", "__#", "_#_", "#__", "###"],
      Q: ["###", "#_#", "#_#", "###", "__#"],
      J: ["__#", "__#", "__#", "#_#", "###"],
      1: ["_#_", "##_", "_#_", "_#_", "###"],
      2: ["###", "__#", "###", "#__", "###"],
      3: ["###", "__#", "###", "__#", "###"],
      5: ["###", "#__", "###", "__#", "###"],
      0: ["###", "#_#", "#_#", "#_#", "###"],
    };
    for (const chr of s) {
      const g = F[chr] ?? F[chr.toUpperCase()];
      if (g) g.forEach((row, yy) => [...row].forEach((cc, xx) => cc === "#" && this.px(x + xx, y + yy, ch)));
      x += 4;
    }
    return this;
  }
  out() { return this.rows.map((r) => r.join("")); }
}

// ================= PLAYER =================
const P_HEAD = [
  "...kkkkkk...",
  "..khhhhhhk..",
  ".khihhhhhhk.",
  ".khhhhhhhhk.",
  ".khschhhcsk.",
  ".kskssssksk.",
  ".kssssssssk.",
  "..kscsscsk..",
  "...kssssk...",
  "..kggggggk..",
  ".kgwggggwgk.",
  ".kgggddgggk.",
  ".kgdggggdgk.",
  ".kggggggggk.",
];
const LEGS_IDLE = [
  "..kjjjjjjk..",
  "..kjjkkjjk..",
  "..kjjskjsjk.",
  "..kjjkkjjk..",
  "..kwwwkwwwk.",
  "..kkkkkkkkk.",
];
const LEGS_RUN1 = [
  "..kjjjjjjk..",
  ".kjjjk.kjjk.",
  ".kjjsk..kjk.",
  "kjjjk...kjjk",
  "kwwwk...kwwk",
  "kkkkk....kkk",
];
const LEGS_RUN2 = [
  "..kjjjjjjk..",
  "..kjjjjjjk..",
  "..kjjskjsk..",
  "..kjjkkjjk..",
  "..kwwkkwwk..",
  "..kkkkkkkk..",
];
const LEGS_JUMP = [
  "..kjjjjjjk..",
  ".kjjjk.kjjjk",
  ".kjjsk.kjjsk",
  ".kjjjk.kjjjk",
  ".kwwwk.kwwwk",
  ".kkkkk.kkkkk",
];
export const playerSprites = (swap) => ({
  idle: makeSprite([...P_HEAD, ...LEGS_IDLE], "p_idle2", swap),
  run1: makeSprite([...P_HEAD, ...LEGS_RUN1], "p_run12", swap),
  run2: makeSprite([...P_HEAD, ...LEGS_RUN2], "p_run22", swap),
  jump: makeSprite([...P_HEAD, ...LEGS_JUMP], "p_jump2", swap),
});

export const GUITAR = makeSprite([
  "..rrr.............",
  ".rwwrr............",
  "rrwwrrroooooooooow",
  "rrwwrrrowowowowowk",
  ".rwwrrrooooooooowk",
  "..rrrr............",
], "guitar2");

// ================= REGULAR ENEMIES =================
export const CRITIC = makeSprite([
  "...kmmmmk...",
  "..kmmmmmmk..",
  "..kcccccck..",
  "..kckcckck..",
  "..kccccwck..",
  "...kcvvck...",
  ".knnnnnnnnk.",
  "knnnnwwnnnww",
  "knnnnwwnnnwk",
  "knnnnwwnnnww",
  ".knnnnnnnk..",
  ".knnk.knnk..",
  ".knnk.knnk..",
  ".kkkk.kkkk..",
], "critic2");

export const SUIT = makeSprite([
  "...kkkkkk...",
  "..kkkkkkkk..",
  "..kccccwck..",
  "..kckcckck..",
  "..kccccccck.",
  "...kccccck..",
  ".kbbbwwbbbk.",
  "kbbbbrrbbbbk",
  "kbbbbrrbbbbk",
  "kbbbbwwbbbbk",
  "kbbbbbbbbbbk",
  ".kbbbbbbbbk.",
  ".kbbk..kbbk.",
  ".kbbk..kbbk.",
  ".kbbk..kbbk.",
  ".kkkk..kkkk.",
], "suit2");

// ================= MINI-BOSSES =================
// Critic King 22x26
export const CRITIC_KING = makeSprite(new Grid(22, 26)
  .rect(5, 0, 12, 4, "y").px(6, 0, ".").px(8, 0, ".").px(10, 0, ".").px(12, 0, ".").px(14, 0, ".")
  .rect(5, 3, 12, 1, "A")
  .rect(4, 4, 14, 9, "c").outlineBox(4, 4, 14, 9, "k")
  .rect(5, 6, 12, 3, "k").rect(7, 7, 3, 1, "w").rect(13, 7, 3, 1, "w")
  .rect(9, 11, 5, 1, "v")
  .rect(5, 13, 12, 1, "m")
  .rect(1, 14, 20, 10, "n").outlineBox(1, 14, 20, 10, "k")
  .rect(0, 15, 3, 7, "n").rect(19, 15, 3, 7, "n")
  .dither(2, 20, 18, 3, "q")
  .rect(9, 14, 4, 10, "w").rect(10, 16, 2, 6, "r")
  .rect(0, 19, 4, 5, "w").outlineBox(0, 19, 4, 5, "k").rect(1, 21, 2, 1, "k")
  .rect(3, 24, 6, 2, "n").rect(13, 24, 6, 2, "n")
  .rect(3, 25, 6, 1, "k").rect(13, 25, 6, 1, "k")
  .out(), "critic_king2");

// Bouncer 20x30
export const BOUNCER = makeSprite(new Grid(20, 30)
  .rect(5, 0, 10, 9, "c").outlineBox(5, 0, 10, 9, "k")
  .rect(6, 3, 3, 2, "k").rect(11, 3, 3, 2, "k").px(6, 3, "w").px(11, 3, "w")
  .rect(8, 6, 4, 1, "v")
  .rect(4, 1, 12, 2, "k")
  .rect(2, 9, 16, 12, "q").outlineBox(2, 9, 16, 12, "k")
  .rect(0, 10, 3, 9, "c").rect(17, 10, 3, 9, "c")
  .text(4, 12, "SEC", "w")
  .dither(3, 18, 14, 2, "n")
  .rect(0, 19, 3, 3, "k").rect(17, 19, 3, 3, "k")
  .rect(3, 21, 6, 7, "n").rect(11, 21, 6, 7, "n")
  .rect(2, 28, 7, 2, "k").rect(11, 28, 7, 2, "k")
  .out(), "bouncer2");

// Feedback Stack 26x40
export const FEEDBACK = makeSprite((() => {
  const g = new Grid(26, 40);
  for (let i = 0; i < 3; i++) {
    const y = i * 13;
    g.rect(0, y, 26, 13, "q").outlineBox(0, y, 26, 13, "k");
    g.rect(2, y + 2, 22, 8, "n");
    for (let yy = y + 3; yy < y + 9; yy += 2) for (let xx = 3; xx < 23; xx += 2) g.px(xx, yy, "k");
    g.rect(2, y + 10, 22, 2, "m").dither(2, y + 11, 22, 1, "k");
    g.px(23, y + 10, "e"); g.px(2, y + 10, "a");
  }
  g.rect(9, 39, 8, 1, "k").rect(10, 0, 6, 1, "m");
  return g.out();
})(), "feedback2");

// Corporate Machine 44x52
export const MACHINE = makeSprite(new Grid(44, 52)
  .rect(20, 0, 4, 7, "m").circle(22, 1, 2, "e").px(22, 0, "i")
  .rect(7, 7, 30, 16, "n").outlineBox(7, 7, 30, 16, "k")
  .rect(9, 9, 26, 12, "q")
  .rect(11, 11, 9, 5, "e").rect(24, 11, 9, 5, "e")
  .rect(12, 12, 4, 2, "i").rect(25, 12, 4, 2, "i")
  .rect(12, 18, 20, 2, "k").dither(12, 18, 20, 2, "e")
  .rect(3, 23, 38, 22, "n").outlineBox(3, 23, 38, 22, "k")
  .rect(5, 25, 34, 18, "m").dither(5, 25, 34, 3, "n")
  .rect(7, 27, 30, 14, "n")
  .text(14, 31, "$$$", "y")
  .rect(0, 25, 4, 15, "m").rect(40, 25, 4, 15, "m")
  .rect(0, 40, 5, 5, "k").rect(39, 40, 5, 5, "k")
  .rect(7, 45, 11, 6, "n").rect(26, 45, 11, 6, "n")
  .rect(5, 50, 15, 2, "k").rect(24, 50, 15, 2, "k")
  .out(), "machine2");

// Sellout God 40x36
export const GOD = makeSprite(new Grid(40, 36)
  .rect(9, 0, 22, 6, "y").px(10, 0, ".").px(13, 0, ".").px(16, 0, ".").px(19, 0, ".").px(22, 0, ".").px(25, 0, ".").px(28, 0, ".")
  .rect(9, 5, 22, 1, "A")
  .circle(20, 20, 15, "A").circle(20, 19, 14, "y").circle(20, 18, 11, "i")
  .circle(20, 19, 13, "y")
  .rect(5, 14, 30, 7, "k")
  .rect(7, 15, 11, 5, "u").rect(22, 15, 11, 5, "u")
  .rect(8, 16, 4, 2, "z").rect(23, 16, 4, 2, "z")
  .rect(12, 26, 16, 4, "k").rect(13, 27, 14, 1, "w")
  .dither(13, 28, 14, 1, "w")
  .rect(1, 18, 4, 7, "y").rect(35, 18, 4, 7, "y")
  .out(), "god2");

// ================= PICKUPS — ALL SQUARE BLOCKS =================
/** Shared square pedal chassis: 12x12 stompbox, icon differs per model. */
function pedalSprite(key, face, light, dark, knob, led, icon) {
  const g = new Grid(12, 12);
  // chassis
  g.rect(0, 0, 12, 12, "k");
  g.rect(1, 1, 10, 10, face);
  // molded-plastic bevel
  g.rect(1, 1, 10, 1, light);
  g.rect(1, 2, 1, 8, light);
  g.rect(1, 10, 10, 1, dark);
  g.rect(10, 2, 1, 8, dark);
  g.dither(1, 9, 9, 1, dark);
  g.dither(9, 2, 1, 7, dark, 1);
  // corner screws
  g.px(2, 2, "m"); g.px(9, 2, "m"); g.px(2, 9, "m"); g.px(9, 9, "m");
  // knob (top-left)
  g.rect(3, 2, 3, 3, knob);
  g.px(3, 2, "W"); g.px(5, 4, dark); g.px(4, 3, "k");
  // LED (top-right)
  g.rect(7, 2, 2, 2, led);
  g.px(7, 2, "W"); g.px(8, 3, dark);
  // separator + recessed icon window
  g.rect(2, 5, 8, 1, "k");
  g.rect(2, 6, 8, 4, "q");
  if (icon === "wave") {
    // continuous purple/blue wave
    for (let i = 0; i < 8; i++) {
      const yy = 7 + Math.round(Math.sin(i * 0.85) * 1.3);
      g.px(2 + i, yy, i % 2 ? "z" : "u");
      g.px(2 + i, Math.min(9, yy + 1), "x");
    }
    g.px(2, 7, "W");
  } else if (icon === "zig") {
    // sharp yellow zigzag, hard edges
    const zz = [0, 1, 2, 1];
    for (let i = 0; i < 8; i++) {
      const yy = 6 + zz[i % 4];
      g.px(2 + i, yy, "y");
      if (yy < 9) g.px(2 + i, yy + 1, "A");
      if (zz[i % 4] === 0) g.px(2 + i, yy, "i");
    }
  } else {
    // orange shotgun blast — three slugs over a spread bar
    g.rect(2, 6, 2, 2, "f"); g.rect(5, 6, 2, 2, "f"); g.rect(8, 6, 2, 2, "f");
    g.px(2, 6, "i"); g.px(5, 6, "i"); g.px(8, 6, "i");
    g.dither(2, 8, 8, 1, "F");
    g.rect(2, 9, 8, 1, "F");
  }
  // footswitch
  g.rect(3, 10, 6, 1, "m");
  g.px(3, 10, "W"); g.px(8, 10, "k"); g.px(5, 10, "n"); g.px(6, 10, "n");
  return makeSprite(g.out(), key);
}

export const CHORUS_PEDAL = pedalSprite("chorus_sq", "u", "z", "x", "l", "z", "wave");
export const FUZZ_PEDAL = pedalSprite("fuzz_sq", "y", "i", "A", "w", "y", "zig");
export const DISTORTION_PEDAL = pedalSprite("distortion_sq", "f", "i", "F", "y", "f", "dots");

// Vinyl — square sleeve with the disc peeking out
export const VINYL = makeSprite(new Grid(10, 10)
  .rect(0, 0, 10, 10, "k")
  .rect(1, 1, 8, 8, "v")
  .rect(1, 1, 8, 1, "r").rect(1, 1, 1, 8, "r")
  .dither(2, 6, 6, 2, "D")
  .circle(6, 5, 3, "k").circle(6, 5, 2, "n")
  .px(6, 5, "r").px(5, 4, "m")
  .rect(2, 2, 4, 1, "a").rect(2, 3, 3, 1, "a")
  .out(), "vinyl2");

// Cassette — square-ish shell, two reels, label stripes
export const CASSETTE = makeSprite(new Grid(12, 9)
  .rect(0, 0, 12, 9, "k")
  .rect(1, 1, 10, 7, "n")
  .rect(1, 1, 10, 1, "m")
  .rect(2, 2, 8, 3, "i")
  .rect(3, 3, 6, 1, "r")
  .rect(2, 6, 8, 1, "q")
  .circle(3, 6, 1, "k").circle(8, 6, 1, "k")
  .px(3, 6, "m").px(8, 6, "m")
  .px(1, 7, "a").px(10, 7, "a")
  .out(), "cassette2");

// Syringe — thumb press, plunger rod, finger flange, glass barrel with green
// serum + graduation marks, needle hub and a tapered needle.
export const SYRINGE = makeSprite((() => {
  const g = new Grid(17, 9);
  // thumb press (T-handle)
  g.rect(0, 1, 2, 7, "k").rect(0, 2, 1, 5, "m").px(0, 2, "w");
  // plunger rod
  g.rect(2, 4, 3, 2, "k").rect(2, 4, 3, 1, "m");
  // finger flange
  g.rect(5, 0, 1, 9, "k").px(5, 1, "m").px(5, 7, "m");
  // barrel outline + glass
  g.rect(6, 1, 8, 7, "k");
  g.rect(7, 2, 6, 5, "w");
  // serum (partially drawn) + air pocket
  g.rect(7, 2, 4, 5, "G");
  g.dither(7, 6, 4, 1, "t");
  g.rect(11, 2, 2, 5, "H");
  // glass highlight + graduation ticks
  g.px(7, 2, "W").px(8, 2, "W");
  g.px(8, 3, "k").px(10, 3, "k").px(12, 3, "k");
  g.px(9, 6, "k").px(11, 6, "k");
  // bubbles in the serum
  g.px(9, 4, "W").px(8, 5, "W");
  // needle hub
  g.rect(14, 2, 1, 5, "k").px(14, 3, "n").px(14, 4, "n").px(14, 5, "n");
  // needle, tapering to a bright tip
  g.rect(15, 4, 1, 1, "m").px(16, 4, "W");
  return g.out();
})(), "syringe3");

// Field medkit: square, strapped canvas pouch with an unmistakable white cross.
export const MEDKIT = makeSprite(new Grid(12, 10)
  .rect(3, 0, 6, 3, "k")
  .rect(4, 1, 4, 2, "m")
  .rect(1, 2, 10, 7, "k")
  .rect(2, 3, 8, 5, "r")
  .rect(2, 3, 8, 1, "e")
  .rect(2, 7, 8, 1, "v")
  .rect(3, 4, 6, 3, "w")
  .rect(5, 3, 2, 5, "w")
  .rect(5, 5, 2, 1, "m")
  .px(2, 2, "m").px(9, 2, "m")
  .px(2, 8, "m").px(9, 8, "m")
  .out(), "medkit");

export const HEART = makeSprite([
  ".rr.rr.", "rrrrrrr", "rrwrrrr", ".rrrrr.", "..rrr..", "...r...",
], "heart2");
