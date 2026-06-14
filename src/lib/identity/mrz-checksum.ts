const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ<";

/** Chiffre de contrôle ICAO 9303 (7-3-1). */
export function mrzCheckDigit(data: string): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const value = CHARS.indexOf(data[i]?.toUpperCase() ?? "");
    if (value < 0) return -1;
    sum += value * [7, 3, 1][i % 3]!;
  }
  return sum % 10;
}

export function mrzCheckDigitValid(data: string, digitChar: string): boolean {
  const expected = mrzCheckDigit(data);
  if (expected < 0) return false;
  const actual = parseInt(digitChar, 10);
  return Number.isInteger(actual) && actual === expected;
}
