export type Phase = "title" | "playing" | "paused" | "over";

export type PickupKind = "multi" | "shield" | "boost";

export type EnemyKind = "scout" | "dart" | "weaver" | "bruiser" | "ace";

export type Hud = {
  phase: Phase;
  hp: number;
  maxHp: number;
  score: number;
  best: number;
  wave: number;
  combo: number;
  comboMult: number;
  shieldHits: number;
  shieldTime: number;
  multi: number;
  multiTime: number;
  boostTime: number;
  banner: string;
  muted: boolean;
  shake: boolean;
};

export type ControlsProbe = {
  getYaw: () => number;
  getSpeed: () => number;
  getPos: () => { x: number; y: number };
  /** +1 is player-visible left (screen −X), same sign as a chase-cam steer. */
  setSteer: (v: number) => void;
  setKeys: (codes: string[]) => void;
  getShots: () => number;
  getPhase: () => string;
  getScore: () => number;
  getHp: () => number;
  getHits?: () => number[];
};

declare global {
  interface Window {
    __controlsTest?: ControlsProbe;
  }
}

export const PALETTE = {
  void: "#070910",
  ink: "#0c121b",
  ice: "#e7f6ff",
  mist: "#8ea4bb",
  flare: "#3ee7ff",
  ember: "#ff5c45",
  prize: "#ffc857",
  emberDeep: "#8d2c22",
  flareDeep: "#0c3c46",
};
