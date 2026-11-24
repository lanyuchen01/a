export type ScoreEntry = {
  name: string;
  score: number;
  wave: number;
  at: number;
};

type ScoreFile = { version: 1; entries: ScoreEntry[] };

export type Settings = {
  mute: boolean;
  /** null until the player chooses, so reduced-motion can set the default. */
  shake: boolean | null;
};

const SCORE_KEY = "starshard.scores.v1";
const SETTING_KEY = "starshard.settings.v1";

function canStore(): boolean {
  return typeof localStorage !== "undefined";
}

function validEntry(value: unknown): value is ScoreEntry {
  if (!value || typeof value !== "object") return false;
  const row = value as ScoreEntry;
  return (
    typeof row.name === "string" &&
    typeof row.score === "number" &&
    Number.isFinite(row.score) &&
    typeof row.wave === "number" &&
    typeof row.at === "number"
  );
}

export function loadScores(): ScoreEntry[] {
  if (!canStore()) return [];
  try {
    const raw = localStorage.getItem(SCORE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as ScoreFile;
    if (!data || data.version !== 1 || !Array.isArray(data.entries)) return [];
    return data.entries.filter(validEntry).slice(0, 8);
  } catch {
    return [];
  }
}

export function bestScore(entries: ScoreEntry[] = loadScores()): number {
  return entries[0]?.score ?? 0;
}

export function qualifies(score: number, entries: ScoreEntry[]): boolean {
  if (score <= 0) return false;
  if (entries.length < 8) return true;
  return score > (entries[7]?.score ?? 0);
}

export function saveScore(entry: { name: string; score: number; wave: number }): ScoreEntry[] {
  const name = entry.name.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 8) || "匿名";
  const next: ScoreEntry = {
    name,
    score: Math.max(0, Math.floor(entry.score)),
    wave: Math.max(1, Math.floor(entry.wave)),
    at: Date.now(),
  };
  const entries = [...loadScores(), next]
    .sort((a, b) => b.score - a.score || a.at - b.at)
    .slice(0, 8);
  if (canStore()) {
    const file: ScoreFile = { version: 1, entries };
    localStorage.setItem(SCORE_KEY, JSON.stringify(file));
  }
  return entries;
}

export function loadSettings(): Settings {
  if (!canStore()) return { mute: false, shake: null };
  try {
    const raw = localStorage.getItem(SETTING_KEY);
    if (!raw) return { mute: false, shake: null };
    const data = JSON.parse(raw) as { version?: number; mute?: boolean; shake?: boolean };
    if (!data || data.version !== 1) return { mute: false, shake: null };
    return {
      mute: Boolean(data.mute),
      shake: typeof data.shake === "boolean" ? data.shake : null,
    };
  } catch {
    return { mute: false, shake: null };
  }
}

export function saveSettings(settings: { mute: boolean; shake: boolean }): void {
  if (!canStore()) return;
  localStorage.setItem(
    SETTING_KEY,
    JSON.stringify({ version: 1, mute: settings.mute, shake: settings.shake }),
  );
}
