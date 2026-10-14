export const VIEW_W = 320;
export const VIEW_H = 180;
export const GROUND_Y = 150;
export const TOTAL_LEVELS = 10;

const NAMES = [
  ["1. Blew no Porão", '"With the lights out, it\'s less dangerous"'],
  ["2. Floyd & Backstage", '"Come as you are, as you were"'],
  ["3. Swap Meet Seattle", '"I\'m so happy \'cause today I found my friends"'],
  ["4. Sifting: Soundcheck", '"Load up on guns, bring your friends"'],
  ["5. Big Cheese S/A", '"Here we are now, entertain us!"'],
  ["6. Lounge Act: Reading '92", '"Hey! Wait! I got a new complaint"'],
  ["7. On a Plain: Pista Plana", '"I\'m on a plain, I can\'t complain"'],
  ["8. Frances Farmer: Seattle", '"Where do bad folks go when they die?"'],
  ["9. Radio Friendly FM", '"Teenage angst has paid off well"'],
  ["10. Gallons: Último Bis", '"All in all is all we are"'],
];

const BOSS_NAMES = {
  critic_king: "MR. MOUSTACHE: CRÍTICO REAL",
  bouncer: "NEGATIVE CREEP: PORTEIRO",
  feedback: "SCENTLESS APPRENTICE DO RUÍDO",
  clone: "ON A PLAINCLÔNE",
  machine: "BIG CHEESE S/A",
  god: "ALL APOLOGIES: DEUS DO ENCORE",
};
export const bossName = (t) => BOSS_NAMES[t] ?? "";

function rng(seed) {
  let s = seed * 9301 + 49297;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

const ground = (x, w) => ({ x, y: GROUND_Y, w, h: 40, kind: "ground" });
const stage = (x, y, w) => ({ x, y, w, h: 6, kind: "stage" });
const amp = (x) => ({ x, y: GROUND_Y - 22, w: 26, h: 22, kind: "amp" });
const crate = (x, y) => ({ x, y, w: 14, h: 14, kind: "crate" });

export function makeEnemy(type, x, minX, maxX, diff) {
  const base = {
    x, vx: 0, vy: 0, minX, maxX, alive: true, type, hitFlash: 0, fireCd: 60, state: "idle",
    timer: 40, phase: 1, dormant: false, facing: -1, onGround: false, flying: false,
    name: BOSS_NAMES[type] ?? "", counter: 0, baseY: 0,
  };
  const scale = 1 + (diff - 1) * 0.08;
  switch (type) {
    case "critic": return { ...base, y: GROUND_Y - 14, w: 10, h: 14, vx: 0.4, hp: 3, maxHp: 3, boss: false, big: false };
    case "suit": return { ...base, y: GROUND_Y - 16, w: 10, h: 16, vx: 0.55, hp: 4, maxHp: 4, boss: false, big: false, fireCd: 96 };
    case "critic_king": { const hp = Math.round(42 * scale); return { ...base, y: GROUND_Y - 26, w: 22, h: 26, hp, maxHp: hp, boss: true, big: false, dormant: true }; }
    case "bouncer": { const hp = Math.round(52 * scale); return { ...base, y: GROUND_Y - 30, w: 20, h: 30, hp, maxHp: hp, boss: true, big: false, dormant: true }; }
    case "feedback": { const hp = Math.round(60 * scale); return { ...base, y: GROUND_Y - 40, w: 26, h: 40, hp, maxHp: hp, boss: true, big: false, dormant: true }; }
    case "clone": { const hp = Math.round(46 * scale); return { ...base, y: GROUND_Y - 20, w: 12, h: 20, hp, maxHp: hp, boss: true, big: false, dormant: true }; }
    case "machine": { const hp = Math.round(210 * scale); return { ...base, y: GROUND_Y - 52, w: 44, h: 52, hp, maxHp: hp, boss: true, big: true, dormant: true }; }
    case "god": { const hp = Math.round(280 * scale); return { ...base, y: 30, w: 40, h: 36, hp, maxHp: hp, boss: true, big: true, dormant: true, flying: true, baseY: 34 }; }
  }
}

const PK_SIZE = {
  vinyl: [10, 10],
  cassette: [12, 9],
  chorus: [12, 12],
  fuzz: [12, 12],
  distortion: [12, 12],
  serum: [17, 9],
  medkit: [12, 10],
};
const pk = (type, x, y) => {
  const [w, h] = PK_SIZE[type];
  return { x, y, w, h, type, taken: false, bob: Math.random() * 6.28 };
};

function choosePowerup(r) {
  const roll = r();
  if (roll < 0.24) return "chorus";
  if (roll < 0.48) return "fuzz";
  if (roll < 0.72) return "distortion";
  if (roll < 0.86) return "serum";
  return "medkit";
}

export function makeLevel(n) {
  const [name, songLine] = NAMES[n - 1];
  const big = n % 5 === 0;

  if (big) {
    const width = VIEW_W;
    const bossType = n === 5 ? "machine" : "god";
    const platforms = [
      ground(0, width),
      stage(30, 112, 44), stage(width - 74, 112, 44), stage(width / 2 - 22, 86, 44),
      { x: -10, y: -50, w: 10, h: 250, kind: "wall" }, { x: width, y: -50, w: 10, h: 250, kind: "wall" },
    ];
    const boss = makeEnemy(bossType, width - 90, 40, width - 50, n);
    return {
      index: n, width, platforms, enemies: [boss],
      pickups: [
        pk("chorus", 44, GROUND_Y - 12), pk("fuzz", 108, GROUND_Y - 12),
        pk("distortion", 196, GROUND_Y - 12), pk("serum", 260, GROUND_Y - 9),
        pk("cassette", width / 2 - 4, 70),
      ],
      playerStart: { x: 24, y: 100 }, arenaX: 0, goalX: -1, name, songLine, bigBoss: true,
    };
  }

  const r = rng(n * 7919);
  const arenaW = 300;
  const width = 1000 + n * 110 + arenaW;
  const arenaX = width - arenaW;
  const platforms = [];
  const enemies = [];
  const pickups = [];

  platforms.push(ground(0, 180));
  let x = 180;
  let sec = 0;
  while (x < arenaX - 40) {
    const kind = r();
    if (kind < 0.35) {
      // gap + ground
      const gap = 30 + Math.floor(r() * 22);
      x += gap;
      const w = 110 + Math.floor(r() * 90);
      platforms.push(ground(x, Math.min(w, arenaX - x + 40)));
      if (r() < 0.7 && w > 70) {
        const t = r() < 0.4 + n * 0.05 ? "suit" : "critic";
        enemies.push(makeEnemy(t, x + 40, x + 6, x + w - 16, n));
      }
      if (w > 150 && n > 2 && r() < 0.5) enemies.push(makeEnemy("critic", x + w - 40, x + w / 2, x + w - 14, n));
      x += w;
    } else if (kind < 0.7) {
      // platform cluster over ground
      const w = 150 + Math.floor(r() * 60);
      platforms.push(ground(x, Math.min(w, arenaX - x + 40)));
      const py1 = 118 - Math.floor(r() * 10);
      const py2 = py1 - 26 - Math.floor(r() * 8);
      platforms.push(stage(x + 20, py1, 46));
      platforms.push(stage(x + 80, py2, 46));
      pickups.push(pk("vinyl", x + 38, py1 - 14));
      // Keep collectibles common, but make equipment drops noticeably rarer.
      if (r() < 0.14) pickups.push(pk(choosePowerup(r), x + 98, py2 - 14));
      if (r() < 0.8) enemies.push(makeEnemy(r() < 0.5 ? "suit" : "critic", x + 100, x + 70, x + w - 14, n));
      x += w;
    } else {
      // amp / crate obstacles
      const w = 130 + Math.floor(r() * 40);
      platforms.push(ground(x, Math.min(w, arenaX - x + 40)));
      platforms.push(amp(x + 40));
      platforms.push(crate(x + 90, GROUND_Y - 14));
      platforms.push(crate(x + 90, GROUND_Y - 28));
      if (r() < 0.4) {
        const roll = r();
        const reward = roll < 0.22 ? "medkit" : roll < 0.48 ? "serum" : "cassette";
        pickups.push(pk(reward, x + 92, GROUND_Y - 42));
      }
      if (r() < 0.6) enemies.push(makeEnemy("suit", x + w - 30, x + 110, x + w - 14, n));
      x += w;
    }
    sec++;
  }
  // One visible healing kit per regular stage; boss arenas retain their existing loot.
  const medkitGround = platforms.find((pl) =>
    pl.kind === "ground" && pl.x > arenaX * 0.3 && pl.x < arenaX * 0.72 && pl.w >= 30
  ) ?? platforms.find((pl) => pl.kind === "ground");
  if (medkitGround) {
    pickups.push(pk("medkit", medkitGround.x + (medkitGround.w - 12) / 2, GROUND_Y - 10));
  }

  // arena
  platforms.push(ground(arenaX - 60, arenaW + 60));
  platforms.push(stage(arenaX + 30, 112, 40));
  platforms.push(stage(arenaX + arenaW - 70, 112, 40));
  platforms.push({ x: width, y: -50, w: 10, h: 250, kind: "wall" });
  const pedalCycle = ["chorus", "fuzz", "distortion"];
  pickups.push(pk(pedalCycle[(n - 1) % pedalCycle.length], arenaX + 38, GROUND_Y - 12));
  pickups.push(pk("serum", arenaX + 106, GROUND_Y - 12));

  const miniTypes = ["critic_king", "bouncer", "feedback", "clone"];
  const miniType = miniTypes[(n - 1) % 4];
  const boss = makeEnemy(miniType, arenaX + arenaW - 60, arenaX + 8, arenaX + arenaW - 30, n);
  if (miniType === "feedback") boss.x = arenaX + arenaW - 50;
  enemies.push(boss);

  return {
    index: n, width, platforms, enemies, pickups,
    playerStart: { x: 20, y: 100 }, arenaX, goalX: width - 16, name, songLine, bigBoss: false,
  };
}
