export type SimulationParams = {
  n: number;
  p0: number;
  generations: number;
  migration?: { m: number; p_m: number };
  selection?: { w11: number; w12: number; w22: number; target_p: number };
};

export type GenerationRow = {
  t: number;
  p: number;
  q: number;
  f_AA: number;
  f_Aa: number;
  f_aa: number;
  h: number;
};

export type SimulationResult = {
  params: SimulationParams;
  rows: GenerationRow[];
  target_generation?: number;
};
