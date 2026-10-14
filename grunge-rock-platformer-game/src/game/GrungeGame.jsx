import { useEffect, useRef, useState, useCallback } from "react";
import { Game, VIEW_W, VIEW_H } from "./engine.js";
import { makeLevel, TOTAL_LEVELS } from "./levelgen.js";
import * as A from "./audio.js";

const emptyInput = () => ({
  left: false, right: false, up: false, down: false, jump: false, shoot: false, dash: false, ex: false, sup: false,
});

const PIX = { fontFamily: '"Press Start 2P", monospace' };

/** Square stompbox chips shown on the HUD pedalboard. */
const PEDALS = [
  { name: "CHORUS", face: "bg-violet-600", ring: "ring-1 ring-cyan-300", icon: "bg-cyan-300" },
  { name: "FUZZ", face: "bg-yellow-400", ring: "ring-1 ring-yellow-100", icon: "bg-yellow-100" },
  { name: "DISTORTION", face: "bg-orange-500", ring: "ring-1 ring-orange-200", icon: "bg-orange-200" },
];

export default function GrungeGame() {
  const rootRef = useRef(null);
  const canvasRef = useRef(null);
  const gameRef = useRef(null);
  const inputRef = useRef(emptyInput());
  const rafRef = useRef(0);
  const [status, setStatus] = useState("menu");
  const [levelN, setLevelN] = useState(1);
  const [hud, setHud] = useState(null);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const carry = useRef({ score: 0, hp: 100, cards: 0 });

  const toggleFullscreen = useCallback(async () => {
    const target = rootRef.current;
    if (!target) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await target.requestFullscreen();
    } catch {
      // Fullscreen can be denied by browser policy; the game remains playable.
    }
  }, []);

  useEffect(() => {
    const syncFullscreen = () => setFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  const startLevel = useCallback((n, score, hp, cards) => {
    const g = new Game(makeLevel(n), score, hp, cards);
    g.onStatus = (s) => setStatus(s);
    gameRef.current = g;
    setLevelN(n);
    setStatus("playing");
    g.start();
    A.resumeAudio();
    A.startMusic();
  }, []);

  const beginGame = useCallback(() => {
    carry.current = { score: 0, hp: 100, cards: 0 };
    startLevel(1, 0, 100, 0);
  }, [startLevel]);

  const nextLevel = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    const h = g.getHUD();
    const healed = Math.min(100, h.hp + 35);
    carry.current = { score: h.score, hp: healed, cards: h.cards };
    if (levelN + 1 > TOTAL_LEVELS) { setStatus("win"); return; }
    startLevel(levelN + 1, h.score, healed, h.cards);
  }, [levelN, startLevel]);

  const retry = useCallback(() => startLevel(levelN, carry.current.score, 100, 0), [levelN, startLevel]);

  useEffect(() => {
    const map = (k) => {
      switch (k) {
        case "arrowleft": case "a": return "left";
        case "arrowright": case "d": return "right";
        case "arrowup": case "w": return "up";
        case "arrowdown": case "s": return "down";
        case " ": case "z": return "jump";
        case "f": case "j": case "x": return "shoot";
        case "shift": case "k": case "c": return "dash";
        case "e": case "l": case "v": return "ex";
        case "r": case "q": return "sup";
      }
      return null;
    };
    const down = (e) => {
      const k = e.key.toLowerCase();
      const m = map(k);
      if (m) { e.preventDefault(); inputRef.current[m] = true; }
      if (k === "m") setMuted((mm) => { A.setMuted(!mm); return !mm; });
    };
    const up = (e) => {
      const m = map(e.key.toLowerCase());
      if (m) inputRef.current[m] = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let frame = 0;
    const loop = () => {
      const g = gameRef.current;
      ctx.clearRect(0, 0, VIEW_W, VIEW_H);
      if (g) {
        if (g.status === "playing") g.update(inputRef.current);
        g.render(ctx);
        if (frame++ % 3 === 0) setHud(g.getHUD());
      } else {
        drawIdle(ctx, frame++);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const press = (key, val) => (e) => {
    e.preventDefault();
    inputRef.current[key] = val;
  };
  const toggleMute = () => setMuted((m) => { A.setMuted(!m); return !m; });

  return (
    <div
      ref={rootRef}
      className={`flex min-h-screen w-full flex-col items-center justify-center bg-[#0a080c] ${fullscreen ? "h-screen overflow-hidden p-0" : "p-2"}`}
      style={PIX}
    >
      <div
        className="relative w-full overflow-hidden border-4 border-[#2a2230] shadow-[0_0_0_2px_#000,0_0_40px_rgba(255,63,164,0.15)]"
        style={{
          width: fullscreen ? "min(100vw, 177.7778vh)" : "100%",
          maxWidth: fullscreen ? "none" : 960,
          aspectRatio: `${VIEW_W}/${VIEW_H}`,
        }}
      >
        <canvas
          ref={canvasRef}
          width={VIEW_W}
          height={VIEW_H}
          className="block h-full w-full"
          style={{ imageRendering: "pixelated" }}
        />

        {status === "playing" && hud && (
          <HudBar
            hud={hud}
            muted={muted}
            onMute={toggleMute}
            fullscreen={fullscreen}
            onFullscreen={toggleFullscreen}
          />
        )}
        {status === "playing" && hud?.banner && <Banner text={hud.banner} sub={hud.bannerSub} />}

        {status === "menu" && (
          <MenuScreen onStart={beginGame} fullscreen={fullscreen} onFullscreen={toggleFullscreen} />
        )}
        {status === "dead" && <DeadScreen onRetry={retry} score={hud?.score ?? 0} boss={hud?.boss} />}
        {status === "levelclear" && <ClearScreen onNext={nextLevel} score={hud?.score ?? 0} name={hud?.levelName ?? ""} n={levelN} />}
        {status === "win" && <WinScreen score={hud?.score ?? 0} onRestart={beginGame} />}
      </div>

      {!fullscreen && <TouchControls press={press} />}

      {!fullscreen && <div className="mt-3 max-w-3xl text-center text-[8px] leading-5 text-zinc-500">
        <span className="text-zinc-300">MOVER</span> ←→/AD · <span className="text-zinc-300">PULAR</span> ESPAÇO/Z (no ar = parry) · <span className="text-zinc-300">ATIRAR</span> F/J/X ·{" "}
        <span className="text-zinc-300">MIRAR</span> ↑↓ (↓ no chão trava) · <span className="text-zinc-300">DASH</span> SHIFT/K ·{" "}
        <span className="text-pink-400">PARRY</span> pule em projéteis ROSA · <span className="text-zinc-300">EX</span> E/L (1 carta) ·{" "}
        <span className="text-yellow-400">SUPER</span> R/Q (5 cartas) · MUDO M
      </div>}
    </div>
  );
}

function drawIdle(ctx, t) {
  const bands = ["#0f0c14", "#161220", "#1e1828", "#261e30"];
  bands.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(0, i * 45, VIEW_W, 45); });
  for (let i = 0; i < 6; i++) {
    const hue = (i * 70 + t * 0.6) % 360;
    ctx.fillStyle = `hsla(${hue},80%,60%,0.12)`;
    const lx = 30 + i * 52;
    ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx - 40, VIEW_H); ctx.lineTo(lx + 40, VIEW_H); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = "#1d1620"; ctx.fillRect(0, 150, VIEW_W, 30);
  ctx.fillStyle = "#3a2c3a"; ctx.fillRect(0, 150, VIEW_W, 3);
}

/** Health is one continuous bar — every attack removes its own amount. */
function HealthBar({ hp, maxHp, flash, lastHit }) {
  const pct = Math.max(0, Math.min(1, hp / maxHp));
  const col = pct > 0.5 ? "#5cff9d" : pct > 0.25 ? "#f2c826" : "#ff2a2a";
  return (
    <div className={`relative ${pct <= 0.25 ? "animate-pulse" : ""}`}>
      <div className="mb-[1px] flex w-[112px] items-baseline justify-between text-[6px] leading-none">
        <span className="tracking-widest text-zinc-400 drop-shadow-[1px_1px_0_#000]">VIDA</span>
        <span className="drop-shadow-[1px_1px_0_#000]" style={{ color: col }}>
          {Math.ceil(hp)}
          <span className="text-zinc-600">/{maxHp}</span>
        </span>
      </div>
      <div className="relative h-[10px] w-[112px] border border-black bg-[#17111c] shadow-[0_1px_0_rgba(255,255,255,0.08)]">
        <div
          className="absolute inset-y-0 left-0 transition-[width] duration-200 ease-out"
          style={{ width: `${pct * 100}%`, backgroundColor: col }}
        >
          <div className="h-[2px] w-full bg-white/45" />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-black/30" />
        </div>
        {[25, 50, 75].map((n) => (
          <div key={n} className="absolute inset-y-0 w-[1px] bg-black/55" style={{ left: `${n}%` }} />
        ))}
        {flash > 0 && <div className="absolute inset-0 bg-red-400/45" />}
      </div>
      {lastHit > 0 && (
        <div
          className="pointer-events-none absolute -top-1 left-[116px] text-[8px] font-bold drop-shadow-[1px_1px_0_#000]"
          style={{ color: lastHit >= 20 ? "#ff2a2a" : "#ffe9a8" }}
        >
          −{lastHit}
        </div>
      )}
    </div>
  );
}

function Cards({ n }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => {
        const fill = Math.max(0, Math.min(1, n - i));
        return (
          <div key={i} className="relative h-4 w-3 border border-black bg-zinc-800">
            <div className="absolute bottom-0 left-0 right-0 bg-pink-500" style={{ height: `${fill * 100}%` }} />
            {fill >= 1 && <div className="absolute inset-0 flex items-center justify-center text-[6px] text-black">♪</div>}
          </div>
        );
      })}
    </div>
  );
}

function FullscreenButton({ fullscreen, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={fullscreen ? "Sair da tela cheia" : "Entrar em tela cheia"}
      title={fullscreen ? "Sair da tela cheia" : "Tela cheia"}
      className="pointer-events-auto flex items-center gap-1 border border-zinc-700 bg-black/70 px-1 py-0.5 text-[6px] text-zinc-300 hover:bg-zinc-800"
    >
      <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.4">
        {fullscreen ? (
          <path d="M1 4h3V1M8 1v3h3M11 8H8v3M4 11V8H1" />
        ) : (
          <path d="M1 4V1h3M8 1h3v3M11 8v3H8M4 11H1V8" />
        )}
      </svg>
      {fullscreen ? "SAIR" : "TELA CHEIA"}
    </button>
  );
}

function HudBar({ hud, muted, onMute, fullscreen, onFullscreen }) {
  return (
    <div className="pointer-events-none absolute inset-0 text-white">
      <div className="absolute left-2 top-2 flex flex-col gap-1">
        <HealthBar hp={hud.hp} maxHp={hud.maxHp} flash={hud.dmgFlash} lastHit={hud.lastHit} />
        <Cards n={hud.cards} />
        <div className="text-[7px] text-yellow-400 drop-shadow-[1px_1px_0_#000]">{hud.score.toString().padStart(6, "0")}</div>
        {/* pedalboard: three square stompboxes, the active one lights up */}
        <div className="mt-0.5 flex gap-1">
          {PEDALS.map((pd) => {
            const on = hud.pedal === pd.name;
            return (
              <div
                key={pd.name}
                className={`relative h-5 w-5 border border-black transition-all duration-150 ${pd.face} ${
                  on ? `${pd.ring} -translate-y-0.5 shadow-[0_2px_0_#000]` : "opacity-25 grayscale"
                }`}
                title={pd.name}
              >
                <span className="absolute left-[2px] top-[2px] h-[3px] w-[3px] bg-white/85" />
                <span className="absolute right-[2px] top-[2px] h-[3px] w-[3px] bg-black/70" />
                <span className={`absolute bottom-[2px] left-[3px] right-[3px] h-[3px] ${pd.icon}`} />
                <span className="absolute bottom-0 left-[3px] right-[3px] h-[2px] bg-zinc-400" />
              </div>
            );
          })}
        </div>
        {hud.pedal && (
          <div className="mt-0.5 w-[68px]">
            <div className="h-1 border border-black bg-zinc-900">
              <div
                className={`h-full ${hud.pedal === "CHORUS" ? "bg-cyan-300" : hud.pedal === "FUZZ" ? "bg-yellow-300" : "bg-orange-400"}`}
                style={{ width: `${(hud.pedalTime / 600) * 100}%` }}
              />
            </div>
          </div>
        )}
        {hud.speedBoost && (
          <div className="mt-0.5 flex items-center gap-1">
            <span className="inline-block h-2 w-4 border border-black bg-emerald-400" />
            <span className="text-[6px] text-emerald-300 drop-shadow-[1px_1px_0_#000]">
              SERINGA {Math.ceil(hud.speedTime / 60)}s
            </span>
          </div>
        )}
      </div>

      <div className="absolute right-2 top-2 flex flex-col items-end gap-1">
        <div className="text-[7px] text-zinc-300 drop-shadow-[1px_1px_0_#000]">{hud.levelName}</div>
        <div className="max-w-[260px] text-right text-[6px] italic text-zinc-500">{hud.songLine}</div>
        <div className="flex gap-1">
          <button onClick={onMute} className="pointer-events-auto border border-zinc-700 bg-black/60 px-1 py-0.5 text-[6px] text-zinc-400 hover:bg-zinc-800">
            {muted ? "SOM: OFF" : "SOM: ON"}
          </button>
          <FullscreenButton fullscreen={fullscreen} onClick={onFullscreen} />
        </div>
      </div>

      {hud.boss && (
        <div className="absolute bottom-2 left-1/2 w-2/3 -translate-x-1/2">
          <div className={`mb-0.5 text-center text-[7px] drop-shadow-[1px_1px_0_#000] ${hud.boss.big ? "text-yellow-400" : "text-red-400"}`}>{hud.boss.name}</div>
          <div className="h-2 w-full border border-black bg-zinc-900">
            <div className={`h-full transition-all duration-150 ${hud.boss.big ? "bg-gradient-to-r from-yellow-500 to-red-600" : "bg-red-600"}`} style={{ width: `${(hud.boss.hp / hud.boss.max) * 100}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

function Banner({ text, sub }) {
  const big = text === "VS" || text === "KNOCKOUT!";
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
      <div
        className={`${big ? "text-4xl sm:text-6xl" : "text-lg sm:text-2xl"} -rotate-3 uppercase ${text === "KNOCKOUT!" ? "text-yellow-400" : text === "PARRY!" ? "text-pink-400" : "text-red-500"} drop-shadow-[4px_4px_0_#000] animate-[pulse_0.4s_ease-in-out_infinite]`}
      >
        {text}
      </div>
      {sub && <div className="mt-2 bg-black/70 px-3 py-1 text-[8px] uppercase tracking-widest text-white sm:text-xs">{sub}</div>}
    </div>
  );
}

function Overlay({ children }) {
  return <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 p-4 text-center">{children}</div>;
}

function Title() {
  return (
    <h1 className="select-none uppercase leading-tight">
      <span className="block -rotate-2 text-xl text-pink-500 drop-shadow-[3px_3px_0_#000] sm:text-3xl">In Utero,</span>
      <span className="block rotate-1 text-2xl text-yellow-400 drop-shadow-[3px_3px_0_#000] sm:text-4xl">Fora de Tom</span>
    </h1>
  );
}

/** Little square stompbox used in the legend. */
function LegendRow({ face, icon, name, desc }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`relative inline-block h-5 w-5 shrink-0 border border-black ${face}`}>
        <span className="absolute left-[2px] top-[2px] h-[3px] w-[3px] bg-white/85" />
        <span className="absolute right-[2px] top-[2px] h-[3px] w-[3px] bg-black/70" />
        <span className={`absolute bottom-[3px] left-[3px] right-[3px] h-[3px] ${icon}`} />
      </span>
      <span className="text-[6px] leading-3 text-zinc-400 sm:text-[7px]">
        <b className="text-zinc-100">{name}</b>
        <br />
        {desc}
      </span>
    </div>
  );
}

function MenuScreen({ onStart, fullscreen, onFullscreen }) {
  return (
    <Overlay>
      <Title />
      <p className="max-w-md text-[7px] leading-4 text-zinc-300 sm:text-[9px] sm:leading-5">
        Run &amp; gun grunge estilo Cuphead. Sua guitarra é a arma. 10 shows, um mini-boss no fim de cada, e um boss GIGANTE a cada 5 fases.
      </p>
      <div className="grid w-full max-w-lg gap-2 sm:grid-cols-2">
        <div className="border border-zinc-700 bg-black/60 p-2">
          <div className="mb-1.5 text-[6px] tracking-widest text-zinc-500 sm:text-[7px]">PEDALEIRA & ITENS</div>
          <div className="space-y-1.5 text-left">
            <LegendRow face="bg-violet-600" icon="bg-cyan-300" name="CHORUS" desc="raio contínuo arredondado, alcance infinito" />
            <LegendRow face="bg-yellow-400" icon="bg-yellow-100" name="FUZZ" desc="raio triangular pesado, 1 tiro por segundo" />
            <LegendRow face="bg-orange-500" icon="bg-orange-200" name="DISTORTION" desc="esp. de chumbo laranja" />
            <LegendRow face="bg-emerald-400" icon="bg-emerald-100" name="SERINGA" desc="+velocidade por 10s" />
            <LegendRow face="bg-red-800" icon="bg-zinc-300" name="VINIL" desc="+50 pontos" />
             <LegendRow face="bg-zinc-500" icon="bg-yellow-200" name="FITA" desc="recupera 28 de vida" />
             <LegendRow face="bg-red-700" icon="bg-white" name="MEDKIT" desc="recupera 40 de vida" />
          </div>
        </div>
        <div className="border border-zinc-700 bg-black/60 p-2 text-left text-[6px] leading-3 text-zinc-400 sm:text-[7px]">
          <div className="mb-1.5 text-[6px] tracking-widest text-zinc-500 sm:text-[7px]">COMO TOCAR</div>
          <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
            <span className="text-pink-400">PARRY</span><span>sem pulo duplo: aperte pular no ar ao tocar projétil ROSA</span>
            <span className="text-yellow-400">CARTAS</span><span>acerte ou faça parry para encher</span>
            <span className="text-zinc-200">EX</span><span>1 carta — riff gigante perfurante</span>
            <span className="text-zinc-200">SUPER</span><span>5 cartas — POWER CHORD na tela</span>
            <span className="text-zinc-200">DASH</span><span>invencível durante o avanço</span>
            <span className="text-zinc-200">MIRAR</span><span>↑ / ↓ (↓ no chão trava o tiro)</span>
            <span className="text-red-400">VIDA</span><span>barra de 100 — cada golpe tira um tanto diferente</span>
          </div>
        </div>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <button onClick={onStart} className="animate-pulse bg-pink-600 px-4 py-2 text-[9px] uppercase text-white shadow-[3px_3px_0_#000] hover:bg-pink-500 sm:text-xs">
          ▶ Começar o Show
        </button>
        <FullscreenButton fullscreen={fullscreen} onClick={onFullscreen} />
      </div>
    </Overlay>
  );
}

function DeadScreen({ onRetry, score, boss }) {
  const pct = boss ? Math.round((1 - boss.hp / boss.max) * 100) : null;
  return (
    <Overlay>
      <h2 className="-rotate-2 text-xl uppercase text-red-600 drop-shadow-[3px_3px_0_#000] sm:text-3xl">Acabou o Show</h2>
      <p className="text-[7px] text-zinc-300 sm:text-[9px]">A galera parou de pular. Você apagou.</p>
      {pct !== null && (
        <div className="w-48">
          <div className="mb-1 text-[6px] text-zinc-400">PROGRESSO NO BOSS: {pct}%</div>
          <div className="h-2 border border-black bg-zinc-900"><div className="h-full bg-yellow-400" style={{ width: `${pct}%` }} /></div>
        </div>
      )}
      <p className="text-[8px] text-yellow-400">PONTOS {score}</p>
      <button onClick={onRetry} className="bg-white px-4 py-2 text-[9px] uppercase text-black shadow-[3px_3px_0_#b8202e] hover:bg-zinc-200">↻ Bis (tentar de novo)</button>
    </Overlay>
  );
}

function ClearScreen({ onNext, score, name, n }) {
  const big = n % 5 === 0;
  return (
    <Overlay>
      <h2 className="rotate-1 text-xl uppercase text-green-400 drop-shadow-[3px_3px_0_#000] sm:text-3xl">{big ? "Boss Derrotado!" : "Show Fechado!"}</h2>
      <p className="text-[7px] text-zinc-300 sm:text-[9px]">{name} — mandou bem.</p>
      <p className="text-[8px] text-yellow-400">PONTOS {score}</p>
      {n + 1 <= TOTAL_LEVELS && (n + 1) % 5 === 0 && <p className="animate-pulse text-[7px] text-red-400">⚠ PRÓXIMA: BOSS GIGANTE</p>}
      <button onClick={onNext} className="bg-yellow-400 px-4 py-2 text-[9px] uppercase text-black shadow-[3px_3px_0_#000] hover:bg-yellow-300">
        {n + 1 > TOTAL_LEVELS ? "★ Finalizar" : "▶ Próximo Show"}
      </button>
    </Overlay>
  );
}

function WinScreen({ score, onRestart }) {
  return (
    <Overlay>
      <h2 className="text-xl uppercase text-pink-500 drop-shadow-[3px_3px_0_#000] sm:text-3xl">Você Venceu!</h2>
      <p className="max-w-md text-[7px] leading-4 text-zinc-300 sm:text-[9px] sm:leading-5">
        Destruiu o Big Cheese S/A e o All Apologies: Deus do Encore. A cena continua viva. Stay punk. 🎸
      </p>
      <p className="text-[9px] text-yellow-400">PONTUAÇÃO FINAL {score}</p>
      <button onClick={onRestart} className="bg-pink-600 px-4 py-2 text-[9px] uppercase text-white shadow-[3px_3px_0_#000] hover:bg-pink-500">↻ Jogar de novo</button>
    </Overlay>
  );
}

function TouchControls({ press }) {
  const btn = "select-none touch-none flex h-12 w-12 items-center justify-center border-2 border-black bg-zinc-800/90 text-[10px] text-white active:scale-95";
  const B = ({ k, label, cls = "" }) => (
    <button className={`${btn} ${cls}`} onTouchStart={press(k, true)} onTouchEnd={press(k, false)} onTouchCancel={press(k, false)} onMouseDown={press(k, true)} onMouseUp={press(k, false)} onMouseLeave={press(k, false)}>
      {label}
    </button>
  );
  return (
    <div className="mt-2 flex w-full max-w-2xl items-end justify-between px-2 sm:hidden">
      <div className="grid grid-cols-3 gap-1">
        <div /><B k="up" label="▲" /><div />
        <B k="left" label="◀" /><B k="down" label="▼" /><B k="right" label="▶" />
      </div>
      <div className="grid grid-cols-2 gap-1">
        <B k="ex" label="EX" cls="bg-purple-800/90" /><B k="sup" label="SUP" cls="bg-yellow-700/90" />
        <B k="dash" label="DASH" cls="bg-blue-800/90" /><B k="shoot" label="🎸" cls="bg-pink-700/90" />
        <div /><B k="jump" label="PULO" cls="bg-green-800/90" />
      </div>
    </div>
  );
}
