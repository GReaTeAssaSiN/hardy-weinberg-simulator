import { useState } from 'react';
import {
  Alert, Button, CircularProgress, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField,
} from '@mui/material';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { display, integer } from './simulationUi';
import { displayChiSquare } from './ChiSquareResults';
import type { SampleCheckResult } from './types';

const GENOTYPES = ['AA', 'Aa', 'aa'] as const;
const MAX_SAMPLE_SIZE = 100_000;
const CONTROLS = [
  { AA: 298, Aa: 489, aa: 213 },
  { AA: 360, Aa: 280, aa: 360 },
  { AA: 50, Aa: 500, aa: 450 },
] as const;

const VERDICTS = {
  compatible: { title: 'Нет оснований отвергнуть равновесие', severity: 'success' },
  deviation: { title: 'Обнаружено статистически значимое отклонение', severity: 'warning' },
  small_expected: { title: 'Недостаточно данных для вывода по χ²', severity: 'info' },
  one_allele: { title: 'В выборке присутствует только один аллель', severity: 'info' },
} as const;

function SampleResult({ result }: { result: SampleCheckResult }) {
  const verdict = VERDICTS[result.verdict];
  const numberOrDash = (value: number | null) => value === null ? '—' : display(value);
  return <>
    <div className="metrics sample-metrics">
      <div><span>Размер выборки N</span><strong>{integer.format(result.n)}</strong></div>
      <div><span>Частота p (A)</span><strong>{display(result.p)}</strong></div>
      <div><span>Частота q (a)</span><strong>{display(result.q)}</strong></div>
      <div><span>Статистика χ²</span><strong>{result.chi_square === null ? '—' : displayChiSquare(result.chi_square, result.critical_value)}</strong></div>
    </div>
    <div className="result-content sample-result">
      <Alert severity={verdict.severity}>
        <strong>{verdict.title}</strong><br />
        {result.verdict === 'one_allele' ? 'При нулевой частоте одного аллеля критерий неприменим.'
          : result.verdict === 'small_expected' ? 'Ожидаемая численность хотя бы одного генотипа меньше 5.'
          : `Порог χ² = ${display(result.critical_value)} при α = 0,05 и одной степени свободы.`}
      </Alert>
      <TableContainer className="table-wrap">
        <Table size="small" aria-label="Численности генотипов">
          <TableHead><TableRow>
            <TableCell>Генотип</TableCell><TableCell align="right">Наблюдалось (O)</TableCell>
            <TableCell align="right">Ожидалось (E)</TableCell><TableCell align="right">Вклад в χ²</TableCell>
          </TableRow></TableHead>
          <TableBody>{result.rows.map((row) => <TableRow key={row.genotype}>
            <TableCell component="th" scope="row">{row.genotype}</TableCell>
            <TableCell align="right">{integer.format(row.observed)}</TableCell>
            <TableCell align="right">{display(row.expected)}</TableCell>
            <TableCell align="right">{numberOrDash(row.contribution)}</TableCell>
          </TableRow>)}</TableBody>
        </Table>
      </TableContainer>
      <div className="chart-wrap sample-chart" aria-label="Диаграмма наблюдаемых и ожидаемых численностей">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart data={result.rows} margin={{ top: 8, right: 14, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#e7ebef" vertical={false} />
            <XAxis dataKey="genotype" />
            <YAxis tickFormatter={(value) => integer.format(value)} allowDecimals={false} width={64} />
            <Tooltip formatter={(value) => typeof value === 'number' ? display(value) : String(value)} />
            <Bar dataKey="observed" name="Наблюдалось" fill="#2161eb" isAnimationActive={false} />
            <Bar dataKey="expected" name="Ожидалось" fill="#0d8c82" isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="legend">
        <span><i style={{ backgroundColor: '#2161eb' }} />Наблюдалось</span>
        <span><i style={{ backgroundColor: '#0d8c82' }} />Ожидалось по Харди — Вайнбергу</span>
      </div>
    </div>
  </>;
}

export default function SampleCheckScreen({ active, onServerState }: {
  active: boolean;
  onServerState: (online: boolean) => void;
}) {
  const [values, setValues] = useState({ AA: '', Aa: '', aa: '' });
  const [attempted, setAttempted] = useState(false);
  const [result, setResult] = useState<SampleCheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [requestError, setRequestError] = useState('');
  if (!active) return null;

  const invalid = (genotype: keyof typeof values) => !/^\d+$/.test(values[genotype].trim()) || Number(values[genotype]) > MAX_SAMPLE_SIZE;
  const hasInvalid = GENOTYPES.some(invalid);
  const counts = { AA: Number(values.AA), Aa: Number(values.Aa), aa: Number(values.aa) };
  const total = counts.AA + counts.Aa + counts.aa;
  const invalidTotal = !hasInvalid && (total < 1 || total > MAX_SAMPLE_SIZE);

  function update(next: typeof values) {
    setValues(next);
    setResult(null);
    setRequestError('');
    setAttempted(false);
  }

  async function run() {
    setAttempted(true);
    setRequestError('');
    if (loading || hasInvalid || invalidTotal) return;
    setLoading(true);
    try {
      const response = await fetch('/api/check-sample', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(counts),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(response.status === 422
        ? 'Сервер отклонил численности. Проверьте введенные значения.' : 'Не удалось проверить выборку. Повторите запрос.');
      setResult(await response.json());
      onServerState(true);
    } catch (error) {
      if (error instanceof TypeError || (error instanceof DOMException && ['TimeoutError', 'AbortError'].includes(error.name))) {
        onServerState(false);
        setRequestError('Сервер недоступен или не ответил вовремя. Повторите запрос.');
      } else {
        setRequestError(error instanceof Error ? error.message : 'Не удалось проверить выборку.');
      }
    } finally { setLoading(false); }
  }

  return <main className="workspace">
    <form className="panel parameters-panel" aria-label="Наблюдаемые численности"
      onSubmit={(event) => { event.preventDefault(); void run(); }}>
      <div className="panel-heading"><span className="eyebrow">Наблюдаемые численности</span></div>
      <div className="fields-grid sample-fields">
        {GENOTYPES.map((genotype) => <label key={genotype}>
          <span className="field-label">{genotype}</span>
          <TextField fullWidth disabled={loading} value={values[genotype]}
            onChange={(event) => update({ ...values, [genotype]: event.target.value })}
            error={attempted && invalid(genotype)} helperText={attempted && invalid(genotype) ? 'Целое число от 0 до 100 000' : undefined}
            slotProps={{ htmlInput: { 'aria-label': genotype, inputMode: 'numeric' } }} />
        </label>)}
      </div>
      {attempted && invalidTotal && <Alert severity="error">В выборке должно быть от 1 до 100 000 особей.</Alert>}
      <div className="actions">
        <Button type="submit" variant="contained" disabled={loading} startIcon={loading ? <CircularProgress size={15} /> : undefined}>
          {loading ? 'Проверяем…' : 'Проверить равновесие'}
        </Button>
      </div>
      <div className="sample-controls">
        <span className="eyebrow">Контрольные выборки</span>
        {CONTROLS.map((control) => <Button variant="outlined" type="button" key={control.AA} disabled={loading}
          aria-label={`Подставить ${control.AA} / ${control.Aa} / ${control.aa}`}
          onClick={() => update({ AA: String(control.AA), Aa: String(control.Aa), aa: String(control.aa) })}>
          {control.AA} / {control.Aa} / {control.aa}
        </Button>)}
      </div>
    </form>
    <section className="panel results-panel" aria-label="Результат проверки выборки">
      <div className="results-header"><h1>Проверка выборки</h1></div>
      {requestError && <div className="alert-space"><Alert severity="error">{requestError}</Alert></div>}
      {result ? <SampleResult result={result} /> : <div className="result-content sample-intro">
        <p>Введите число особей каждого генотипа. Критерий χ² Пирсона сравнит эти данные с ожидаемыми при равновесии Харди — Вайнберга.</p>
      </div>}
    </section>
  </main>;
}
