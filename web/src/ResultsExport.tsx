import { useState } from 'react';
import {
  Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Radio, RadioGroup,
} from '@mui/material';
import { describeFactors, display, integer } from './simulationUi';
import type { BatchSimulationResult, SimulationResult } from './types';

type Result = SimulationResult | BatchSimulationResult;
type ExportFormat = 'csv' | 'xlsx';

const MEDIA_TYPES: Record<ExportFormat, string> = {
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export default function ResultsExport({ result, disabled = false }: { result: Result; disabled?: boolean }) {
  const [snapshot, setSnapshot] = useState<Result | null>(null);
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const params = snapshot?.params;
  const batchRuns = snapshot && 'trajectories' in snapshot ? snapshot.params.runs : undefined;
  const seed = params?.drift?.seed;

  async function download() {
    if (!snapshot || loading) return;
    setError('');
    setLoading(true);
    try {
      const response = await fetch(`/api/export?format=${format}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ params: snapshot.params, rows: snapshot.rows }),
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
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1_000);
      setSnapshot(null);
    } catch (cause) {
      setError(cause instanceof TypeError || (cause instanceof DOMException && cause.name === 'TimeoutError')
        ? 'Сервер недоступен или не ответил вовремя. Повторите попытку.'
        : cause instanceof Error ? cause.message : 'Не удалось выгрузить таблицу.');
    } finally {
      setLoading(false);
    }
  }

  return <>
    <Button className="result-action" variant="outlined" color="inherit" size="small" disabled={disabled}
      onClick={() => { setError(''); setSnapshot(result); }}>Экспорт</Button>
    <Dialog open={Boolean(snapshot)} onClose={() => { if (!loading) setSnapshot(null); }}
      aria-labelledby="export-title" maxWidth="sm" fullWidth>
      <DialogTitle id="export-title">Экспорт результатов</DialogTitle>
      <DialogContent>
        <RadioGroup row aria-label="Формат файла" value={format}
          onChange={(_, value) => setFormat(value === 'xlsx' ? 'xlsx' : 'csv')}>
          <FormControlLabel value="csv" label="Таблица CSV" control={<Radio size="small" />} disabled={loading} />
          <FormControlLabel value="xlsx" label="Книга Excel (.xlsx)" control={<Radio size="small" />} disabled={loading} />
        </RadioGroup>
        {snapshot && <p>Поколения от 0 до {integer.format(snapshot.params.generations)} · строк данных {integer.format(snapshot.rows.length)}</p>}
        {params && <div className="parameters-summary export-summary">
          <strong>Параметры расчета</strong> · N = {integer.format(params.n)} · p₀ = {display(params.p0)}
          {' · '}T = {integer.format(params.generations)}
          {batchRuns !== undefined && <> · прогонов {integer.format(batchRuns)}</>}
          {seed !== undefined && <> · зерно {seed}</>}
          {describeFactors(params).map((factor) => ` · ${factor}`)}
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
