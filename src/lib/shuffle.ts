/**
 * Return a NEW array with the elements of `input` in random order (Fisher–Yates).
 * Used to randomise quiz question and answer order per attempt so a trainee can't
 * share/brute-force answers by position ("the answer is the 3rd option").
 */
export function shuffle<T>(input: readonly T[]): T[] {
  const a = [...input];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
