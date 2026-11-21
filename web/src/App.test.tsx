import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from './App';

vi.mock('recharts', () => ({
  Area: () => null,
  CartesianGrid: () => null,
  ComposedChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Line: () => null,
  LineChart: ({ data }: { data: unknown[] }) => <div data-testid="line-chart" data-rows={JSON.stringify(data)} />,
  ReferenceLine: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

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

  it('показывает зерно сервера и повторяет прогон с ним', async () => {
    const params = { n: 100, p0: 0.5, generations: 1, drift: { seed: 42 } };
    const rows = [
      { t: 0, p: 0.5, q: 0.5, f_AA: 0.25, f_Aa: 0.5, f_aa: 0.25, h: 0.5, h_theory: 0.5 },
      { t: 1, p: 0.515, q: 0.485, f_AA: 0.265225, f_Aa: 0.49955, f_aa: 0.235225, h: 0.49955, h_theory: 0.4975 },
    ];
    const fetchMock = vi.fn().mockImplementation((url) => Promise.resolve(url === '/health'
      ? { ok: true }
      : { ok: true, json: async () => ({ params, rows, drift_summary: { theoretical_half_life: 138.28257 } }) }));
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    fireEvent.click(screen.getByRole('switch', { name: 'Генетический дрейф' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Численность N' }), { target: { value: '100' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Поколений T' }), { target: { value: '1' } });
    const seed = screen.getByRole<HTMLInputElement>('textbox', { name: 'Зерно генератора' });
    const runButton = screen.getByRole('button', { name: /запустить/i });
    fireEvent.change(seed, { target: { value: '42,5' } });
    fireEvent.click(runButton);
    expect(screen.getByText('Введите целое число от 0 до 4 294 967 295')).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/simulate')).toBe(false);

    fireEvent.change(seed, { target: { value: '' } });
    fireEvent.click(runButton);
    await screen.findByText('≈ 138,3');
    expect(seed.value).toBe('42');
    expect(screen.getByText('Средняя H по теории')).toBeTruthy();
    expect(screen.queryByText(/Параметры изменены/)).toBeNull();

    fireEvent.click(runButton);
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url === '/api/simulate').length).toBe(2));
    const calls = fetchMock.mock.calls.filter(([url]) => url === '/api/simulate');
    expect(calls.map(([, request]) => JSON.parse(request.body).drift)).toEqual([{}, { seed: 42 }]);
  });
});

describe('многократные прогоны', () => {
  const rows = [
    { t: 0, p_mean: 0.5, p05: 0.5, p95: 0.5, h_mean: 0.5, h_theory: 0.5 },
    { t: 100, p_mean: 0.52, p05: 0, p95: 1, h_mean: 0.17, h_theory: 0.183 },
  ];
  const fixation = { count: 50, share: 0.25, mean_generation: 61 };
  const loss = { count: 40, share: 0.2, mean_generation: 60 };

  it('проверяет число прогонов, подставляет полученное зерно и сохраняет результат при навигации', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url, request) => {
      if (url === '/health') return { ok: true };
      const params = JSON.parse(request.body);
      return { ok: true, json: async () => ({ params: { ...params, drift: { seed: 7 } }, rows, trajectories: [], fixation, loss }) };
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Многократные прогоны' }));
    const runs = screen.getByRole('textbox', { name: 'Число прогонов' });
    const seed = screen.getByRole<HTMLInputElement>('textbox', { name: 'Зерно генератора' });
    const run = screen.getByRole('button', { name: /Запустить прогоны/ });
    fireEvent.change(runs, { target: { value: '1001' } });
    fireEvent.click(run);
    expect(screen.getByText('Введите целое число от 10 до 1 000')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.change(runs, { target: { value: '200' } });
    fireEvent.change(seed, { target: { value: '' } });
    fireEvent.click(run);
    await screen.findByText('0,52');
    expect(seed.value).toBe('7');
    const [url, request] = fetchMock.mock.calls[1];
    expect(url).toBe('/api/simulate/batch');
    expect(JSON.parse(request.body)).toEqual({ n: 50, p0: 0.5, generations: 100, runs: 200, drift: {} });
    expect(screen.getByText(/50 из 200 прогонов/)).toBeTruthy();
    expect(screen.queryByText(/Параметры изменены/)).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Гетерозиготность' }));
    expect(screen.getByText('Средняя H по теории')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Моделирование' }));
    fireEvent.click(screen.getByRole('button', { name: 'Многократные прогоны' }));
    expect(screen.getByText('0,52')).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Число прогонов' }), { target: { value: '100' } });
    expect(screen.getByText(/Параметры изменены/)).toBeTruthy();
  });

  it('переносит параметры из одиночного расчета и отправляет включенные факторы', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url, request) => {
      if (url === '/health') return { ok: true };
      const params = JSON.parse(request.body);
      if (url === '/api/simulate') {
        const row = { t: 100, p: 0.8, q: 0.2, f_AA: 0.64, f_Aa: 0.32, f_aa: 0.04, h: 0.32 };
        return { ok: true, json: async () => ({ params, rows: [row] }) };
      }
      return { ok: false, status: 429 };
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    fireEvent.change(screen.getByLabelText('Численность N'), { target: { value: '125' } });
    fireEvent.click(screen.getByRole('switch', { name: 'Миграция' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Генетический дрейф' }));
    fireEvent.click(screen.getByRole('button', { name: /Запустить/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Оценить разброс' }));
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Численность N' }).value).toBe('125');
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Зерно генератора' }).value).toBe('42');
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: /Учесть миграцию/ }).checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Запустить прогоны/ }));
    await screen.findByText(/Сервер занят/);
    const [, request] = fetchMock.mock.calls.find(([url]) => url === '/api/simulate/batch')!;
    expect(JSON.parse(request.body)).toEqual({
      n: 125, p0: 0.5, generations: 100, runs: 200, drift: { seed: 42 }, migration: { m: 0.1, p_m: 0.8 },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url === '/api/simulate/batch')).toHaveLength(2));
    await screen.findByText(/Сервер занят/);
  });
});

describe('сравнение сценариев', () => {
  function renderSimulation() {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url, request) => {
      if (url === '/health') return { ok: true };
      const params = JSON.parse(request.body);
      const p = params.p0;
      const q = 1 - p;
      const rows = Array.from({ length: params.generations + 1 }, (_, t) => ({
        t, p, q, f_AA: p * p, f_Aa: 2 * p * q, f_aa: q * q, h: 2 * p * q,
      }));
      return { ok: true, json: async () => ({ params, rows }) };
    }));
    return render(<App />);
  }

  async function saveRun(p0: string, generations: string) {
    fireEvent.change(screen.getByLabelText('Частота p (A)'), { target: { value: p0 } });
    fireEvent.change(screen.getByLabelText('Поколений T'), { target: { value: generations } });
    fireEvent.click(screen.getByRole('button', { name: /Запустить/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'В сравнение' }));
  }

  it('накладывает расчеты разной длины, переключает показатель и сохраняет видимость после обновления', async () => {
    const { unmount } = renderSimulation();
    await saveRun('0,5', '1');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'В сравнении' }).disabled).toBe(true);
    await saveRun('0,25', '2');
    fireEvent.click(screen.getByRole('button', { name: 'Сравнение сценариев' }));

    const chartRows = () => JSON.parse(screen.getByTestId('line-chart').getAttribute('data-rows')!);
    expect(chartRows().at(-1)).toEqual({ t: 2, s1: null, s2: 0.25 });
    fireEvent.click(screen.getByRole('tab', { name: 'Доля aa' }));
    expect(chartRows()[0]).toEqual({ t: 0, s1: 0.25, s2: 0.5625 });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Показать сценарий 2' }));
    expect(chartRows().at(-1).t).toBe(1);
    expect(screen.getByRole('table', { name: 'Сводная таблица сценариев' })).toBeTruthy();

    unmount();
    renderSimulation();
    fireEvent.click(screen.getByRole('button', { name: 'Сравнение сценариев' }));
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Показать сценарий 2' }).checked).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Удалить сценарий 2' }));
    expect(screen.queryByRole('checkbox', { name: 'Показать сценарий 2' })).toBeNull();
  });

  it('вмещает шесть сценариев и освобождает место после удаления', async () => {
    renderSimulation();
    for (let t = 1; t <= 6; t++) await saveRun('0,5', String(t));
    fireEvent.change(screen.getByLabelText('Поколений T'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: /Запустить/ }));
    const full = await screen.findByRole<HTMLButtonElement>('button', { name: 'Сравнение заполнено' });
    expect(full.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Сравнение сценариев' }));
    expect(screen.getAllByRole('checkbox')).toHaveLength(6);
    fireEvent.click(screen.getByRole('button', { name: 'Удалить сценарий 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'К моделированию' }));
    fireEvent.click(screen.getByRole('button', { name: 'В сравнение' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сравнение сценариев' }));
    expect(screen.getAllByRole('checkbox')).toHaveLength(6);
  });
});

describe('критерий χ²', () => {
  async function showResult(values: (number | undefined)[], firstExceedance?: number) {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url, request) => {
      if (url === '/health') return { ok: true };
      const rows = values.map((chi_square, t) => ({
        t, p: 0.5, q: 0.5, f_AA: 0.25, f_Aa: 0.5, f_aa: 0.25, h: 0.5, chi_square,
      }));
      return {
        ok: true,
        json: async () => ({
          params: JSON.parse(request.body), rows,
          chi_square_summary: { critical_value: 3.84, degrees_of_freedom: 1, first_exceedance_generation: firstExceedance },
        }),
      };
    }));
    render(<App />);
    fireEvent.change(screen.getByLabelText('Поколений T'), { target: { value: String(values.length - 1) } });
    fireEvent.click(screen.getByRole('button', { name: /Запустить/ }));
    fireEvent.click(await screen.findByRole('tab', { name: 'Критерий χ²' }));
  }

  it('показывает первое превышение и выделяет только значения строго выше порога', async () => {
    await showResult([0, 3.84, 3.84001, undefined], 2);
    expect(screen.getByText('Первое превышение в поколении 2')).toBeTruthy();
    expect(screen.getByText(/χ² = 3,84001/)).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Таблица' }));
    const [, , onThreshold, above, undefinedRow] = screen.getAllByRole('row');
    expect(within(onThreshold).getByText('3,84')).toBeTruthy();
    expect(within(onThreshold).queryByText('Выше порога')).toBeNull();
    expect(within(above).getByText('Выше порога')).toBeTruthy();
    expect(within(undefinedRow).getByText('—')).toBeTruthy();
  });

  it('не рисует нулевую кривую, если χ² не определен ни в одном поколении', async () => {
    await showResult([undefined, undefined]);
    expect(screen.getByText('χ² не определяется в этом расчете')).toBeTruthy();
    expect(screen.queryByTestId('line-chart')).toBeNull();
  });
});
