import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Checkbox, CircularProgress, FormControlLabel, TextField } from '@mui/material';
import {
  Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis,
} from 'recharts';
import ResultsExport from './ResultsExport';
import { describeFactors, display, generationTicks, integer, oneDecimal, ParamLabel, parseDecimal, parseSeed, SEED_ERROR } from './simulationUi';
import type { AdditionalFactors, BatchBoundary, BatchSimulationParams, BatchSimulationResult, SimulationParams } from './types';

const MIN_RUNS = 10;
const MAX_RUNS = 1_000;
const DEFAULTS = { n: '50', generations: '100', p0: '0,5', runs: '200', seed: '7' };
const FIELDS = {
  n: { label: 'Численность N', info: 'Количество диплоидных особей в популяции.' },
  generations: { label: 'Поколений T', info: 'Количество поколений после начального.' },
  p0: { label: 'Частота p (A)', info: 'Начальная доля аллеля A.' },
  runs: { label: 'Число прогонов', info: 'Количество независимых симуляций с одинаковыми параметрами.' },
  seed: { label: 'Зерно генератора', info: 'Одинаковое зерно воспроизводит всю серию. Пустое поле позволяет серверу выбрать зерно.' },
};
const FREQUENCY = '#2161eb';
const CORRIDOR = '#7da4fa';
const TRAJECTORY = '#507dd2';
const HETEROZYGOSITY = '#0d8c82';
const THEORY = '#536b88';
const percent = new Intl.NumberFormat('ru-RU', { style: 'percent', maximumFractionDigits: 2 });
const inputFrequency = new Intl.NumberFormat('ru-RU', { useGrouping: false, maximumSignificantDigits: 17 });
const TABS = [
  { id: 'frequency', label: 'Частота p: среднее и разброс' },
  { id: 'heterozygosity', label: 'Гетерозиготность' },
] as const;

type BatchFields = typeof DEFAULTS;
type Field = keyof BatchFields;
type BatchTab = typeof TABS[number]['id'];

function validate(fields: BatchFields, factors: AdditionalFactors | null) {
  const errors: Partial<Record<Field, string>> = {};
  const n = parseDecimal(fields.n);
  const generations = parseDecimal(fields.generations);
  const p0 = parseDecimal(fields.p0);
  const runs = parseDecimal(fields.runs);
  const seed = parseSeed(fields.seed);
  if (!Number.isInteger(n) || n < 2 || n > 100_000) errors.n = 'Введите целое число от 2 до 100 000';
  if (!Number.isInteger(generations) || generations < 1 || generations > 1_000) {
    errors.generations = 'Введите целое число от 1 до 1 000';
  }
  if (!Number.isFinite(p0) || p0 < 0 || p0 > 1) errors.p0 = 'Введите число от 0 до 1';
  if (!Number.isInteger(runs) || runs < MIN_RUNS || runs > MAX_RUNS) errors.runs = 'Введите целое число от 10 до 1 000';
  if (Number.isNaN(seed)) errors.seed = SEED_ERROR;
  const params: BatchSimulationParams | undefined = factors === null || Object.keys(errors).length > 0
    ? undefined
    : { n, generations, p0, runs, ...factors, drift: seed === undefined ? {} : { seed } };
  return { errors, params };
}

function BoundaryMetric({ label, stats, runs }: { label: string; stats: BatchBoundary; runs: number }) {
  return <div>
    <span>{label}</span>
    <strong>{percent.format(stats.share)}</strong>
    <small>
      {integer.format(stats.count)} из {integer.format(runs)} прогонов
      {stats.mean_generation !== undefined && <> · среднее поколение {oneDecimal.format(stats.mean_generation)}</>}
    </small>
  </div>;
}

function BatchChart({ result, tab }: { result: BatchSimulationResult; tab: BatchTab }) {
  const data = useMemo(() => result.rows.map((row, index) => ({
    ...row,
    corridor: [row.p05, row.p95],
    examples: result.trajectories.map((trajectory) => trajectory[index]),
  })), [result]);
  const examples = result.trajectories.length;
  const hasTheory = result.rows[0]?.h_theory !== undefined;
  const hasInbreeding = result.rows[0]?.f_Aa_mean !== undefined;
  const frequency = tab === 'frequency';
  const meanLabel = `Средняя p по ${integer.format(result.params.runs)} прогонам`;
  const corridorLabel = '5–95-й процентили';

  return <>
    <div className="chart-wrap" aria-label={frequency ? 'Разброс частоты по поколениям' : 'Гетерозиготность по поколениям'}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <ComposedChart data={data} margin={{ top: 12, right: 18, bottom: 14, left: 0 }}>
          <CartesianGrid stroke="#e7ebef" vertical={false} />
          <XAxis dataKey="t" ticks={generationTicks(result.params.generations)} interval={0}
            tick={{ fontSize: 12, fill: '#8290a0' }} tickLine={false} axisLine={{ stroke: '#d6dee5' }}
            label={{ value: 'Поколение', position: 'insideBottom', offset: -7, fontSize: 12, fill: '#8290a0' }} />
          <YAxis domain={[0, frequency ? 1 : 0.5]} tickCount={6} tickFormatter={display}
            tick={{ fontSize: 12, fill: '#8290a0' }} tickLine={false} axisLine={false} width={64}
            label={{ value: frequency ? 'Частота аллеля A' : 'Гетерозиготность', angle: -90, position: 'insideLeft',
              offset: 10, textAnchor: 'middle', fontSize: 12, fill: '#607184' }} />
          <ChartTooltip labelFormatter={(label) => `Поколение ${label}`}
            formatter={(value) => Array.isArray(value)
              ? value.map((bound) => display(Number(bound))).join(' – ')
              : typeof value === 'number' ? display(value) : String(value)} />
          {frequency ? <>
            <Area dataKey="corridor" name={corridorLabel} stroke={CORRIDOR} strokeWidth={1}
              fill={CORRIDOR} fillOpacity={0.23} activeDot={false} isAnimationActive={false} />
            {result.trajectories.map((_, index) => <Line key={index} dataKey={`examples[${index}]`}
              stroke={TRAJECTORY} strokeOpacity={0.34} strokeWidth={1} tooltipType="none"
              dot={false} activeDot={false} isAnimationActive={false} />)}
            <Line dataKey="p_mean" name={meanLabel} stroke={FREQUENCY} strokeWidth={2.5} dot={false} isAnimationActive={false} />
          </> : <>
            <Line dataKey="h_mean" name="Средняя H = 2pq" stroke={HETEROZYGOSITY} strokeWidth={2.5} dot={false} isAnimationActive={false} />
            {hasTheory && <Line dataKey="h_theory" name="Средняя H по теории" stroke={THEORY} strokeDasharray="5 4"
              strokeWidth={2} dot={false} isAnimationActive={false} />}
            {hasInbreeding && <Line dataKey="f_Aa_mean" name="Средняя доля Aa при заданном F" stroke={FREQUENCY}
              strokeWidth={2} dot={false} isAnimationActive={false} />}
          </>}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
    <div className="legend">{frequency ? <>
      <span><i style={{ background: FREQUENCY }} />{meanLabel}</span>
      <span><i className="range-key" />{corridorLabel}</span>
      {examples > 0 && <span><i style={{ background: TRAJECTORY, opacity: 0.5 }} />Отдельные прогоны ({examples})</span>}
    </> : <>
      <span><i style={{ background: HETEROZYGOSITY }} />Средняя H = 2pq</span>
      {hasTheory && <span><i style={{ borderTop: `2px dashed ${THEORY}` }} />Средняя H по теории</span>}
      {hasInbreeding && <span><i style={{ background: FREQUENCY }} />Средняя доля Aa при заданном F</span>}
    </>}</div>
    <p className="chart-caption">{frequency
      ? 'Наведите курсор на график, чтобы увидеть среднюю частоту и границы диапазона для выбранного поколения.'
      : hasTheory
        ? 'Пунктир показывает ожидаемую среднюю гетерозиготность при нейтральном дрейфе.'
        : 'Теоретическая кривая доступна для дрейфа без дополнительных факторов.'}</p>
  </>;
}

export default function BatchScreen({ active, initialParams, availableFactors, onServerState }: {
  active: boolean;
  initialParams?: SimulationParams;
  availableFactors: AdditionalFactors | null;
  onServerState: (online: boolean) => void;
}) {
  const [fields, setFields] = useState<BatchFields>(() => initialParams ? {
    ...DEFAULTS,
    n: String(initialParams.n),
    p0: inputFrequency.format(initialParams.p0),
    generations: String(initialParams.generations),
    seed: initialParams.drift?.seed === undefined ? DEFAULTS.seed : String(initialParams.drift.seed),
  } : DEFAULTS);
  const [useFactors, setUseFactors] = useState(() => initialParams ? describeFactors(initialParams).length > 0 : false);
  const [attempted, setAttempted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [requestError, setRequestError] = useState('');
  const [outcome, setOutcome] = useState<{ result: BatchSimulationResult; requestKey: string } | null>(null);
  const [tab, setTab] = useState<BatchTab>('frequency');
  const running = useRef<AbortController | null>(null);
  useEffect(() => () => running.current?.abort(), []);
  const { errors, params } = validate(fields, useFactors ? availableFactors : {});
  const factorList = availableFactors && describeFactors(availableFactors);
  const result = outcome?.result;
  const last = result?.rows.at(-1);
  const isStale = outcome && JSON.stringify(params) !== outcome.requestKey;

  async function run() {
    setAttempted(true);
    setRequestError('');
    if (!params || running.current) return;
    const controller = new AbortController();
    running.current = controller;
    setLoading(true);
    try {
      const response = await fetch('/api/simulate/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(45_000)]),
      });
      if (response.status === 422) {
        const data = await response.json().catch(() => null);
        throw new Error(typeof data?.detail === 'string'
          ? data.detail : 'Сервер отклонил параметры. Проверьте значения полей.');
      }
      if (response.status === 429) throw new Error('Сервер занят другими расчетами. Повторите попытку через несколько секунд.');
      if (response.status === 504) throw new Error('Серия не уложилась в лимит времени. Уменьшите число прогонов или поколений и повторите расчет.');
      if (!response.ok) throw new Error('Не удалось выполнить серию прогонов. Попробуйте еще раз.');
      const result: BatchSimulationResult = await response.json();
      if (controller.signal.aborted) return;
      const seed = result.params.drift.seed;
      if (params.drift.seed === undefined) {
        setFields((previous) => previous.seed.trim() === '' ? { ...previous, seed: String(seed) } : previous);
      }
      setOutcome({ result, requestKey: JSON.stringify({ ...params, drift: { seed } }) });
      onServerState(true);
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof TypeError || (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError'))) {
        onServerState(false);
        setRequestError('Сервер недоступен или не ответил вовремя. Проверьте его запуск и повторите расчет.');
      } else {
        setRequestError(error instanceof Error ? error.message : 'Не удалось выполнить серию прогонов.');
      }
    } finally {
      running.current = null;
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  if (!active) return null;

  return <main className="workspace">
    <form className="panel parameters-panel" aria-label="Параметры серии"
      onSubmit={(event) => { event.preventDefault(); void run(); }}>
      <div className="panel-heading"><span className="eyebrow">Параметры серии</span></div>
      <div className="fields-grid">
        {(Object.keys(FIELDS) as Field[]).map((field) => {
          const { label, info } = FIELDS[field];
          return <label key={field} className={field === 'seed' ? 'batch-seed-field' : undefined}>
            <ParamLabel label={label} info={info} />
            <TextField fullWidth value={fields[field]} onChange={(event) => {
              const value = event.target.value;
              setFields((previous) => ({ ...previous, [field]: value }));
            }}
              error={attempted && Boolean(errors[field])} helperText={attempted ? errors[field] : undefined}
              slotProps={{ htmlInput: { inputMode: field === 'p0' ? 'decimal' : 'numeric', 'aria-label': label } }} />
          </label>;
        })}
      </div>
      <FormControlLabel className="batch-factor-option" control={<Checkbox size="small" checked={useFactors}
        onChange={(_, checked) => setUseFactors(checked)} />}
        label="Учесть миграцию, отбор и инбридинг из раздела «Моделирование»" />
      {useFactors && <p className="batch-note">{factorList?.length
        ? factorList.join(' · ')
        : factorList === null ? 'Проверьте параметры включенных факторов в разделе «Моделирование».'
          : 'В разделе «Моделирование» дополнительные факторы выключены.'}</p>}
      <div className="actions">
        <Button type="submit" variant="contained" disabled={loading}
          startIcon={loading ? <CircularProgress size={15} color="inherit" /> : <span className="play-icon">▶</span>}>
          {loading ? 'Расчет…' : 'Запустить прогоны'}
        </Button>
      </div>
      <p className="batch-note">Генетический дрейф включен во всех прогонах.</p>
    </form>
    <section className="panel results-panel" aria-label="Результаты серии">
      <div className="results-header">
        <h1>Результат прогонов</h1>
        {result && <ResultsExport result={result} disabled={loading} />}
      </div>
      {requestError && <div className="alert-space"><Alert severity="error"
        action={<Button color="inherit" size="small" onClick={run} disabled={loading}>Повторить</Button>}>{requestError}</Alert></div>}
      {!result && <div className="empty-state" role={loading ? 'status' : undefined}>
        {loading && <CircularProgress size={36} />}
        <h2>{loading ? 'Выполняем серию прогонов' : 'Здесь появятся результаты серии'}</h2>
        {!loading && <p>Задайте число прогонов и запустите расчет, чтобы увидеть среднюю траекторию и разброс частоты аллеля.</p>}
      </div>}
      {result && last && <>
        {isStale && <div className="stale-notice">Параметры изменены. Запустите новую серию, чтобы обновить результаты.</div>}
        {loading && <div className="stale-notice" role="status">Выполняем новую серию. Пока показаны предыдущие результаты.</div>}
        <div className="metrics">
          <div><span>Средняя p в поколении {integer.format(last.t)}</span><strong>{display(last.p_mean)}</strong>
            <small>5–95-й процентили · {display(last.p05)} – {display(last.p95)}</small></div>
          <BoundaryMetric label="Фиксация аллеля A" stats={result.fixation} runs={result.params.runs} />
          <BoundaryMetric label="Потеря аллеля A" stats={result.loss} runs={result.params.runs} />
          <div><span>Средняя H в поколении {integer.format(last.t)}</span><strong>{display(last.h_mean)}</strong>
            <small>{last.h_theory !== undefined ? `по теории · ${display(last.h_theory)}` : 'ожидаемая гетерозиготность 2pq'}</small></div>
        </div>
        <div className="result-content">
          <div className="result-tabs" role="tablist" aria-label="Данные серии">
            {TABS.map((item) => <button key={item.id} role="tab" type="button" aria-selected={tab === item.id}
              className={tab === item.id ? 'selected' : undefined} onClick={() => setTab(item.id)}>{item.label}</button>)}
          </div>
          <BatchChart result={result} tab={tab} />
          {result.params.migration && <p className="chart-caption">
            Доли учитывают первую фиксацию или потерю в каждом прогоне. Миграция может восстановить утраченный аллель.
          </p>}
          <div className="parameters-summary">
            <strong>Параметры серии</strong> · N = {integer.format(result.params.n)} · p₀ = {display(result.params.p0)}
            {' · '}T = {integer.format(result.params.generations)} · прогонов {integer.format(result.params.runs)}
            {' · '}зерно {result.params.drift.seed}
            {describeFactors(result.params).map((factor) => ` · ${factor}`)}
          </div>
        </div>
      </>}
    </section>
  </main>;
}
