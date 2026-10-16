/** Φ(z) aproximada (Abramowitz y Stegun). */
export function normalCdf(z: number): number {
  if (z < -8) return 0;
  if (z > 8) return 1;
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const density = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const poly = t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const tail = density * poly;
  const cdf = z >= 0 ? 1 - tail : tail;
  return Math.min(1, Math.max(0, cdf));
}

export interface CompletionOdds {
  z: number | null;
  probability: number;
  certain: boolean;
}

/** P(T ≤ objetivo) con T ~ N(μ, σ²) de la ruta crítica. */
export function completionProbability(targetWeeks: number, mean: number, stdDev: number): CompletionOdds {
  if (stdDev <= 1e-9) {
    return { z: null, probability: targetWeeks + 1e-9 >= mean ? 1 : 0, certain: true };
  }
  const z = (targetWeeks - mean) / stdDev;
  return { z, probability: normalCdf(z), certain: false };
}
