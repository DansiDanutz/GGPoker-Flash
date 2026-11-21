// Integer hundredths keep the displayed multiplier and the credited amount in sync.
export function crashPoint(draw, scale) {
  return Math.min(5000, Math.floor(100 * scale / draw));
}

export function crashAt(point, elapsedMs) {
  const elapsed = Math.max(0, elapsedMs);
  const crashed = elapsed >= Math.log(point / 100) * 1800;
  return { crashed, hundredths: crashed ? point : Math.min(point - 1, Math.floor(100 * Math.exp(elapsed / 1800))) };
}
