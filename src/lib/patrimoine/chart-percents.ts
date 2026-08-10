/** Répartition en % entiers qui totalisent exactement 100 (méthode des plus grands restes). */
export function distributeIntegerPercents(values: number[]): number[] {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return values.map(() => 0);

  const raw = values.map((value) => (value / total) * 100);
  const floors = raw.map((percent) => Math.floor(percent));
  let remaining = 100 - floors.reduce((sum, percent) => sum + percent, 0);

  const byRemainder = raw
    .map((percent, index) => ({ index, remainder: percent - Math.floor(percent) }))
    .sort((a, b) => b.remainder - a.remainder);

  const percents = [...floors];
  for (let i = 0; i < remaining; i++) {
    percents[byRemainder[i].index]++;
  }

  return percents;
}
