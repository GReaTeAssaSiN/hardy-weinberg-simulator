import { Button } from '@mui/material';
import { describeFactors, display, integer } from './simulationUi';
import type { SimulationParams } from './types';

const examples: { title: string; description: string; params: SimulationParams }[] = [
  {
    title: 'Идеальная популяция', description: 'Посмотрите, как сохраняются частоты без внешних факторов.',
    params: { n: 500, p0: 0.3, generations: 100 },
  },
  {
    title: 'Заповедник', description: 'Проследите случайные изменения в малой изолированной популяции.',
    params: { n: 50, p0: 0.5, generations: 200, drift: { seed: 42 } },
  },
  {
    title: 'Заповедник с притоком мигрантов', description: 'Сравните один и тот же заповедник с притоком и без притока мигрантов.',
    params: { n: 50, p0: 0.5, generations: 200, drift: { seed: 42 }, migration: { m: 0.05, p_m: 0.5 } },
  },
  {
    title: 'Селекция', description: 'Узнайте, когда частота A достигнет 0,95 при пониженной приспособленности aa.',
    params: { n: 500, p0: 0.5, generations: 100, selection: { w11: 1, w12: 1, w22: 0.6, target_p: 0.95 } },
  },
  {
    title: 'Миграция', description: 'Посмотрите, как частота A приближается к частоте среди мигрантов.',
    params: { n: 500, p0: 0.3, generations: 100, migration: { m: 0.1, p_m: 0.8 } },
  },
  {
    title: 'Инбридинг', description: 'Проверьте, как меняются доли генотипов при неизменных частотах аллелей.',
    params: { n: 500, p0: 0.5, generations: 100, inbreeding: { f: 0.25 } },
  },
];

export default function ExamplesScreen({ onOpen, loading }: {
  onOpen: (params: SimulationParams) => void;
  loading: boolean;
}) {
  return <main className="examples-page">
    <h1>Примеры моделирования</h1>
    <div className="examples-grid">
      {examples.map(({ title, description, params }) => {
        const factors = describeFactors(params);
        if (params.drift) factors.push(`дрейф (зерно ${params.drift.seed})`);
        return <article key={title} className="panel example-card">
          <h2>{title}</h2>
          <p>{description}</p>
          <p className="example-parameters">N = {integer.format(params.n)} · p₀ = {display(params.p0)} · T = {params.generations}
            {factors.length > 0 && <> · {factors.join(' · ')}</>}
          </p>
          <Button variant="outlined" disabled={loading} aria-label={`Открыть пример «${title}»`}
            onClick={() => onOpen(params)}>Открыть пример</Button>
        </article>;
      })}
    </div>
  </main>;
}
