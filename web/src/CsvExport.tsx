import { useState } from 'react';
import { Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import { describeFactors, display, integer } from './simulationUi';
import type { BatchSimulationResult, SimulationResult } from './types';

type Result = SimulationResult | BatchSimulationResult;

export default function CsvExport({ result, disabled = false }: { result: Result; disabled?: boolean }) {
  const [snapshot, setSnapshot] = useState<Result | null>(null);
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
      const response = await fetch('/api/export', {
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
      if (!response.headers.get('Content-Type')?.startsWith('text/csv')) {
        throw new Error('Сервер не вернул файл CSV. Повторите попытку.');
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = batchRuns === undefined ? 'hardy-weinberg-simulation.csv' : 'hardy-weinberg-batch.csv';
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
    <Button className="export-button" variant="outlined" color="inherit" size="small" disabled={disabled}
      onClick={() => { setError(''); setSnapshot(result); }}>Экспорт</Button>
    <Dialog open={Boolean(snapshot)} onClose={() => { if (!loading) setSnapshot(null); }}
      aria-labelledby="csv-export-title" maxWidth="sm" fullWidth>
      <DialogTitle id="csv-export-title">Экспорт результатов</DialogTitle>
      <DialogContent>
        {snapshot && <p>Таблица CSV включает {integer.format(snapshot.rows.length)} строк данных по поколениям от 0 до {integer.format(snapshot.params.generations)}.</p>}
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
          {loading ? 'Подготавливаем файл…' : 'Скачать CSV'}
        </Button>
      </DialogActions>
    </Dialog>
  </>;
}
