import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, Switch, Table, TableBody, TableCell, TableContainer, TableHead,
  TablePagination, TableRow, TextField,
} from '@mui/material';
import {
  CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip as ChartTooltip,
  XAxis, YAxis,
} from 'recharts';
import BatchScreen from './BatchScreen';
import { describeFactors, display, generationTicks, Info, integer, oneDecimal, ParamLabel, parseDecimal, parseSeed, SEED_ERROR } from './simulationUi';
import type { AdditionalFactors, GenerationRow, SimulationParams, SimulationResult } from './types';

type InputField = 'n' | 'p0' | 'generations' | 'm' | 'p_m' | 'w11' | 'w12' | 'w22' | 'target_p' | 'f' | 'seed';
type Inputs = Record<InputField, string> & {
  migrationEnabled: boolean;
  selectionEnabled: boolean;
  inbreedingEnabled: boolean;
  driftEnabled: boolean;
};
type FieldErrors = Partial<Record<InputField, string>>;
type TabName = 'alleles' | 'genotypes' | 'heterozygosity' | 'table';
type ChartTab = Exclude<TabName, 'table'>;

const INITIAL: Inputs = {
  n: '500', p0: '0,5', generations: '100',
  migrationEnabled: false, m: '0,1', p_m: '0,8',
  selectionEnabled: false, w11: '1', w12: '1', w22: '0,8', target_p: '0,9',
  inbreedingEnabled: false, f: '0,25',
  driftEnabled: false, seed: '42',
};
const FITNESS_FIELDS = [['w11', 'w₁₁', 'AA'], ['w12', 'w₁₂', 'Aa'], ['w22', 'w₂₂', 'aa']] as const;
const TABS: { id: TabName; label: string }[] = [
  { id: 'alleles', label: 'Частоты аллелей' },
  { id: 'genotypes', label: 'Генотипы' },
  { id: 'heterozygosity', label: 'Гетерозиготность' },
  { id: 'table', label: 'Таблица' },
];
const Y_AXIS_LABELS: Record<ChartTab, string> = {
  alleles: 'Частота аллеля',
  genotypes: 'Доля генотипа',
  heterozygosity: 'Гетерозиготность',
};
function validate(inputs: Inputs): { params?: SimulationParams; errors: FieldErrors; factors: AdditionalFactors | null } {
  const errors: FieldErrors = {};
  function readUnit(field: InputField) {
    const value = parseDecimal(inputs[field]);
    if (!Number.isFinite(value) || value < 0 || value > 1) errors[field] = 'Введите число от 0 до 1';
    return value;
  }
  const factors: AdditionalFactors = {};
  if (inputs.migrationEnabled) {
    factors.migration = { m: readUnit('m'), p_m: readUnit('p_m') };
  }
  if (inputs.selectionEnabled) {
    factors.selection = {
      w11: readUnit('w11'), w12: readUnit('w12'), w22: readUnit('w22'), target_p: readUnit('target_p'),
    };
  }
  if (inputs.inbreedingEnabled) {
    factors.inbreeding = { f: readUnit('f') };
  }
  const validFactors = Object.keys(errors).length ? null : factors;
  const n = parseDecimal(inputs.n);
  const p0 = readUnit('p0');
  const generations = parseDecimal(inputs.generations);
  if (!Number.isInteger(n) || n < 2 || n > 100_000) errors.n = 'Введите целое число от 2 до 100 000';
  if (!Number.isInteger(generations) || generations < 1 || generations > 1_000) {
    errors.generations = 'Введите целое число от 1 до 1 000';
  }
  const params: SimulationParams = { n, p0, generations, ...factors };
  if (inputs.driftEnabled) {
    const seed = parseSeed(inputs.seed);
    if (Number.isNaN(seed)) errors.seed = SEED_ERROR;
    params.drift = seed === undefined ? {} : { seed };
  }
  return { errors, factors: validFactors, params: Object.keys(errors).length ? undefined : params };
}

function FactorCard({ name, symbols, enabled, onToggle, children }: {
  name: string; symbols: string; enabled: boolean; onToggle: (checked: boolean) => void; children: ReactNode;
}) {
  return <div className={enabled ? 'factor-card factor-card-active' : 'factor-card'}>
    <label className="factor factor-toggle">
      <Switch checked={enabled} size="small" onChange={(_, checked) => onToggle(checked)}
        slotProps={{ input: { role: 'switch', 'aria-label': name } }} />
      <span>{name}</span><small>{symbols}</small>
    </label>
    {enabled && children}
  </div>;
}

function ResultsChart({ rows, tab, targetP, targetGeneration, showInbreeding, showDrift }: {
  rows: GenerationRow[]; tab: ChartTab;
  targetP?: number; targetGeneration?: number; showInbreeding: boolean; showDrift: boolean;
}) {
  const lastGeneration = rows.at(-1)?.t ?? 0;
  const homozygotesOverlap = tab === 'genotypes' && rows.length > 0 && rows.every((row) => row.f_AA === row.f_aa);
  const series: { key: keyof GenerationRow; name: string; color: string; dash?: string }[] = tab === 'alleles'
    ? [{ key: 'p', name: 'p (A)', color: '#2161eb' }, { key: 'q', name: 'q (a)', color: '#e57925' }]
    : tab === 'genotypes'
      ? [{ key: 'f_AA', name: 'AA', color: '#2161eb' }, { key: 'f_Aa', name: 'Aa', color: '#0d8c82' },
        { key: 'f_aa', name: 'aa', color: homozygotesOverlap ? '#2161eb' : '#e57925' }]
      : showInbreeding
        ? [{ key: 'h', name: 'Ожидаемая H = 2pq', color: '#536b88', dash: '5 4' },
          { key: 'f_Aa', name: 'Доля Aa при заданном F', color: '#0d8c82' }]
        : [{ key: 'h', name: showDrift ? 'H = 2pq в одном прогоне' : 'H = 2pq', color: '#0d8c82' }];
  if (tab === 'heterozygosity' && rows[0]?.h_theory !== undefined) {
    series.push({ key: 'h_theory', name: 'Средняя H по теории', color: '#536b88', dash: '5 4' });
  }
  const legendSeries = homozygotesOverlap ? series.filter((line) => line.key !== 'f_aa') : series;
  return <>
    <div className="chart-wrap" aria-label="График по поколениям">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <LineChart data={rows} margin={{ top: 12, right: 18, bottom: 14, left: 0 }}>
          <CartesianGrid stroke="#e7ebef" vertical={false} />
          <XAxis dataKey="t" ticks={generationTicks(lastGeneration)} interval={0} tick={{ fontSize: 12, fill: '#8290a0' }}
            tickLine={false} axisLine={{ stroke: '#d6dee5' }}
            label={{ value: 'Поколение', position: 'insideBottom', offset: -7, fontSize: 12, fill: '#8290a0' }} />
          <YAxis domain={[0, 1]} tickCount={6} tickFormatter={display} tick={{ fontSize: 12, fill: '#8290a0' }}
            tickLine={false} axisLine={false} width={64}
            label={{ value: Y_AXIS_LABELS[tab], angle: -90, position: 'insideLeft', offset: 10, textAnchor: 'middle', fontSize: 12, fill: '#607184' }} />
          <ChartTooltip includeHidden={homozygotesOverlap}
            formatter={(value) => typeof value === 'number' ? display(value) : String(value)} labelFormatter={(label) => `Поколение ${label}`} />
          {series.map((line) => <Line key={line.key} type="linear" dataKey={line.key} name={line.name}
            hide={homozygotesOverlap && line.key === 'f_aa'} stroke={line.color} strokeDasharray={line.dash}
            strokeWidth={2.5} dot={false} isAnimationActive={false} />)}
          {tab === 'alleles' && targetP !== undefined && <ReferenceLine y={targetP}
            stroke="#718297" strokeDasharray="5 4"
            label={{ value: `p* = ${display(targetP)}`, position: targetP < 0.95 ? 'insideBottomRight' : 'insideTopRight', fill: '#607184', fontSize: 11 }} />}
          {tab === 'alleles' && targetGeneration !== undefined && <ReferenceLine x={targetGeneration}
            stroke="#718297" strokeDasharray="5 4"
            label={{ value: `t = ${targetGeneration}`, position: targetGeneration > rows.length / 2 ? 'insideTopLeft' : 'insideTopRight', fill: '#607184', fontSize: 11 }} />}
        </LineChart>
      </ResponsiveContainer>
    </div>
    <div className="chart-caption">Частоты по поколениям. Наведите курсор на график, чтобы увидеть значения.</div>
    <div className="legend">{legendSeries.map((line) => <span key={line.key}>
      <i style={line.dash ? { borderTop: `2px dashed ${line.color}` } : { backgroundColor: line.color }} />
      {homozygotesOverlap && line.key === 'f_AA' ? 'AA = aa' : line.name}
    </span>)}</div>
  </>;
}

function ResultsTable({ rows }: { rows: GenerationRow[] }) {
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(10);
  const safePage = Math.min(page, Math.max(0, Math.ceil(rows.length / perPage) - 1));
  return <>
    <TableContainer className="table-wrap">
      <Table size="small" aria-label="Результаты по поколениям">
        <TableHead><TableRow>{['Поколение', 'p (A)', 'q (a)', 'AA', 'Aa', 'aa', 'H = 2pq'].map((label) => <TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead>
        <TableBody>{rows.slice(safePage * perPage, safePage * perPage + perPage).map((row) => <TableRow key={row.t}>
          <TableCell>{row.t}</TableCell><TableCell>{display(row.p)}</TableCell><TableCell>{display(row.q)}</TableCell>
          <TableCell>{display(row.f_AA)}</TableCell><TableCell>{display(row.f_Aa)}</TableCell><TableCell>{display(row.f_aa)}</TableCell><TableCell>{display(row.h)}</TableCell>
        </TableRow>)}</TableBody>
      </Table>
    </TableContainer>
    <TablePagination component="div" count={rows.length} page={safePage} onPageChange={(_, n) => setPage(n)} rowsPerPage={perPage} onRowsPerPageChange={(event) => { setPerPage(Number(event.target.value)); setPage(0); }} rowsPerPageOptions={[10, 25, 50]} labelRowsPerPage="Строк на странице:" labelDisplayedRows={({ from, to, count }) => `${from}–${to} из ${count}`} />
  </>;
}

export default function App() {
  const [screen, setScreen] = useState<'single' | 'batch'>('single');
  const [batchStart, setBatchStart] = useState<{ revision: number; params?: SimulationParams }>({ revision: 0 });
  const [inputs, setInputs] = useState<Inputs>(INITIAL);
  const [attempted, setAttempted] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [tab, setTab] = useState<TabName>('alleles');
  const [loading, setLoading] = useState(false);
  const [server, setServer] = useState<'checking' | 'online' | 'offline'>('checking');
  const [requestError, setRequestError] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const validation = useMemo(() => validate(inputs), [inputs]);
  const currentParams = validation.params;
  const resultParams = result?.params;
  const migration = resultParams?.migration;
  const selection = resultParams?.selection;
  const inbreeding = resultParams?.inbreeding;
  const drift = resultParams?.drift;
  const driftBoundary = result?.drift_summary?.boundary;
  const halfLife = result?.drift_summary?.theoretical_half_life;
  const q = Number.isFinite(parseDecimal(inputs.p0)) && parseDecimal(inputs.p0) >= 0 && parseDecimal(inputs.p0) <= 1 ? display(1 - parseDecimal(inputs.p0)) : '—';
  const resultIsStale = resultParams && (
    resultParams.n !== currentParams?.n || resultParams.p0 !== currentParams?.p0 ||
    resultParams.generations !== currentParams?.generations ||
    migration?.m !== currentParams?.migration?.m || migration?.p_m !== currentParams?.migration?.p_m ||
    selection?.target_p !== currentParams?.selection?.target_p ||
    FITNESS_FIELDS.some(([field]) => selection?.[field] !== currentParams?.selection?.[field]) ||
    inbreeding?.f !== currentParams?.inbreeding?.f ||
    Boolean(drift) !== Boolean(currentParams?.drift) || drift?.seed !== currentParams?.drift?.seed
  );
  const selectedFactors = [
    inputs.migrationEnabled && 'Миграция', inputs.selectionEnabled && 'Отбор', inputs.inbreedingEnabled && 'Инбридинг',
    inputs.driftEnabled && 'Дрейф',
  ].filter(Boolean);
  const resultFactors = [migration && 'Миграция', selection && 'Отбор', inbreeding && 'Инбридинг', drift && 'Дрейф'].filter(Boolean);
  const shownFactors = result ? resultFactors : selectedFactors;
  const mode = shownFactors.length === 4 ? '4 фактора' : shownFactors.join(' + ') || 'Идеальная популяция';

  useEffect(() => {
    const controller = new AbortController();
    fetch('/health', { signal: controller.signal }).then((response) => setServer(response.ok ? 'online' : 'offline')).catch(() => { if (!controller.signal.aborted) setServer('offline'); });
    return () => controller.abort();
  }, []);

  function update(field: InputField, value: string) { setInputs((previous) => ({ ...previous, [field]: value })); }

  function factorField(field: InputField, label: string, info: string) {
    return <label key={field}>
      <ParamLabel label={label} info={info} />
      <TextField value={inputs[field]} onChange={(e) => update(field, e.target.value)}
        error={attempted && !!validation.errors[field]} helperText={attempted ? validation.errors[field] : undefined}
        slotProps={{ htmlInput: { inputMode: field === 'seed' ? 'numeric' : 'decimal', 'aria-label': label } }} />
    </label>;
  }

  async function run() {
    setAttempted(true);
    setRequestError('');
    if (!validation.params || loading) return;
    const params = validation.params;
    setLoading(true);
    try {
      const response = await fetch('/api/simulate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params), signal: AbortSignal.timeout(15_000) });
      if (response.status === 422) {
        const data = await response.json().catch(() => null);
        throw new Error(typeof data?.detail === 'string'
          ? data.detail : 'Сервер отклонил параметры. Проверьте значения полей.');
      }
      if (!response.ok) throw new Error('Не удалось выполнить расчет. Попробуйте еще раз.');
      const data: SimulationResult = await response.json();
      const effectiveSeed = data.params.drift?.seed;
      if (params.drift && params.drift.seed === undefined && effectiveSeed !== undefined) {
        setInputs((previous) => previous.driftEnabled && previous.seed.trim() === ''
          ? { ...previous, seed: String(effectiveSeed) } : previous);
      }
      setResult(data);
      setServer('online');
      if (params.drift && !params.selection) {
        setTab('heterozygosity');
      } else {
        setTab(params.inbreeding && !params.migration && !params.selection ? 'genotypes' : 'alleles');
      }
    } catch (error) {
      if (error instanceof TypeError || (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError'))) {
        setServer('offline');
        setRequestError('Сервер недоступен или не ответил вовремя. Проверьте его запуск и повторите расчет.');
      } else {
        setRequestError(error instanceof Error ? error.message : 'Не удалось выполнить расчет.');
      }
    } finally { setLoading(false); }
  }

  function reset() { setInputs(INITIAL); setResult(null); setAttempted(false); setRequestError(''); setTab('alleles'); }
  const last = result?.rows[result.rows.length - 1];
  const maxDelta = result ? Math.max(...result.rows.map((row) => Math.abs(row.p - result.params.p0))) : 0;

  function openBatchFromResult(params: SimulationParams) {
    setBatchStart((previous) => ({ revision: previous.revision + 1, params }));
    setScreen('batch');
  }

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><div className="brand-mark">HW</div><div><strong>Харди — Вайнберг</strong><span>моделирование генетического равновесия</span></div></div>
      <nav className="topnav" aria-label="Разделы">
        <button type="button" className={screen === 'single' ? 'nav-active' : undefined}
          aria-current={screen === 'single' ? 'page' : undefined} onClick={() => setScreen('single')}>Моделирование</button>
        <button type="button" className={screen === 'batch' ? 'nav-active' : undefined}
          aria-current={screen === 'batch' ? 'page' : undefined} onClick={() => setScreen('batch')}>Многократные прогоны</button>
        <button type="button" onClick={() => setHelpOpen(true)}>Справка</button>
      </nav>
      <div className="server-state"><span className={`status-dot ${server}`} />{server === 'checking' ? 'Проверяем сервер' : server === 'online' ? 'Сервер доступен' : 'Сервер недоступен'}</div>
    </header>
    {screen === 'single' && <main className="workspace">
      <aside className="panel parameters-panel" aria-label="Параметры моделирования">
        <div className="panel-heading"><span className="eyebrow">Параметры популяции</span><Info text="Параметры начальной популяции и длительность расчета." /></div>
        <div className="fields-grid">
          <label><ParamLabel label="Численность N" info="Количество диплоидных особей в популяции: от 2 до 100 000." /><TextField value={inputs.n} onChange={(e) => update('n', e.target.value)} error={attempted && !!validation.errors.n} helperText={attempted ? validation.errors.n : undefined} slotProps={{ htmlInput: { inputMode: 'numeric', 'aria-label': 'Численность N' } }} /></label>
          <label><ParamLabel label="Поколений T" info="Количество поколений после начального: от 1 до 1 000." /><TextField value={inputs.generations} onChange={(e) => update('generations', e.target.value)} error={attempted && !!validation.errors.generations} helperText={attempted ? validation.errors.generations : undefined} slotProps={{ htmlInput: { inputMode: 'numeric', 'aria-label': 'Поколений T' } }} /></label>
          <label><ParamLabel label="Частота p (A)" info="Начальная доля аллеля A: число от 0 до 1." /><TextField value={inputs.p0} onChange={(e) => update('p0', e.target.value)} error={attempted && !!validation.errors.p0} helperText={attempted ? validation.errors.p0 : undefined} slotProps={{ htmlInput: { inputMode: 'decimal', 'aria-label': 'Частота p (A)' } }} /></label>
          <label><ParamLabel label="Частота q (a)" info="Доля аллеля a вычисляется автоматически: q = 1 − p." /><TextField value={q} disabled slotProps={{ htmlInput: { 'aria-label': 'Частота q (a)' } }} /></label>
        </div>
        <div className="factors-heading"><span className="eyebrow">Факторы</span></div>
        <div className="factor-list">
          <FactorCard name="Миграция" symbols="m, pₘ" enabled={inputs.migrationEnabled}
            onToggle={(checked) => setInputs((previous) => ({ ...previous, migrationEnabled: checked }))}>
            <div className="fields-grid factor-fields">
              {factorField('m', 'Доля мигрантов m', 'Доля мигрантов в каждом поколении: от 0 до 1.')}
              {factorField('p_m', 'Частота pₘ', 'Частота аллеля A среди мигрантов: от 0 до 1.')}
            </div>
          </FactorCard>
          <FactorCard name="Отбор" symbols="w₁₁, w₁₂, w₂₂" enabled={inputs.selectionEnabled}
            onToggle={(checked) => setInputs((previous) => ({ ...previous, selectionEnabled: checked }))}>
            <div className="fields-grid factor-fields selection-fields">
              {FITNESS_FIELDS.map(([field, symbol, genotype]) =>
                factorField(field, `${symbol} (${genotype})`, `Приспособленность генотипа ${genotype}: от 0 до 1.`))}
              <div className="selection-target-field">
                {factorField('target_p', 'Целевая частота p*', 'Частота аллеля A, которую нужно достичь: от 0 до 1. Может быть выше или ниже начальной.')}
              </div>
            </div>
          </FactorCard>
          <FactorCard name="Неслучайное скрещивание" symbols="F" enabled={inputs.inbreedingEnabled}
            onToggle={(checked) => setInputs((previous) => ({ ...previous, inbreedingEnabled: checked }))}>
            <div className="fields-grid factor-fields single-factor-field">
              {factorField('f', 'Коэффициент инбридинга F', 'Число от 0 до 1. При F = 0 скрещивание случайное, при F = 1 гетерозиготы отсутствуют.')}
            </div>
          </FactorCard>
          <FactorCard name="Генетический дрейф" symbols="по N" enabled={inputs.driftEnabled}
            onToggle={(checked) => setInputs((previous) => ({ ...previous, driftEnabled: checked }))}>
            <div className="fields-grid factor-fields single-factor-field">
              {factorField('seed', 'Зерно генератора', 'Целое число от 0 до 4 294 967 295. Пустое поле — сервер выберет зерно и покажет его в результатах.')}
            </div>
          </FactorCard>
        </div>
        <div className="model-note"><span className="note-icon">i</span><div>
          <strong>{selectedFactors.join(' + ') || 'Идеальная популяция'}</strong><br />
          {selectedFactors.length > 1 ? `Порядок применения факторов: ${selectedFactors.join(' → ')}.`
            : inputs.driftEnabled ? 'В каждом поколении частота аллеля зависит от случайной выборки 2N копий.'
            : inputs.inbreedingEnabled ? 'Инбридинг увеличивает долю гомозигот, сохраняя частоты аллелей.'
            : inputs.selectionEnabled ? 'Частота аллеля меняется в зависимости от приспособленности генотипов.'
            : inputs.migrationEnabled ? 'Доля m популяции в каждом поколении приходится на мигрантов.'
            : 'Расчет без отбора, миграции, инбридинга и дрейфа.'}
        </div></div>
        <div className="actions"><Button variant="contained" onClick={run} disabled={loading} startIcon={loading ? <CircularProgress size={15} color="inherit" /> : <span className="play-icon">▶</span>}>{loading ? 'Расчет…' : 'Запустить'}</Button><Button variant="outlined" color="inherit" onClick={reset} disabled={loading}>Сбросить</Button></div>
      </aside>
      <section className="panel results-panel" aria-label="Результаты моделирования">
        <div className="results-header"><div><span className="eyebrow">Моделирование</span><h1>Результат моделирования</h1></div><span className="mode-badge"><span />{mode}</span></div>
        {requestError && <div className="alert-space"><Alert severity="error" action={<Button color="inherit" size="small" onClick={run} disabled={loading}>Повторить</Button>}>{requestError}</Alert></div>}
        {!result && !loading && <div className="empty-state">
          <div className="empty-chart"><svg viewBox="0 0 100 72" fill="none" aria-hidden="true"><path d="M10 7v52h80" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/><path d="M17 46 35 33l17 5 17-20 17 6" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/><circle cx="69" cy="18" r="4" fill="currentColor"/></svg></div>
          <h2>Здесь появятся результаты</h2>
          <p>Задайте параметры популяции и нажмите «Запустить», чтобы увидеть изменение частот по поколениям.</p>
          {selectedFactors.length === 0 && <div className="empty-hint"><span>✓</span> Начните с идеальной популяции без факторов</div>}
        </div>}
        {loading && !result && <div className="empty-state" role="status"><CircularProgress size={36} /><h2>Выполняем расчет</h2><p>Передаем параметры на сервер.</p></div>}
        {result && last && <>
          {resultIsStale && <div className="stale-notice">Параметры изменены. Запустите расчет, чтобы обновить результаты.</div>}
          <div className="metrics">
            <div><span>Частота p в поколении {last.t}</span><strong>{display(last.p)}</strong><small>в начале: {display(result.params.p0)}</small></div>
            {inbreeding ? <>
              <div><span>Доля гетерозигот Aa</span><strong>{display(last.f_Aa)}</strong><small>ожидаемая H = 2pq: {display(last.h)}</small></div>
              <div><span>Доля гомозигот AA + aa</span><strong>{display(last.f_AA + last.f_aa)}</strong><small>при тех же p и q, но F = 0: {display(1 - last.h)}</small></div>
            </> : <>
              <div><span>Гетерозиготность H = 2pq</span><strong>{display(last.h)}</strong><small>доля гетерозигот Aa</small></div>
              <div><span>Изменение частоты p</span><strong className="positive">{display(maxDelta)}</strong><small>максимальное за весь расчет</small></div>
            </>}
            {selection ? <div>
              <span>Достижение p* = {display(selection.target_p)}</span>
              <strong>{result.target_generation === undefined ? 'Не достигнута' : `t = ${integer.format(result.target_generation)}`}</strong>
              <small>{result.target_generation === undefined ? `за ${integer.format(result.params.generations)} поколений` : 'первое поколение, достигшее цели'}</small>
            </div> : halfLife !== undefined ? <div>
              <span>Снижение средней H вдвое</span><strong>≈ {oneDecimal.format(halfLife)}</strong>
              <small>поколений по теории нейтрального дрейфа</small>
            </div> : <div>
              <span>Поколений после начального</span><strong>{integer.format(last.t)}</strong>
              <small>Поколения 0–{integer.format(last.t)}. Строк в таблице — {integer.format(result.rows.length)}.</small>
            </div>}
          </div>
          <div className="result-content">
            <div className="result-tabs" role="tablist" aria-label="Данные расчета">{TABS.map((item) => <button role="tab" aria-selected={tab === item.id} key={item.id} className={tab === item.id ? 'selected' : ''} onClick={() => setTab(item.id)}>{item.label}</button>)}</div>
            {tab === 'table' ? <ResultsTable rows={result.rows} /> : <ResultsChart rows={result.rows} tab={tab}
              targetP={selection?.target_p} targetGeneration={result.target_generation}
              showInbreeding={Boolean(inbreeding)} showDrift={Boolean(drift)} />}
            {tab === 'heterozygosity' && halfLife !== undefined && <div className="chart-caption">
              Теоретическая кривая показывает среднее по множеству прогонов. При данной N средняя H уменьшается вдвое примерно за {oneDecimal.format(halfLife)} поколений.
            </div>}
            {drift && <div className="chart-caption">
              {driftBoundary
                ? `${driftBoundary.kind === 'fixation' ? 'Фиксация аллеля A' : 'Потеря аллеля A'} впервые отмечена в поколении ${integer.format(driftBoundary.generation)}.`
                : 'Фиксация или потеря аллеля A за время прогона не отмечена.'}
              {driftBoundary && migration && ' Миграция может восстановить утраченный аллель.'}
            </div>}
            <div className="parameters-summary">
              <strong>Параметры расчета:</strong> N = {integer.format(result.params.n)}; p₀ = {display(result.params.p0)}; T = {integer.format(result.params.generations)}
              {describeFactors(result.params).map((factor) => ` · ${factor}`)}
              {drift && <>; дрейф (зерно {drift.seed})</>}
              {resultFactors.length === 0 && '; факторы выключены'}
            </div>
            {!resultIsStale && <Button className="batch-link" onClick={() => openBatchFromResult(result.params)}>Оценить разброс</Button>}
          </div>
        </>}
      </section>
    </main>}
    <BatchScreen key={batchStart.revision} active={screen === 'batch'} initialParams={batchStart.params}
      availableFactors={validation.factors} onServerState={(online) => setServer(online ? 'online' : 'offline')} />
    <footer className="footer">Учебная модель · Один локус, два аллеля, неперекрывающиеся поколения</footer>
    <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} maxWidth="sm" fullWidth>
      <DialogTitle>Справка</DialogTitle>
      <DialogContent>
        <Box component="p">В идеальной популяции частоты аллелей остаются постоянными. Для частоты аллеля A, равной p, частота a равна q = 1 − p.</Box>
        <Box component="p">Ожидаемые доли генотипов: AA = p², Aa = 2pq, aa = q². Гетерозиготность H = 2pq.</Box>
        <Box component="p">При миграции частота аллеля A в следующем поколении равна (1 − m)p + m·pₘ. Здесь m — доля мигрантов, pₘ — частота аллеля A среди них.</Box>
        <Box component="p">При отборе приспособленность определяет долю выживших для каждого генотипа. Если включена миграция, отбор применяется после нее.</Box>
        <Box component="p">При инбридинге частоты аллелей остаются прежними, а доля гетерозигот Aa равна 2pq(1 − F). График гетерозиготности сравнивает ее с ожидаемой долей 2pq при случайном скрещивании.</Box>
        <Box component="p">При дрейфе частота меняется случайно: в каждом поколении выбираются 2N копий аллелей. При тех же параметрах и зерне расчет повторяется. Теория описывает среднее для дрейфа без других факторов.</Box>
      </DialogContent>
      <DialogActions><Button onClick={() => setHelpOpen(false)}>Понятно</Button></DialogActions>
    </Dialog>
  </div>;
}
