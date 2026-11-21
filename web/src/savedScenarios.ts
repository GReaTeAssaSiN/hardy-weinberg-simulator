import type { SimulationResult } from './types';

export type SavedScenario = {
  id: number;
  visible: boolean;
  result: SimulationResult;
};

export const MAX_SCENARIOS = 6;
const STORAGE_KEY = 'hardy-weinberg.scenarios.v1';

export function scenarioName(id: number): string {
  return `Сценарий ${id}`;
}

export function loadScenarios(): SavedScenario[] {
  try {
    const data = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '[]');
    if (Array.isArray(data)) {
      return data.filter((entry) => entry?.result?.params && Array.isArray(entry.result.rows)
        && entry.result.rows.length > 0 && Number.isInteger(entry.id)
        && entry.id >= 1 && entry.id <= MAX_SCENARIOS && typeof entry.visible === 'boolean').slice(0, MAX_SCENARIOS);
    }
  } catch {
    // Сравнение доступно и без браузерного хранилища.
  }
  return [];
}

export function storeScenarios(scenarios: SavedScenario[]): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(scenarios));
  } catch {
    // Текущий список остается в состоянии приложения.
  }
}
