import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { display, generationTicks, integer } from './simulationUi';
import type { SimulationResult } from './types';

const SERIES_COLOR = '#2161eb';
const THRESHOLD_COLOR = '#a35422';
const preciseNumber = new Intl.NumberFormat('ru-RU', { maximumSignificantDigits: 17 });

export function displayChiSquare(value: number, threshold?: number): string {
  const rounded = display(value);
  return threshold !== undefined && value !== threshold && rounded === display(threshold)
    ? preciseNumber.format(value)
    : rounded;
}

export default function ChiSquareResults({ result }: { result: SimulationResult }) {
  const { rows, chi_square_summary: summary } = result;
  if (!summary) return <p className="chi-square-summary">Для этого результата данные χ² недоступны.</p>;

  const threshold = summary.critical_value;
  const defined = rows.filter((row) => row.chi_square != null);
  const first = defined.find((row) => row.t === summary.first_exceedance_generation);
  const end = rows.at(-1)?.t ?? 0;
  const peak = Math.max(threshold, ...defined.map((row) => row.chi_square ?? 0));
  const scale = 10 ** Math.floor(Math.log10(peak));
  const ceiling = Math.ceil(peak * 1.1 / scale) * scale;
  const thresholdLabel = `Порог χ² = ${display(threshold)}`;

  return <>
    <div className={first ? 'chi-square-summary chi-square-summary-exceeded' : 'chi-square-summary'}>
      <strong>{first ? `Первое превышение в поколении ${integer.format(first.t)}`
        : defined.length ? 'Порог не превышен' : 'χ² не определяется в этом расчете'}</strong>
      <span>
        {first?.chi_square != null && <>χ² = {displayChiSquare(first.chi_square, threshold)} · </>}
        порог {display(threshold)} · df = {integer.format(summary.degrees_of_freedom)}
      </span>
    </div>
    {defined.length > 0 && <>
      <div className="chart-wrap" aria-label="Критерий χ² по поколениям">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <LineChart data={rows} margin={{ top: 12, right: 18, bottom: 14, left: 0 }}>
            <CartesianGrid stroke="#e7ebef" vertical={false} />
            <XAxis dataKey="t" type="number" domain={[0, end]} ticks={generationTicks(end)} interval={0}
              tick={{ fontSize: 12, fill: '#8290a0' }} tickLine={false} axisLine={{ stroke: '#d6dee5' }}
              label={{ value: 'Поколение', position: 'insideBottom', offset: -7, fontSize: 12, fill: '#8290a0' }} />
            <YAxis domain={[0, ceiling]} tickCount={5} tickFormatter={display} width={65}
              tick={{ fontSize: 12, fill: '#8290a0' }} tickLine={false} axisLine={false}
              label={{ value: 'χ²', angle: -90, position: 'insideLeft', offset: 10,
                textAnchor: 'middle', fontSize: 12, fill: '#607184' }} />
            <Tooltip labelFormatter={(label) => `Поколение ${label}`}
              formatter={(value) => typeof value === 'number' ? displayChiSquare(value, threshold) : String(value)} />
            <ReferenceLine y={threshold} stroke={THRESHOLD_COLOR} strokeDasharray="5 4"
              label={{ value: thresholdLabel, position: 'insideBottomRight', fill: THRESHOLD_COLOR, fontSize: 11 }} />
            <Line dataKey="chi_square" name="χ²" stroke={SERIES_COLOR} strokeWidth={2.5}
              connectNulls={false} isAnimationActive={false}
              dot={({ cx, cy, index }) => {
                const row = rows[index];
                if (cx == null || cy == null || row?.chi_square == null) return null;
                const isFirst = row.t === first?.t;
                const isolated = rows[index - 1]?.chi_square == null && rows[index + 1]?.chi_square == null;
                if (!isFirst && !isolated) return null;
                return <circle cx={cx} cy={cy} r={isFirst ? 5 : 3} fill={isFirst ? THRESHOLD_COLOR : SERIES_COLOR}
                  stroke="white" strokeWidth={1.5} className={isFirst ? 'chi-square-first-point' : undefined} />;
              }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="legend">
        <span><i style={{ background: SERIES_COLOR }} />Критерий χ²</span>
        <span><i style={{ borderTop: `2px dashed ${THRESHOLD_COLOR}` }} />Порог</span>
        {first && <span><i className="chi-square-marker" style={{ background: THRESHOLD_COLOR }} />Первое превышение</span>}
      </div>
    </>}
    <p className="chart-caption">
      χ² сравнивает расчетные численности генотипов с равновесными. При частоте p = 0 или p = 1 показатель не определяется.
    </p>
  </>;
}
