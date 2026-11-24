import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Crosshair,
  Gauge,
  Pause,
  Play,
  RotateCcw,
  Shield,
  Trophy,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";
import { Engine } from "@/game/engine";
import { loadScores, qualifies, saveScore, type ScoreEntry } from "@/game/scores";
import type { Hud } from "@/game/types";

const INITIAL: Hud = {
  phase: "title",
  hp: 100,
  maxHp: 100,
  score: 0,
  best: 0,
  wave: 1,
  combo: 0,
  comboMult: 1,
  shieldHits: 0,
  shieldTime: 0,
  multi: 0,
  multiTime: 0,
  boostTime: 0,
  banner: "",
  muted: false,
  shake: true,
};

type RunResult = {
  score: number;
  wave: number;
  qualifies: boolean;
  isBest: boolean;
};

export function GameScreen() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [hud, setHud] = useState<Hud>(INITIAL);
  const [ready, setReady] = useState(false);
  const [scores, setScores] = useState<ScoreEntry[]>([]);
  const [board, setBoard] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [name, setName] = useState("");
  const [savedRank, setSavedRank] = useState<number | null>(null);
  const scoresRef = useRef(scores);
  scoresRef.current = scores;
  const hudRef = useRef(hud);
  hudRef.current = hud;

  useEffect(() => {
    setScores(loadScores());
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let alive = true;
    const engine = new Engine(canvas, (next) => {
      if (alive) setHud(next);
    });
    engineRef.current = engine;
    setReady(true);
    return () => {
      alive = false;
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (hud.phase !== "over") {
      setResult(null);
      setSavedRank(null);
      return;
    }
    const current = hudRef.current;
    const list = scoresRef.current;
    setName("");
    setSavedRank(null);
    setResult({
      score: current.score,
      wave: current.wave,
      qualifies: qualifies(current.score, list),
      isBest: current.score > 0 && current.score > (list[0]?.score ?? 0),
    });
  }, [hud.phase]);

  useEffect(() => {
    if (!board) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Escape") return;
      e.stopPropagation();
      setBoard(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [board]);

  function withEngine(run: (engine: Engine) => void) {
    const engine = engineRef.current;
    if (engine) run(engine);
  }

  function persistIfNeeded() {
    if (!result?.qualifies || savedRank != null) return;
    const list = saveScore({
      name: name.trim() || "匿名",
      score: result.score,
      wave: result.wave,
    });
    setScores(list);
    const rank = list.findIndex((row) => row.score === result.score) + 1;
    setSavedRank(rank > 0 ? rank : null);
    withEngine((engine) => engine.setBest(list[0]?.score ?? 0));
  }

  function openBoard() {
    withEngine((engine) => {
      engine.unlock();
      engine.pauseForMenu();
    });
    setBoard(true);
  }

  const hpPct = Math.max(0, Math.min(100, (hud.hp / hud.maxHp) * 100));
  const low = hud.hp > 0 && hud.hp / hud.maxHp <= 0.35;

  return (
    <main className="game-root relative h-dvh w-full overflow-hidden bg-void text-ice">
      <canvas
        ref={canvasRef}
        className={
          hud.phase === "playing" ? "absolute inset-0 h-full w-full cursor-crosshair" : "absolute inset-0 h-full w-full"
        }
        role="application"
        aria-label="星屑突击，俯视太空射击"
      />
      <div className="pointer-events-none absolute inset-3 z-10 md:inset-4" aria-hidden="true">
        <span className="hud-corner top-0 left-0 border-t-2 border-l-2" />
        <span className="hud-corner top-0 right-0 border-t-2 border-r-2" />
        <span className="hud-corner bottom-0 left-0 border-b-2 border-l-2" />
        <span className="hud-corner right-0 bottom-0 border-r-2 border-b-2" />
      </div>

      {hud.phase === "playing" || hud.phase === "paused" ? (
        <div className="pointer-events-none absolute inset-0 z-20">
          <div className="flex items-start justify-between gap-3 px-4 pt-4 md:px-6 md:pt-5">
            <div className="min-w-0">
              <p className="text-xs tracking-widest text-mist uppercase">波次</p>
              <p className="font-display text-xl text-ice tabular-nums md:text-2xl">{hud.wave}</p>
            </div>
            <div className="text-center">
              <p className="text-xs tracking-widest text-mist uppercase">分数</p>
              <p className="font-display text-2xl text-prize tabular-nums md:text-3xl">{hud.score}</p>
              {hud.combo > 1 ? (
                <p className="mt-1 font-display text-xs text-flare tabular-nums">
                  连击 {hud.combo} · ×{hud.comboMult}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              className="pointer-events-auto inline-flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-panel text-ice"
              aria-label="暂停"
              onClick={() => withEngine((engine) => engine.togglePause())}
            >
              <Pause className="size-5" aria-hidden="true" />
            </button>
          </div>
          <div className="px-4 pt-3 md:px-6">
            <div className="mb-1 flex items-center justify-between text-xs text-mist">
              <span>机体</span>
              <span className={low ? "text-ember tabular-nums" : "tabular-nums"}>
                {Math.ceil(hud.hp)} / {hud.maxHp}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-ink" aria-hidden="true">
              <div
                className={low ? "h-full bg-ember" : "h-full bg-flare"}
                style={{ width: `${hpPct}%` }}
              />
            </div>
          </div>
          {hud.banner ? (
            <div className="pointer-events-none absolute inset-x-0 top-28 flex justify-center px-4">
              <p className="rounded-full border border-line bg-ink/90 px-4 py-2 font-display text-lg text-flare md:text-2xl">
                {hud.banner}
              </p>
            </div>
          ) : null}
          <div className="absolute right-4 bottom-36 left-4 flex flex-wrap gap-2 md:bottom-6">
            {hud.multi > 0 && hud.multiTime > 0 ? (
              <Status icon={<Crosshair className="size-4" />} label={`多重 ×${1 + hud.multi * 2}`} time={hud.multiTime} />
            ) : null}
            {hud.shieldHits > 0 && hud.shieldTime > 0 ? (
              <Status icon={<Shield className="size-4" />} label={`护盾 ${hud.shieldHits}`} time={hud.shieldTime} />
            ) : null}
            {hud.boostTime > 0 ? (
              <Status icon={<Zap className="size-4" />} label="加速" time={hud.boostTime} tone="prize" />
            ) : null}
          </div>
          <div className="touch-only pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between px-4 pt-2 safe-b">
            <Stick onChange={(x, y) => withEngine((engine) => engine.setStick(x, y))} />
            <button
              type="button"
              className="pointer-events-auto mb-2 flex h-20 w-20 items-center justify-center rounded-full border border-ember bg-ember text-sm font-bold text-void"
              aria-label="开火"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                withEngine((engine) => engine.setFireHeld(true));
              }}
              onPointerUp={() => withEngine((engine) => engine.setFireHeld(false))}
              onPointerCancel={() => withEngine((engine) => engine.setFireHeld(false))}
            >
              开火
            </button>
          </div>
        </div>
      ) : null}

      {hud.phase === "title" ? (
        <section className="absolute inset-0 z-20 overflow-y-auto bg-gradient-to-b from-void/90 via-void/45 to-void/80">
          <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-5 py-8 md:px-12 md:py-12">
            <div className="max-w-xl">
              <p className="text-xs tracking-widest text-flare uppercase">深空联队 · 第七舰队</p>
              <h1 className="mt-3 text-5xl font-bold text-balance text-ice md:text-6xl">星屑突击</h1>
              <p className="track-brand mt-2 font-display text-sm text-flare">STARSHARD</p>
              <p className="mt-4 max-w-md text-pretty text-mist">
                俯视驾驶拦截机，击破一波波来袭的敌舰。截获多重射击、护盾和加速，把代号留在最高分榜。
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  className="glow-flare inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-flare px-5 text-sm font-bold text-void disabled:opacity-50"
                  disabled={!ready}
                  onClick={() =>
                    withEngine((engine) => {
                      engine.unlock();
                      engine.startRun();
                    })
                  }
                >
                  <Play className="size-4" aria-hidden="true" />
                  开始出击
                </button>
                <button
                  type="button"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-line bg-panel px-5 text-sm font-medium text-ice"
                  onClick={openBoard}
                >
                  <Trophy className="size-4 text-prize" aria-hidden="true" />
                  最高分榜
                </button>
              </div>
              <ul className="mt-8 grid grid-cols-3 gap-2">
                <Feature n="01" title="多波来袭" copy="侦察、突刺、织网与王牌" />
                <Feature n="02" title="战场强化" copy="散射、护盾、超载推进" />
                <Feature n="03" title="本地榜" copy="前八代号留在这台设备" />
              </ul>
              <div className="mt-6 grid gap-3 rounded-2xl border border-line bg-panel/80 p-4 text-sm md:grid-cols-2">
                <div>
                  <p className="font-display text-xs text-flare">键盘</p>
                  <p className="mt-1 text-pretty text-mist">WASD 或方向键推进。鼠标瞄准。空格或左键射击。</p>
                </div>
                <div>
                  <p className="font-display text-xs text-prize">指针</p>
                  <p className="mt-1 text-pretty text-mist">按住并拖动，飞船朝触点平滑加速。触屏可开火并自动射击。</p>
                </div>
              </div>
              <p className="mt-4 text-sm text-mist tabular-nums">
                最佳 {scores[0] ? scores[0].score : "—"}
                {scores[0] ? ` · ${scores[0].name}` : ""}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {hud.phase === "paused" && !board ? (
        <MenuShell title="暂停" kicker="航线冻结">
          <p className="text-sm text-pretty text-mist">
            Esc 或 P 继续。松键后飞船会惯性滑行，对角移动不会更快。
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Toggle
              pressed={!hud.muted}
              onClick={() => withEngine((engine) => engine.setMuted(!hud.muted))}
              icon={hud.muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
              label={hud.muted ? "音效关" : "音效开"}
            />
            <Toggle
              pressed={hud.shake}
              onClick={() => withEngine((engine) => engine.setShake(!hud.shake))}
              icon={<Gauge className="size-4" />}
              label={hud.shake ? "震动开" : "震动关"}
            />
          </div>
          <div className="mt-5 flex flex-col gap-2">
            <button
              type="button"
              className="glow-flare inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-flare text-sm font-bold text-void"
              onClick={() => withEngine((engine) => engine.togglePause())}
            >
              <Play className="size-4" aria-hidden="true" />
              继续
            </button>
            <button
              type="button"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-line bg-ink text-sm text-ice"
              onClick={() => withEngine((engine) => engine.startRun())}
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              重新开始
            </button>
            <button
              type="button"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-line bg-ink text-sm text-ice"
              onClick={openBoard}
            >
              <Trophy className="size-4 text-prize" aria-hidden="true" />
              最高分榜
            </button>
            <button
              type="button"
              className="inline-flex h-12 items-center justify-center rounded-xl text-sm text-mist"
              onClick={() => withEngine((engine) => engine.toTitle())}
            >
              返回标题
            </button>
          </div>
        </MenuShell>
      ) : null}

      {hud.phase === "over" && result && !board ? (
        <MenuShell title="机体损毁" kicker={result.isBest ? "新的最高分" : "信号中断"}>
          <p className="font-display text-4xl text-prize tabular-nums">{result.score}</p>
          <p className="mt-1 text-sm text-mist tabular-nums">
            第 {result.wave} 波 · 最佳 {Math.max(hud.best, scores[0]?.score ?? 0)}
          </p>
          {result.qualifies && savedRank == null ? (
            <form
              className="mt-4"
              onSubmit={(e) => {
                e.preventDefault();
                persistIfNeeded();
              }}
            >
              <label className="text-xs tracking-widest text-mist uppercase" htmlFor="callsign">
                留下代号
              </label>
              <input
                id="callsign"
                value={name}
                maxLength={8}
                placeholder="匿名"
                autoComplete="off"
                spellCheck={false}
                className="mt-2 h-12 w-full rounded-xl border border-line bg-ink px-3 text-ice outline-none placeholder:text-mist"
                onChange={(e) => setName(e.target.value)}
              />
              <button
                type="submit"
                className="mt-3 inline-flex h-12 w-full items-center justify-center rounded-xl bg-flare text-sm font-bold text-void"
              >
                记入最高分榜
              </button>
            </form>
          ) : null}
          {savedRank != null ? (
            <p className="mt-4 text-sm text-flare">已记入第 {savedRank} 名</p>
          ) : null}
          {!result.qualifies ? <p className="mt-4 text-sm text-mist">未进入前八名。</p> : null}
          <div className="mt-5 flex flex-col gap-2">
            <button
              type="button"
              className="glow-flare inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-flare text-sm font-bold text-void"
              onClick={() => {
                persistIfNeeded();
                withEngine((engine) => engine.startRun());
              }}
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              再来一局
            </button>
            <button
              type="button"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-line bg-ink text-sm text-ice"
              onClick={() => {
                persistIfNeeded();
                openBoard();
              }}
            >
              <Trophy className="size-4 text-prize" aria-hidden="true" />
              最高分榜
            </button>
            <button
              type="button"
              className="inline-flex h-12 items-center justify-center rounded-xl text-sm text-mist"
              onClick={() => {
                persistIfNeeded();
                withEngine((engine) => engine.toTitle());
              }}
            >
              返回标题
            </button>
          </div>
        </MenuShell>
      ) : null}

      {board ? (
        <section
          className="absolute inset-0 z-30 flex items-center justify-center bg-void/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-label="最高分榜"
        >
          <div className="max-h-full w-full max-w-md overflow-y-auto rounded-2xl border border-line bg-panel p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-2xl font-bold text-ice">最高分榜</h2>
              <Trophy className="size-5 text-prize" aria-hidden="true" />
            </div>
            <p className="mt-1 text-sm text-mist">只保存在这台设备上，前八名。</p>
            {scores.length === 0 ? (
              <p className="mt-6 text-sm text-mist">尚无战绩。出击后留下代号。</p>
            ) : (
              <ol className="mt-4 flex flex-col gap-2">
                {scores.map((row, index) => (
                  <li
                    key={`${row.at}-${row.name}-${index}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-line bg-ink px-3 py-2"
                  >
                    <span
                      className={
                        index === 0
                          ? "font-display text-sm text-prize tabular-nums"
                          : index === 1
                            ? "font-display text-sm text-flare tabular-nums"
                            : "font-display text-sm text-mist tabular-nums"
                      }
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-ice">{row.name}</span>
                    <span className="text-right">
                      <span className="block font-display text-sm text-ice tabular-nums">{row.score}</span>
                      <span className="block text-xs text-mist tabular-nums">第 {row.wave} 波</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
            <button
              type="button"
              className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-xl bg-flare text-sm font-bold text-void"
              onClick={() => setBoard(false)}
            >
              关闭
            </button>
          </div>
        </section>
      ) : null}
    </main>
  );
}

function Feature({ n, title, copy }: { n: string; title: string; copy: string }) {
  return (
    <li className="rounded-xl border border-line bg-panel/80 p-2 md:p-3">
      <p className="font-display text-xs text-flare">{n}</p>
      <p className="mt-1 text-sm font-medium text-ice">{title}</p>
      <p className="mt-1 text-xs text-pretty text-mist">{copy}</p>
    </li>
  );
}

function Status({
  icon,
  label,
  time,
  tone = "flare",
}: {
  icon: ReactNode;
  label: string;
  time: number;
  tone?: "flare" | "prize";
}) {
  return (
    <span
      className={
        tone === "prize"
          ? "inline-flex items-center gap-2 rounded-full border border-line bg-ink/90 px-3 py-1 text-xs text-prize"
          : "inline-flex items-center gap-2 rounded-full border border-line bg-ink/90 px-3 py-1 text-xs text-flare"
      }
    >
      {icon}
      {label}
      <span className="tabular-nums text-ice">{Math.ceil(time)}s</span>
    </span>
  );
}

function Toggle({
  pressed,
  onClick,
  icon,
  label,
}: {
  pressed: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-line bg-ink text-sm text-ice"
    >
      {icon}
      {label}
    </button>
  );
}

function MenuShell({ title, kicker, children }: { title: string; kicker: string; children: ReactNode }) {
  return (
    <section className="absolute inset-0 z-20 flex items-center justify-center bg-void/75 p-4 backdrop-blur-sm">
      <div className="max-h-full w-full max-w-md overflow-y-auto rounded-2xl border border-line bg-panel p-5">
        <p className="font-display text-xs tracking-widest text-flare uppercase">{kicker}</p>
        <h2 className="mt-1 text-3xl font-bold text-balance text-ice">{title}</h2>
        <div className="mt-3">{children}</div>
      </div>
    </section>
  );
}

function Stick({ onChange }: { onChange: (x: number, y: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const active = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  function update(clientX: number, clientY: number) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const max = rect.width * 0.34;
    const dist = Math.hypot(dx, dy);
    if (dist > max && dist > 0) {
      dx = (dx / dist) * max;
      dy = (dy / dist) * max;
    }
    setKnob({ x: dx, y: dy });
    if (dist < 10) onChange(0, 0);
    else onChange(dx / max, dy / max);
  }

  return (
    <div
      ref={ref}
      className="pointer-events-auto relative mb-2 h-28 w-28 rounded-full border border-line bg-ink/80"
      aria-label="移动摇杆"
      role="slider"
      aria-valuemin={-1}
      aria-valuemax={1}
      onPointerDown={(e) => {
        active.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (active.current !== e.pointerId) return;
        update(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => {
        if (active.current !== e.pointerId) return;
        active.current = null;
        setKnob({ x: 0, y: 0 });
        onChange(0, 0);
      }}
      onPointerCancel={() => {
        active.current = null;
        setKnob({ x: 0, y: 0 });
        onChange(0, 0);
      }}
    >
      <span
        className="absolute top-1/2 left-1/2 h-12 w-12 rounded-full bg-flare"
        style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
      />
    </div>
  );
}
