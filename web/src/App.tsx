import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, Switch, Table, TableBody, TableCell, TableContainer, TableHead,
  TablePagination, TableRow, TextField, Tooltip,
} from '@mui/material';
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip as ChartTooltip,
  XAxis, YAxis,
} from 'recharts';
import type { GenerationRow, SimulationParams, SimulationResult } from './types';

type Inputs = { n: string; p0: string; generations: string };
type FieldErrors = Partial<Record<keyof Inputs, string>>;
type TabName = 'alleles' | 'genotypes' | 'heterozygosity' | 'table';

const INITIAL: Inputs = { n: '500', p0: '0,5', generations: '100' };
const FACTORS = [
  ['Миграция', 'm, pₘ'],
  ['Отбор', 'w₁₁, w₁₂, w₂₂'],
  ['Неслучайное скрещивание', 'F'],
  ['Генетический дрейф', 'N'],
];
const TABS: { id: TabName; label: string }[] = [
  { id: 'alleles', label: 'Частоты аллелей' },
  { id: 'genotypes', label: 'Генотипы' },
  { id: 'heterozygosity', label: 'Гетерозиготность' },
  { id: 'table', label: 'Таблица' },
];
const number = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 4 });
const integer = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const display = (value: number) => number.format(value);

function parseDecimal(value: string): number {
  const normalized = value.trim().replace(',', '.');
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return NaN;
  return Number(normalized);
}

function validate(inputs: Inputs): { params?: SimulationParams; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const n = parseDecimal(inputs.n);
  const p0 = parseDecimal(inputs.p0);
  const generations = parseDecimal(inputs.generations);
  if (!Number.isInteger(n) || n < 2 || n > 100_000) errors.n = 'Введите целое число от 2 до 100 000';
  if (!Number.isFinite(p0) || p0 < 0 || p0 > 1) errors.p0 = 'Введите число от 0 до 1';
  if (!Number.isInteger(generations) || generations < 1 || generations > 1_000) {
    errors.generations = 'Введите целое число от 1 до 1 000';
  }
  return Object.keys(errors).length ? { errors } : { errors, params: { n, p0, generations } };
}

function Info({ text }: { text: string }) {
  return <Tooltip title={text} arrow><span className="info" aria-label={text} tabIndex={0}>?</span></Tooltip>;
}

function ParamLabel({ label, info }: { label: string; info: string }) {
  return <span className="field-label">{label} <Info text={info} /></span>;
}

function ResultsChart({ rows, tab }: { rows: GenerationRow[]; tab: Exclude<TabName, 'table'> }) {
  const series = tab === 'alleles'
    ? [{ key: 'p', name: 'p (A)', color: '#2161eb' }, { key: 'q', name: 'q (a)', color: '#e57925' }]
    : tab === 'genotypes'
      ? [{ key: 'f_AA', name: 'AA', color: '#2161eb' }, { key: 'f_Aa', name: 'Aa', color: '#0d8c82' }, { key: 'f_aa', name: 'aa', color: '#e57925' }]
      : [{ key: 'h', name: 'H = 2pq', color: '#0d8c82' }];
  return <>
    <div className="chart-wrap" aria-label="График по поколениям">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <LineChart data={rows} margin={{ top: 12, right: 18, bottom: 14, left: 0 }}>
          <CartesianGrid stroke="#e7ebef" vertical={false} />
          <XAxis dataKey="t" tick={{ fontSize: 12, fill: '#8290a0' }} tickLine={false} axisLine={{ stroke: '#d6dee5' }} label={{ value: 'Поколение', position: 'insideBottom', offset: -7, fontSize: 12, fill: '#8290a0' }} />
          <YAxis domain={[0, 1]} tickCount={6} tickFormatter={display} tick={{ fontSize: 12, fill: '#8290a0' }} tickLine={false} axisLine={false} width={42} />
          <ChartTooltip formatter={(value) => typeof value === 'number' ? display(value) : String(value)} labelFormatter={(label) => `Поколение ${label}`} />
          {series.map((line) => <Line key={line.key} type="linear" dataKey={line.key} name={line.name} stroke={line.color} strokeWidth={2.5} dot={false} isAnimationActive={false} />)}
        </LineChart>
      </ResponsiveContainer>
    </div>
    <div className="chart-caption">Частоты по поколениям. Наведите курсор на график, чтобы увидеть значения.</div>
    <div className="legend">{series.map((line) => <span key={line.key}><i style={{ backgroundColor: line.color }} />{line.name}</span>)}</div>
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
  const [inputs, setInputs] = useState<Inputs>(INITIAL);
  const [attempted, setAttempted] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [tab, setTab] = useState<TabName>('alleles');
  const [loading, setLoading] = useState(false);
  const [server, setServer] = useState<'checking' | 'online' | 'offline'>('checking');
  const [requestError, setRequestError] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const validation = useMemo(() => validate(inputs), [inputs]);
  const q = Number.isFinite(parseDecimal(inputs.p0)) && parseDecimal(inputs.p0) >= 0 && parseDecimal(inputs.p0) <= 1 ? display(1 - parseDecimal(inputs.p0)) : '—';
  const resultIsStale = result && (!validation.params || result.params.n !== validation.params.n || result.params.p0 !== validation.params.p0 || result.params.generations !== validation.params.generations);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/health', { signal: controller.signal }).then((response) => setServer(response.ok ? 'online' : 'offline')).catch(() => { if (!controller.signal.aborted) setServer('offline'); });
    return () => controller.abort();
  }, []);

  function update(field: keyof Inputs, value: string) { setInputs((previous) => ({ ...previous, [field]: value })); }

  async function run() {
    setAttempted(true);
    setRequestError('');
    if (!validation.params || loading) return;
    const params = validation.params;
    setLoading(true);
    try {
      const response = await fetch('/api/simulate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params), signal: AbortSignal.timeout(15_000) });
      if (response.status === 422) throw new Error('Сервер отклонил параметры. Проверьте значения полей.');
      if (!response.ok) throw new Error('Не удалось выполнить расчет. Попробуйте еще раз.');
      const data: SimulationResult = await response.json();
      setResult(data);
      setServer('online');
      setTab('alleles');
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

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><div className="brand-mark">HW</div><div><strong>Харди — Вайнберг</strong><span>моделирование генетического равновесия</span></div></div>
      <nav className="topnav" aria-label="Разделы"><span className="nav-active">Моделирование</span><button type="button" onClick={() => setHelpOpen(true)}>Справка</button></nav>
      <div className="server-state"><span className={`status-dot ${server}`} />{server === 'checking' ? 'Проверяем сервер' : server === 'online' ? 'Сервер доступен' : 'Сервер недоступен'}</div>
    </header>
    <main className="workspace">
      <aside className="panel parameters-panel" aria-label="Параметры моделирования">
        <div className="panel-heading"><span className="eyebrow">Параметры популяции</span><Info text="Параметры начальной популяции и длительность расчета." /></div>
        <div className="fields-grid">
          <label><ParamLabel label="Численность N" info="Количество диплоидных особей в популяции: от 2 до 100 000." /><TextField value={inputs.n} onChange={(e) => update('n', e.target.value)} error={attempted && !!validation.errors.n} helperText={attempted ? validation.errors.n : undefined} slotProps={{ htmlInput: { inputMode: 'numeric', 'aria-label': 'Численность N' } }} /></label>
          <label><ParamLabel label="Поколений T" info="Количество поколений после начального: от 1 до 1 000." /><TextField value={inputs.generations} onChange={(e) => update('generations', e.target.value)} error={attempted && !!validation.errors.generations} helperText={attempted ? validation.errors.generations : undefined} slotProps={{ htmlInput: { inputMode: 'numeric', 'aria-label': 'Поколений T' } }} /></label>
          <label><ParamLabel label="Частота p (A)" info="Начальная доля аллеля A: число от 0 до 1." /><TextField value={inputs.p0} onChange={(e) => update('p0', e.target.value)} error={attempted && !!validation.errors.p0} helperText={attempted ? validation.errors.p0 : undefined} slotProps={{ htmlInput: { inputMode: 'decimal', 'aria-label': 'Частота p (A)' } }} /></label>
          <label><ParamLabel label="Частота q (a)" info="Доля аллеля a вычисляется автоматически: q = 1 − p." /><TextField value={q} disabled slotProps={{ htmlInput: { 'aria-label': 'Частота q (a)' } }} /></label>
        </div>
        <div className="factors-heading"><span className="eyebrow">Факторы</span><span className="section-hint">пока недоступны</span></div>
        <div className="factor-list">{FACTORS.map(([name, symbol]) => <div className="factor" key={name}><Switch disabled size="small" slotProps={{ input: { 'aria-label': name } }} /><span>{name}</span><small>{symbol}</small></div>)}</div>
        <div className="model-note"><span className="note-icon">i</span><div><strong>Идеальная популяция</strong><br />Расчет без отбора, миграции, инбридинга и дрейфа.</div></div>
        <div className="actions"><Button variant="contained" onClick={run} disabled={loading} startIcon={loading ? <CircularProgress size={15} color="inherit" /> : <span className="play-icon">▶</span>}>{loading ? 'Расчет…' : 'Запустить'}</Button><Button variant="outlined" color="inherit" onClick={reset} disabled={loading}>Сбросить</Button></div>
      </aside>
      <section className="panel results-panel" aria-label="Результаты моделирования">
        <div className="results-header"><div><span className="eyebrow">Моделирование</span><h1>Результат моделирования</h1></div><span className="mode-badge"><span />Идеальная популяция</span></div>
        {requestError && <div className="alert-space"><Alert severity="error" action={<Button color="inherit" size="small" onClick={run} disabled={loading}>Повторить</Button>}>{requestError}</Alert></div>}
        {!result && !loading && <div className="empty-state"><div className="empty-chart"><svg viewBox="0 0 100 72" fill="none" aria-hidden="true"><path d="M10 7v52h80" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/><path d="M17 46 35 33l17 5 17-20 17 6" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/><circle cx="69" cy="18" r="4" fill="currentColor"/></svg></div><h2>Здесь появятся результаты</h2><p>Задайте параметры популяции и нажмите «Запустить», чтобы увидеть изменение частот по поколениям.</p><div className="empty-hint"><span>✓</span> Начните с идеальной популяции без факторов</div></div>}
        {loading && !result && <div className="empty-state" role="status"><CircularProgress size={36} /><h2>Выполняем расчет</h2><p>Передаем параметры на сервер.</p></div>}
        {result && last && <>
          {resultIsStale && <div className="stale-notice">Параметры изменены. Запустите расчет, чтобы обновить результаты.</div>}
          <div className="metrics">
            <div><span>Частота p в поколении {last.t}</span><strong>{display(last.p)}</strong><small>в начале: {display(result.params.p0)}</small></div>
            <div><span>Гетерозиготность H = 2pq</span><strong>{display(last.h)}</strong><small>доля гетерозигот Aa</small></div>
            <div><span>Изменение частоты p</span><strong className="positive">{display(maxDelta)}</strong><small>максимальное за весь расчет</small></div>
            <div><span>Поколений рассчитано</span><strong>{integer.format(last.t)}</strong><small>начальное поколение включено</small></div>
          </div>
          <div className="result-content">
            <div className="result-tabs" role="tablist" aria-label="Данные расчета">{TABS.map((item) => <button role="tab" aria-selected={tab === item.id} key={item.id} className={tab === item.id ? 'selected' : ''} onClick={() => setTab(item.id)}>{item.label}</button>)}</div>
            {tab === 'table' ? <ResultsTable rows={result.rows} /> : <ResultsChart rows={result.rows} tab={tab} />}
            <div className="parameters-summary"><strong>Параметры расчета:</strong> N = {integer.format(result.params.n)}; p₀ = {display(result.params.p0)}; T = {integer.format(result.params.generations)}; факторы выключены</div>
          </div>
        </>}
      </section>
    </main>
    <footer className="footer">Учебная модель · Один локус, два аллеля, неперекрывающиеся поколения</footer>
    <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} maxWidth="sm" fullWidth>
      <DialogTitle>Справка</DialogTitle><DialogContent><Box component="p">В идеальной популяции частоты аллелей остаются постоянными. Для частоты аллеля A, равной p, частота a равна q = 1 − p.</Box><Box component="p">Ожидаемые доли генотипов: AA = p², Aa = 2pq, aa = q². Гетерозиготность H = 2pq.</Box><Box component="p">На первом этапе доступен расчет без факторов. Значения являются результатом учебной модели.</Box></DialogContent><DialogActions><Button onClick={() => setHelpOpen(false)}>Понятно</Button></DialogActions>
    </Dialog>
  </div>;
}
