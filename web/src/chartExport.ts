type LegendItem = { label: string; color: string; shape: 'line' | 'dash' | 'dot' | 'area'; opacity: number };

export type ChartSnapshot = {
  markup: string;
  width: number;
  height: number;
  title: string;
  notes: string[];
  legend: LegendItem[];
};

const WIDTH = 930;
const SCALE = 2;
const PADDING = 26;
const CONTENT_WIDTH = WIDTH - 2 * PADDING;
const FONT = 'Arial, sans-serif';
const LEGEND_FONT = `13px ${FONT}`;
const NOTE_FONT = `12px ${FONT}`;

export function captureChart(container: HTMLElement | null, title: string, notes: string[]): ChartSnapshot | null {
  if (!container) return null;
  const svg = container.querySelector<SVGSVGElement>('.chart-wrap svg.recharts-surface');
  if (!svg) return null;
  const { width, height } = svg.viewBox.baseVal;
  if (width <= 0 || height <= 0) return null;

  const copy = svg.cloneNode(true) as SVGSVGElement;
  copy.removeAttribute('style');
  copy.setAttribute('width', String(width));
  copy.setAttribute('height', String(height));
  const labels = svg.querySelectorAll('text');
  copy.querySelectorAll('text').forEach((label, index) => {
    const computed = getComputedStyle(labels[index]);
    label.style.fontFamily = FONT;
    label.style.fontSize = computed.fontSize;
    label.style.fontWeight = computed.fontWeight;
    label.style.paintOrder = computed.paintOrder;
    label.style.stroke = computed.stroke;
    label.style.strokeWidth = computed.strokeWidth;
    label.style.strokeLinejoin = computed.strokeLinejoin;
  });
  copy.querySelectorAll('.recharts-tooltip-cursor, .recharts-active-dot').forEach((element) => element.remove());

  const legend = Array.from(container.querySelectorAll('.legend > span')).flatMap((entry): LegendItem[] => {
    const swatch = entry.querySelector('i');
    const label = entry.textContent?.trim();
    if (!swatch || !label) return [];
    const style = getComputedStyle(swatch);
    if (style.borderTopStyle === 'dashed') {
      return [{ label, color: style.borderTopColor, shape: 'dash', opacity: Number(style.opacity) }];
    }
    const shape = swatch.classList.contains('range-key') ? 'area'
      : swatch.classList.contains('chi-square-marker') ? 'dot' : 'line';
    return [{ label, color: style.backgroundColor, shape, opacity: Number(style.opacity) }];
  });

  return { markup: new XMLSerializer().serializeToString(copy), width, height, title, notes, legend };
}

function wrapText(context: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of text.trim().split(/\s+/)) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && context.measureText(candidate).width > width) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function layoutLegend(context: CanvasRenderingContext2D, legend: LegendItem[]) {
  context.font = LEGEND_FONT;
  let x = 0;
  let row = 0;
  return legend.map((item) => {
    const width = context.measureText(item.label).width + 42;
    if (x && x + width > CONTENT_WIDTH) {
      x = 0;
      row++;
    }
    const positioned = { ...item, x, row };
    x += width;
    return positioned;
  });
}

function drawLegendSwatch(context: CanvasRenderingContext2D, item: LegendItem, x: number, y: number) {
  context.save();
  context.globalAlpha = item.opacity;
  context.fillStyle = item.color;
  context.strokeStyle = item.color;
  if (item.shape === 'dot') {
    context.beginPath();
    context.arc(x + 9, y, 4, 0, 2 * Math.PI);
    context.fill();
  } else if (item.shape === 'area') {
    context.fillRect(x, y - 4, 18, 8);
  } else {
    if (item.shape === 'dash') context.setLineDash([4, 3]);
    context.lineWidth = 2.5;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + 18, y);
    context.stroke();
  }
  context.restore();
}

export function downloadFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export async function downloadChartPng(chart: ChartSnapshot, filenamePrefix: string): Promise<void> {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Браузер не смог подготовить изображение.');

  const plotWidth = Math.min(CONTENT_WIDTH, chart.width * 2);
  const plotHeight = plotWidth * chart.height / chart.width;
  const legend = layoutLegend(context, chart.legend);
  const legendRows = (legend.at(-1)?.row ?? -1) + 1;
  context.font = NOTE_FONT;
  const notes = chart.notes.flatMap((note) => wrapText(context, note, CONTENT_WIDTH));
  const plotTop = PADDING + 35;
  const legendTop = plotTop + plotHeight + 16;
  const notesTop = legendTop + legendRows * 21 + (notes.length ? 8 : 0);
  const height = Math.ceil(notesTop + notes.length * 18 + PADDING - 6);
  canvas.width = WIDTH * SCALE;
  canvas.height = height * SCALE;
  context.scale(SCALE, SCALE);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, WIDTH, height);
  context.fillStyle = '#202d3d';
  context.font = `bold 23px ${FONT}`;
  context.textBaseline = 'top';
  context.fillText(chart.title, PADDING, PADDING, CONTENT_WIDTH);

  const url = URL.createObjectURL(new Blob([chart.markup], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Браузер не смог прочитать график.'));
      image.src = url;
    });
    context.drawImage(image, (WIDTH - plotWidth) / 2, plotTop, plotWidth, plotHeight);
  } finally {
    URL.revokeObjectURL(url);
  }

  context.textBaseline = 'middle';
  context.font = LEGEND_FONT;
  context.fillStyle = '#435468';
  for (const item of legend) {
    const x = PADDING + item.x;
    const y = legendTop + item.row * 21;
    drawLegendSwatch(context, item, x, y);
    context.fillText(item.label, x + 25, y);
  }
  context.textBaseline = 'top';
  context.font = NOTE_FONT;
  for (const [index, text] of notes.entries()) context.fillText(text, PADDING, notesTop + index * 18);

  const png = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Не удалось сформировать файл PNG.')), 'image/png');
  });
  const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
  downloadFile(png, `hardy-weinberg-${filenamePrefix}-${id}.png`);
}
