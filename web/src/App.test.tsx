import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';

vi.mock('recharts', () => ({
  CartesianGrid: () => null,
  Line: () => null,
  LineChart: () => <div>Тестовый график</div>,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('моделирование популяции', () => {
  it('не отправляет расчет при неверной частоте', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText('Частота p (A)'), { target: { value: '1,5' } });
    fireEvent.click(screen.getByRole('button', { name: /запустить/i }));
    expect(screen.getByText('Введите число от 0 до 1')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('передает параметры серверу, показывает ответ и отмечает изменение формы', async () => {
    const rows = [
      { t: 0, p: 0.3, q: 0.7, f_AA: 0.09, f_Aa: 0.42, f_aa: 0.49, h: 0.42 },
      { t: 1, p: 0.3, q: 0.7, f_AA: 0.09, f_Aa: 0.42, f_aa: 0.49, h: 0.42 },
    ];
    const fetchMock = vi.fn().mockImplementation((url) => Promise.resolve(url === '/health'
      ? { ok: true }
      : { ok: true, json: async () => ({ params: { n: 500, p0: 0.3, generations: 1 }, rows }) }));
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    fireEvent.change(screen.getByLabelText('Частота p (A)'), { target: { value: '0,3' } });
    fireEvent.change(screen.getByLabelText('Поколений T'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /запустить/i }));
    await screen.findByText(/Параметры расчета:/);
    const call = fetchMock.mock.calls.find(([url]) => url === '/api/simulate');
    expect(JSON.parse(call![1].body)).toEqual({ n: 500, p0: 0.3, generations: 1 });
    expect(screen.getByText(/максимальное за весь расчет/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Частота p (A)'), { target: { value: '0,4' } });
    expect(screen.getByText(/Параметры изменены/)).toBeTruthy();
  });

  it('проверяет поля миграции, передает их и отмечает старый результат при выключении фактора', async () => {
    const params = { n: 500, p0: 0.3, generations: 1, migration: { m: 0.1, p_m: 0.8 } };
    const rows = [
      { t: 0, p: 0.3, q: 0.7, f_AA: 0.09, f_Aa: 0.42, f_aa: 0.49, h: 0.42 },
      { t: 1, p: 0.35, q: 0.65, f_AA: 0.1225, f_Aa: 0.455, f_aa: 0.4225, h: 0.455 },
    ];
    const fetchMock = vi.fn().mockImplementation((url) => Promise.resolve(url === '/health'
      ? { ok: true }
      : { ok: true, json: async () => ({ params, rows }) }));
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    const migrationSwitch = screen.getByRole('switch', { name: 'Миграция' });
    expect(screen.queryByRole('textbox', { name: 'Доля мигрантов m' })).toBeNull();
    fireEvent.click(migrationSwitch);
    const m = screen.getByRole('textbox', { name: 'Доля мигрантов m' });
    const runButton = screen.getByRole('button', { name: /запустить/i });
    fireEvent.change(screen.getByLabelText('Частота p (A)'), { target: { value: '0,3' } });
    fireEvent.change(screen.getByLabelText('Поколений T'), { target: { value: '1' } });
    fireEvent.change(m, { target: { value: '1,1' } });
    fireEvent.click(runButton);
    expect(screen.getByText('Введите число от 0 до 1')).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/simulate')).toBe(false);

    fireEvent.change(m, { target: { value: '0,1' } });
    fireEvent.click(runButton);
    await screen.findByText(/миграция \(m = 0,1, pₘ = 0,8\)/);
    expect(screen.getByText('0,35')).toBeTruthy();
    const call = fetchMock.mock.calls.find(([url]) => url === '/api/simulate');
    expect(JSON.parse(call![1].body)).toEqual(params);

    fireEvent.click(migrationSwitch);
    expect(screen.queryByRole('textbox', { name: 'Доля мигрантов m' })).toBeNull();
    expect(screen.getByText(/Параметры изменены/)).toBeTruthy();
  });
});
