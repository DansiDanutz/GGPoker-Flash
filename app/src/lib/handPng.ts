// Draws the hand-detail text onto a canvas and downloads it as a PNG. No library: the
// modal content is rendered from the same lines the export text test covers.

const PNG_WIDTH = 900;
const PADDING = 28;
const LINE_HEIGHT = 24;
const TITLE_SIZE = 22;
const BODY_SIZE = 15;
const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const COLORS = { background: '#141a20', title: '#ffd98a', body: '#e6e6e6', footer: '#7d8790' };

/** Splits a line so it fits the canvas width. */
function wrap(ctx: CanvasRenderingContext2D, line: string, maxWidth: number): string[] {
  if (!line || ctx.measureText(line).width <= maxWidth) return [line];
  const out: string[] = [];
  let current = '';
  for (const word of line.split(' ')) {
    const next = current ? `${current} ${word}` : word;
    if (current && ctx.measureText(next).width > maxWidth) {
      out.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) out.push(current);
  return out;
}

/** Renders the lines and resolves with a PNG blob. */
export function renderHandPng(lines: readonly string[], footer: string): Promise<Blob> {
  const scale = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const measure = document.createElement('canvas').getContext('2d');
  if (!measure) return Promise.reject(new Error('Canvas is not available in this browser'));
  measure.font = `${BODY_SIZE}px ${FONT}`;
  const [title, ...rest] = lines;
  const body = rest.flatMap((l) => wrap(measure, l, PNG_WIDTH - PADDING * 2));
  const height = PADDING * 2 + TITLE_SIZE + 12 + (body.length + 2) * LINE_HEIGHT;

  const canvas = document.createElement('canvas');
  canvas.width = PNG_WIDTH * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Canvas is not available in this browser'));
  ctx.scale(scale, scale);
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, PNG_WIDTH, height);
  ctx.textBaseline = 'top';
  ctx.fillStyle = COLORS.title;
  ctx.font = `bold ${TITLE_SIZE}px ${FONT}`;
  ctx.fillText(title ?? '', PADDING, PADDING);
  ctx.fillStyle = COLORS.body;
  ctx.font = `${BODY_SIZE}px ${FONT}`;
  let y = PADDING + TITLE_SIZE + 12;
  for (const line of body) {
    ctx.fillText(line, PADDING, y);
    y += LINE_HEIGHT;
  }
  ctx.fillStyle = COLORS.footer;
  ctx.fillText(footer, PADDING, y + LINE_HEIGHT);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG export failed'))), 'image/png');
  });
}

/** Saves a blob under the given file name. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
