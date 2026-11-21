export type SimulationParams = {
  n: number;
  p0: number;
  generations: number;
  migration?: { m: number; p_m: number };
  selection?: { w11: number; w12: number; w22: number; target_p: number };
  inbreeding?: { f: number };
  drift?: { seed?: number };
};

export type GenerationRow = {
  t: number;
  p: number;
  q: number;
  f_AA: number;
  f_Aa: number;
  f_aa: number;
  h: number;
  h_theory?: number;
};

export type SimulationResult = {
  params: SimulationParams;
  rows: GenerationRow[];
  target_generation?: number;
  drift_summary?: {
    boundary?: { kind: 'fixation' | 'loss'; generation: number };
    theoretical_half_life?: number;
  };
};
