import { useState } from 'react';
import type { RefObject } from 'react';
import {
  Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Radio, RadioGroup,
} from '@mui/material';
import { captureChart, downloadChartPng, downloadFile } from './chartExport';
import type { ChartSnapshot } from './chartExport';
import { describeFactors, display, integer } from './simulationUi';
import type { BatchSimulationResult, SimulationResult } from './types';

type Result = SimulationResult | BatchSimulationResult;
type TableFormat = 'csv' | 'xlsx';
type ExportFormat = TableFormat | 'png';
type ChartTarget = { container: RefObject<HTMLDivElement | null>; id: string; title: string };
type ExportSnapshot = { result: Result; png: { chart: ChartSnapshot; filenamePrefix: string } | null };

const MEDIA_TYPES: Record<TableFormat, string> = {
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

function describeResult(result: Result): string {
  const { n, p0, generations, drift } = result.params;
  const details = [`N = ${integer.format(n)}`, `p₀ = ${display(p0)}`, `T = ${integer.format(generations)}`];
  if ('trajectories' in result) details.push(`прогонов ${integer.format(result.params.runs)}`);
  if (drift) details.push(drift.seed === undefined ? 'дрейф' : `дрейф (зерно ${drift.seed})`);
  return [...details, ...describeFactors(result.params)].join(' · ');
}

async function downloadTable(result: Result, format: TableFormat): Promise<void> {
  const response = await fetch(`/api/export?format=${format}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ params: result.params, rows: result.rows }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(typeof data?.detail === 'string'
      ? data.detail : 'Не удалось выгрузить таблицу. Повторите попытку.');
  }
  const filename = response.headers.get('Content-Disposition')?.match(/filename="([a-z0-9-]+\.(?:csv|xlsx))"/i)?.[1];
  if (!response.headers.get('Content-Type')?.startsWith(MEDIA_TYPES[format]) || !filename?.endsWith(`.${format}`)) {
    throw new Error('Сервер не вернул файл в выбранном формате. Повторите попытку.');
  }
  downloadFile(await response.blob(), filename);
}

export default function ResultsExport({ result, disabled = false, chart }: {
  result: Result; disabled?: boolean; chart?: ChartTarget;
}) {
  const [snapshot, setSnapshot] = useState<ExportSnapshot | null>(null);
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function open() {
    const captured = chart ? captureChart(chart.container.current, chart.title, [describeResult(result)]) : null;
    const { n, generations, drift } = result.params;
    const mode = 'trajectories' in result ? `batch-N${n}-T${generations}-runs${result.params.runs}` : `simulation-N${n}-T${generations}`;
    const seed = drift?.seed === undefined ? '' : `-seed${drift.seed}`;
    setSnapshot({ result, png: captured && chart ? { chart: captured, filenamePrefix: `${mode}${seed}-${chart.id}` } : null });
    if (!captured && format === 'png') setFormat('csv');
    setError('');
  }

  async function download() {
    if (!snapshot || loading) return;
    setError('');
    setLoading(true);
    try {
      if (format === 'png') {
        if (!snapshot.png) throw new Error('Откройте вкладку с графиком, чтобы скачать PNG.');
        await downloadChartPng(snapshot.png.chart, snapshot.png.filenamePrefix);
      } else {
        await downloadTable(snapshot.result, format);
      }
      setSnapshot(null);
    } catch (cause) {
      setError(format !== 'png' && (cause instanceof TypeError || (cause instanceof DOMException && cause.name === 'TimeoutError'))
        ? 'Сервер недоступен или не ответил вовремя. Повторите попытку.'
        : cause instanceof Error ? cause.message : 'Не удалось подготовить файл.');
    } finally {
      setLoading(false);
    }
  }

  return <>
    <Button className="result-action" variant="outlined" color="inherit" size="small" disabled={disabled}
      onClick={open}>Экспорт</Button>
    <Dialog open={Boolean(snapshot)} onClose={() => { if (!loading) setSnapshot(null); }}
      aria-labelledby="export-title" maxWidth="sm" fullWidth>
      <DialogTitle id="export-title">Экспорт результатов</DialogTitle>
      <DialogContent>
        <RadioGroup row aria-label="Формат файла" value={format}
          onChange={(_, value) => setFormat(value === 'xlsx' || value === 'png' ? value : 'csv')}>
          <FormControlLabel value="csv" label="Таблица CSV" control={<Radio size="small" />} disabled={loading} />
          <FormControlLabel value="xlsx" label="Книга Excel (.xlsx)" control={<Radio size="small" />} disabled={loading} />
          <FormControlLabel value="png" label="График PNG" control={<Radio size="small" />} disabled={loading || !snapshot?.png} />
        </RadioGroup>
        {snapshot && <p>{format === 'png' ? snapshot.png?.chart.title
          : `Поколения от 0 до ${integer.format(snapshot.result.params.generations)} · строк данных ${integer.format(snapshot.result.rows.length)}`}</p>}
        {snapshot && !snapshot.png && <p className="chart-caption">Откройте вкладку с графиком, чтобы скачать PNG.</p>}
        {snapshot && <div className="parameters-summary export-summary">
          <strong>Параметры расчета</strong> · {describeResult(snapshot.result)}
        </div>}
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setSnapshot(null)} disabled={loading}>Отмена</Button>
        <Button onClick={download} variant="contained" disabled={loading}
          startIcon={loading ? <CircularProgress color="inherit" size={15} /> : undefined}>
          {loading ? 'Подготавливаем файл…' : `Скачать ${format.toUpperCase()}`}
        </Button>
      </DialogActions>
    </Dialog>
  </>;
}
