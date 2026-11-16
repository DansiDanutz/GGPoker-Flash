export const SPIN_WHEEL_MULTIPLIERS = [2, 3, 4, 5, 10, 50, 100, 20000] as const;
export const SPIN_WHEEL_DISPLAY_ORDER = [6, 2, 4, 0, 1, 5, 3, 7] as const;

export type SpinPresentationStage = 'wheel' | 'insurance' | 'ready' | 'complete';

export function spinRenderedMultipliers(multipliers?: readonly number[]): readonly number[] {
  return multipliers || SPIN_WHEEL_DISPLAY_ORDER.map((index) => SPIN_WHEEL_MULTIPLIERS[index]);
}

export function spinTargetIndex(multiplier: number, multipliers?: readonly number[]): number {
  const labels = spinRenderedMultipliers(multipliers);
  const renderedIndex = labels.indexOf(multiplier);
  if (renderedIndex < 0 || !labels.length) throw new RangeError('Unknown Spin multiplier');
  return renderedIndex;
}

export function spinWheelRotation(multiplier: number, multipliers?: readonly number[]): number {
  const count = spinRenderedMultipliers(multipliers).length;
  return 1800 - spinTargetIndex(multiplier, multipliers) * (360 / count);
}

export function spinPresentationStage(acknowledgements: readonly string[], insured: boolean): SpinPresentationStage {
  if (!acknowledgements.includes('wheel')) return 'wheel';
  if (insured && !acknowledgements.includes('insurance')) return 'insurance';
  if (!acknowledgements.includes('ready')) return 'ready';
  return 'complete';
}
