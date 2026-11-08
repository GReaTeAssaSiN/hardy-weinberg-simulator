export type SimulationParams = {
  n: number;
  p0: number;
  generations: number;
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
};
