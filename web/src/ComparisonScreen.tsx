import { useMemo } from 'react';
import { Button, Checkbox, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { describeFactors, display, generationTicks, integer } from './simulationUi';
import { MAX_SCENARIOS, scenarioName } from './savedScenarios';
import type { SavedScenario } from './savedScenarios';
import type { SimulationParams } from './types';

const METRICS = {
  p: { label: 'Частота p', axis: 'Частота аллеля A', maximum: 1 },
  h: { label: 'Гетерозиготность H', axis: 'Ожидаемая гетерозиготность 2pq', maximum: 0.5 },
  f_aa: { label: 'Доля aa', axis: 'Доля генотипа aa', maximum: 1 },
};

export type ComparisonMetric = keyof typeof METRICS;

const SERIES_STYLES = [
  { color: '#2161eb', dash: undefined },
  { color: '#d56b14', dash: '7 3' },
  { color: '#087d70', dash: '3 3' },
  { color: '#8551ae', dash: '9 3 2 3' },
  { color: '#b93f6b', dash: '10 5' },
  { color: '#655c26', dash: '2 4' },
];

function describeParameters(params: SimulationParams): string[] {
  const { n, p0, generations, drift } = params;
  const factors = describeFactors(params);
  if (drift) factors.push(drift.seed === undefined ? 'дрейф' : `дрейф (зерно ${drift.seed})`);
  return [
    `N = ${integer.format(n)} · p₀ = ${display(p0)} · T = ${integer.format(generations)}`,
    factors.join(' · ') || 'Идеальная популяция',
  ];
}

function ComparisonChart({ scenarios, metric }: { scenarios: SavedScenario[]; metric: ComparisonMetric }) {
  const visible = scenarios.filter((scenario) => scenario.visible);
  const end = Math.max(0, ...visible.map(({ result }) => result.params.generations));
  const data = useMemo(() => Array.from({ length: end + 1 }, (_, t) => ({
    t,
    ...Object.fromEntries(scenarios.map(({ id, result }) => [`s${id}`, result.rows[t]?.[metric] ?? null])),
  })), [scenarios, metric, end]);

  if (!visible.length) return <p className="comparison-empty-chart">Включите хотя бы один сценарий, чтобы увидеть график.</p>;
  return <>
    <div className="chart-wrap" aria-label="График сравнения по поколениям">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <LineChart data={data} margin={{ top: 12, right: 18, bottom: 14, left: 0 }}>
          <CartesianGrid stroke="#e7ebef" vertical={false} />
          <XAxis dataKey="t" type="number" domain={[0, end]} ticks={generationTicks(end)} interval={0}
            tick={{ fontSize: 12, fill: '#8290a0' }} tickLine={false} axisLine={{ stroke: '#d6dee5' }}
            label={{ value: 'Поколение', position: 'insideBottom', offset: -7, fontSize: 12, fill: '#8290a0' }} />
          <YAxis domain={[0, METRICS[metric].maximum]} tickCount={6} tickFormatter={display}
            tick={{ fontSize: 12, fill: '#8290a0' }} tickLine={false} axisLine={false} width={64}
            label={{ value: METRICS[metric].axis, angle: -90, position: 'insideLeft', offset: 10,
              textAnchor: 'middle', fontSize: 12, fill: '#607184' }} />
          <Tooltip labelFormatter={(label) => `Поколение ${label}`} filterNull
            formatter={(value) => typeof value === 'number' ? display(value) : String(value)} />
          {visible.map(({ id }) => {
            const style = SERIES_STYLES[id - 1];
            return <Line key={id} dataKey={`s${id}`} name={scenarioName(id)} stroke={style.color} strokeDasharray={style.dash}
              strokeWidth={2.5} dot={false} connectNulls={false} isAnimationActive={false} />;
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
    <div className="legend">
      {visible.map(({ id }) => {
        const style = SERIES_STYLES[id - 1];
        return <span key={id}><i style={style.dash ? { borderTop: `2px dashed ${style.color}` } : { background: style.color }} />
          {scenarioName(id)}</span>;
      })}
    </div>
  </>;
}

export default function ComparisonScreen({ scenarios, metric, onMetric, onToggle, onRemove, onReturn }: {
  scenarios: SavedScenario[];
  metric: ComparisonMetric;
  onMetric: (metric: ComparisonMetric) => void;
  onToggle: (id: number, visible: boolean) => void;
  onRemove: (id: number) => void;
  onReturn: () => void;
}) {
  return <main className="workspace">
    <aside className="panel parameters-panel" aria-label="Сохраненные сценарии">
      <div className="panel-heading">
        <span className="eyebrow">Сохраненные сценарии</span>
        <span className="scenario-count">{scenarios.length} / {MAX_SCENARIOS}</span>
      </div>
      {scenarios.length ? <ul className="scenario-list">
        {scenarios.map(({ id, result, visible }) => {
          const [population, factors] = describeParameters(result.params);
          return <li className="scenario-card" key={id}>
            <Checkbox size="small" checked={visible} onChange={(_, checked) => onToggle(id, checked)}
              slotProps={{ input: { 'aria-label': `Показать сценарий ${id}` } }} />
            <div className="scenario-details">
              <strong><span className="scenario-color" style={{ backgroundColor: SERIES_STYLES[id - 1].color }} />{scenarioName(id)}</strong>
              <small>{population}</small>
              <small>{factors}</small>
            </div>
            <Button className="scenario-remove" color="inherit" aria-label={`Удалить сценарий ${id}`}
              onClick={() => onRemove(id)}>×</Button>
          </li>;
        })}
      </ul> : <p className="scenario-list-hint">Сохраните результаты одиночных расчетов кнопкой «В сравнение».</p>}
      <Button className="scenario-return" variant="outlined" onClick={onReturn}>К моделированию</Button>
    </aside>
    <section className="panel results-panel" aria-label="Сравнение результатов">
      <div className="results-header"><h1>Сравнение сценариев</h1></div>
      {scenarios.length ? <div className="result-content">
        <div className="result-tabs" role="tablist" aria-label="Показатель сравнения">
          {(Object.entries(METRICS) as [ComparisonMetric, typeof METRICS[ComparisonMetric]][]).map(([id, item]) =>
            <button type="button" role="tab" key={id} aria-selected={metric === id}
              className={metric === id ? 'selected' : undefined} onClick={() => onMetric(id)}>{item.label}</button>)}
        </div>
        <ComparisonChart scenarios={scenarios} metric={metric} />
        <TableContainer className="table-wrap comparison-table">
          <Table size="small" aria-label="Сводная таблица сценариев">
            <TableHead><TableRow>
              <TableCell>Сценарий</TableCell><TableCell>Параметры</TableCell><TableCell align="right">p(T)</TableCell>
              <TableCell align="right">H(T)</TableCell><TableCell align="right">aa(T)</TableCell>
              <TableCell align="right">Первое превышение порога χ²</TableCell>
            </TableRow></TableHead>
            <TableBody>{scenarios.map(({ id, result }) => {
              const last = result.rows.at(-1)!;
              const exceedance = result.chi_square_summary?.first_exceedance_generation;
              return <TableRow key={id}>
                <TableCell component="th" scope="row">{scenarioName(id)}</TableCell>
                <TableCell className="comparison-parameters">{describeParameters(result.params).join(' · ')}</TableCell>
                <TableCell align="right">{display(last.p)}</TableCell>
                <TableCell align="right">{display(last.h)}</TableCell>
                <TableCell align="right">{display(last.f_aa)}</TableCell>
                <TableCell align="right">{exceedance === undefined ? '—' : integer.format(exceedance)}</TableCell>
              </TableRow>;
            })}</TableBody>
          </Table>
        </TableContainer>
        <p className="chart-caption">В таблице показаны значения в последнем поколении каждого сценария.</p>
      </div> : <div className="empty-state">
        <h2>Пока нет сценариев</h2>
        <p>Сохраненные результаты появятся здесь на общем графике.</p>
      </div>}
    </section>
  </main>;
}
