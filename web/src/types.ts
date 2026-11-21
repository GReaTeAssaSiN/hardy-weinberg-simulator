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
  chi_square?: number;
};

export type SimulationResult = {
  params: SimulationParams;
  rows: GenerationRow[];
  target_generation?: number;
  chi_square_summary?: {
    critical_value: number;
    degrees_of_freedom: number;
    first_exceedance_generation?: number;
  };
  drift_summary?: {
    boundary?: { kind: 'fixation' | 'loss'; generation: number };
    theoretical_half_life?: number;
  };
};

export type AdditionalFactors = Pick<SimulationParams, 'migration' | 'selection' | 'inbreeding'>;

export type BatchSimulationParams = SimulationParams & {
  runs: number;
  drift: { seed?: number };
};

export type BatchGenerationRow = {
  t: number;
  p_mean: number;
  p05: number;
  p95: number;
  h_mean: number;
  h_theory?: number;
  f_Aa_mean?: number;
};

export type BatchBoundary = {
  count: number;
  share: number;
  mean_generation?: number;
};

export type BatchSimulationResult = {
  params: BatchSimulationParams & { drift: { seed: number } };
  rows: BatchGenerationRow[];
  trajectories: number[][];
  fixation: BatchBoundary;
  loss: BatchBoundary;
};
