import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { captureChart, downloadChartPng, downloadFile } from './chartExport';
import ResultsExport from './ResultsExport';
import type { SimulationResult } from './types';

vi.mock('./chartExport', () => ({
  captureChart: vi.fn(),
  downloadChartPng: vi.fn(),
  downloadFile: vi.fn(),
}));

const result: SimulationResult = {
  params: { n: 500, p0: 0.5, generations: 1 },
  rows: [0, 1].map((t) => ({ t, p: 0.5, q: 0.5, f_AA: 0.25, f_Aa: 0.5, f_aa: 0.25, h: 0.5 })),
};

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

it('выгружает снимок видимого графика без обращения к API', async () => {
  const svg = { title: 'Частоты аллелей', width: 800, height: 310, markup: '<svg/>', notes: [], legend: [] };
  vi.mocked(captureChart).mockReturnValue(svg);
  vi.mocked(downloadChartPng).mockResolvedValue(undefined);
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  const container = { current: document.createElement('div') };
  const { rerender } = render(<ResultsExport result={result} chart={{ container, id: 'alleles', title: svg.title }} />);

  fireEvent.click(screen.getByRole('button', { name: 'Экспорт' }));
  fireEvent.click(screen.getByRole('radio', { name: 'График PNG' }));
  rerender(<ResultsExport result={{ ...result, params: { ...result.params, n: 600 } }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Скачать PNG' }));

  await waitFor(() => expect(downloadChartPng).toHaveBeenCalledWith(svg, 'simulation-N500-T1-alleles'));
  expect(fetchMock).not.toHaveBeenCalled();
});

it('на вкладке без графика оставляет выгрузку таблицы доступной', async () => {
  const blob = new Blob(['csv'], { type: 'text/csv' });
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    headers: new Headers({ 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="result.csv"' }),
    blob: async () => blob,
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<ResultsExport result={result} />);

  fireEvent.click(screen.getByRole('button', { name: 'Экспорт' }));
  expect(screen.getByRole<HTMLInputElement>('radio', { name: 'График PNG' }).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Скачать CSV' }));
  await waitFor(() => expect(downloadFile).toHaveBeenCalledWith(blob, 'result.csv'));
  expect(fetchMock).toHaveBeenCalledWith('/api/export?format=csv', expect.objectContaining({ method: 'POST' }));
});
