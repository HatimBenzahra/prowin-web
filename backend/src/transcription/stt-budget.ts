/** Kept independent from the sibling engine repository; same documented contract. */
export function sttBudget(durationSec: number, env = process.env): number {
  const bounded = (key: string, fallback: number, min: number, max: number) => {
    const value = Number(env[key]);
    return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
  };
  const ceiling = bounded('WHISPER_TIMEOUT_MS', 5_400_000, 60_000, 5_400_000);
  const floor = Math.min(ceiling, bounded('WHISPER_TIMEOUT_MIN_MS', 1_200_000, 60_000, 5_400_000));
  const multiplier = bounded('WHISPER_DURATION_MULTIPLIER', 1.5, 1.5, 5);
  const margin = bounded('WHISPER_TIMEOUT_MARGIN_MS', 600_000, 60_000, 1_200_000);
  return Number.isFinite(durationSec) && durationSec > 0
    ? Math.min(ceiling, Math.max(floor, durationSec * 1000 * multiplier + margin)) : ceiling;
}
