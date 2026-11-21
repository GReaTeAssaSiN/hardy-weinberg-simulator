import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';

vi.mock('recharts', () => ({
  CartesianGrid: () => null,
  Line: () => null,
  LineChart: () => <div>Тестовый график</div>,
  ReferenceLine: () => null,
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

  it('отправляет параметры отбора и отображает поколение достижения цели из API', async () => {
    const params = { n: 500, p0: 0.3, generations: 100, selection: { w11: 1, w12: 1, w22: 0.6, target_p: 0.95 } };
    const rows = [
      { t: 0, p: 0.3, q: 0.7, f_AA: 0.09, f_Aa: 0.42, f_aa: 0.49, h: 0.42 },
      { t: 100, p: 0.974, q: 0.026, f_AA: 0.949, f_Aa: 0.05, f_aa: 0.001, h: 0.05 },
    ];
    const fetchMock = vi.fn().mockImplementation((url) => Promise.resolve(url === '/health'
      ? { ok: true }
      : { ok: true, json: async () => ({ params, rows, target_generation: 53 }) }));
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    fireEvent.click(screen.getByRole('switch', { name: 'Отбор' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Частота p (A)' }), { target: { value: '0,3' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'w₂₂ (aa)' }), { target: { value: '0,6' } });
    const target = screen.getByRole('textbox', { name: 'Целевая частота p*' });
    fireEvent.change(target, { target: { value: '0,95' } });
    fireEvent.click(screen.getByRole('button', { name: /запустить/i }));

    await screen.findByText('t = 53');
    const call = fetchMock.mock.calls.find(([url]) => url === '/api/simulate');
    expect(JSON.parse(call![1].body)).toEqual(params);
    fireEvent.change(target, { target: { value: '0,99' } });
    expect(screen.getByText(/Параметры изменены/)).toBeTruthy();
    expect(screen.getByText('Достижение p* = 0,95')).toBeTruthy();
  });

  it('проверяет F и показывает отдельно фактическую долю Aa и ожидаемую H', async () => {
    const params = { n: 500, p0: 0.5, generations: 1, inbreeding: { f: 0.25 } };
    const rows = [
      { t: 0, p: 0.5, q: 0.5, f_AA: 0.25, f_Aa: 0.5, f_aa: 0.25, h: 0.5 },
      { t: 1, p: 0.5, q: 0.5, f_AA: 0.3125, f_Aa: 0.375, f_aa: 0.3125, h: 0.5 },
    ];
    const fetchMock = vi.fn().mockImplementation((url) => Promise.resolve(url === '/health'
      ? { ok: true }
      : { ok: true, json: async () => ({ params, rows }) }));
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    fireEvent.click(screen.getByRole('switch', { name: 'Неслучайное скрещивание' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Поколений T' }), { target: { value: '1' } });
    const factor = screen.getByRole('textbox', { name: 'Коэффициент инбридинга F' });
    const runButton = screen.getByRole('button', { name: /запустить/i });
    fireEvent.change(factor, { target: { value: '1,1' } });
    fireEvent.click(runButton);
    expect(screen.getByText('Введите число от 0 до 1')).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/simulate')).toBe(false);

    fireEvent.change(factor, { target: { value: '0,25' } });
    fireEvent.click(runButton);
    await screen.findByText('0,625');
    const call = fetchMock.mock.calls.find(([url]) => url === '/api/simulate');
    expect(JSON.parse(call![1].body)).toEqual(params);
    expect(screen.getByText('0,375')).toBeTruthy();
    expect(screen.getByText('ожидаемая H = 2pq: 0,5')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Генотипы' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('tab', { name: 'Гетерозиготность' }));
    expect(screen.getByText('Доля Aa при заданном F')).toBeTruthy();
    expect(screen.getByText('Ожидаемая H = 2pq')).toBeTruthy();
    fireEvent.change(factor, { target: { value: '1' } });
    expect(screen.getByText(/Параметры изменены/)).toBeTruthy();
  });
});
