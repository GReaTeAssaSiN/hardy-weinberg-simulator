import { Tooltip } from '@mui/material';
import type { AdditionalFactors } from './types';

const number = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 4 });
const MAX_SEED = 2 ** 32 - 1;

export const display = (value: number) => number.format(value);
export const integer = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
export const oneDecimal = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
export const SEED_ERROR = 'Введите целое число от 0 до 4 294 967 295';

export function parseDecimal(value: string): number {
  const normalized = value.trim().replace(',', '.');
  return /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized) ? Number(normalized) : NaN;
}

export function parseSeed(value: string): number | undefined {
  const raw = value.trim();
  if (!raw) return undefined;
  const seed = Number(raw);
  return /^\d+$/.test(raw) && seed <= MAX_SEED ? seed : NaN;
}

export function generationTicks(last: number): number[] {
  const intervals = Math.min(5, last);
  return intervals > 0
    ? Array.from({ length: intervals + 1 }, (_, index) => Math.round(index * last / intervals))
    : [0];
}

export function describeFactors({ migration, selection, inbreeding }: AdditionalFactors): string[] {
  const factors = [];
  if (migration) factors.push(`миграция (m = ${display(migration.m)}, pₘ = ${display(migration.p_m)})`);
  if (selection) factors.push(`отбор (w₁₁ = ${display(selection.w11)}, w₁₂ = ${display(selection.w12)}, w₂₂ = ${display(selection.w22)}, p* = ${display(selection.target_p)})`);
  if (inbreeding) factors.push(`инбридинг (F = ${display(inbreeding.f)})`);
  return factors;
}

export function Info({ text }: { text: string }) {
  return <Tooltip title={text} arrow><span className="info" aria-label={text} tabIndex={0}>?</span></Tooltip>;
}

export function ParamLabel({ label, info }: { label: string; info: string }) {
  return <span className="field-label">{label} <Info text={info} /></span>;
}
