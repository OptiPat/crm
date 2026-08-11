/** Répartit une saisie / autofill iOS (souvent 6 chiffres dans la 1ʳᵉ case). */
export function distributeOtpInput(
  current: string,
  index: number,
  raw: string
): string {
  const cleaned = raw.replace(/\D/g, "");
  if (!cleaned) {
    const chars = Array.from({ length: 6 }, (_, i) => current[i] ?? "");
    chars[index] = "";
    return chars.join("");
  }
  if (cleaned.length > 1) {
    if (index === 0) return cleaned.slice(0, 6);
    return `${current.slice(0, index)}${cleaned}`.replace(/\D/g, "").slice(0, 6);
  }
  const chars = Array.from({ length: 6 }, (_, i) => current[i] ?? "");
  chars[index] = cleaned;
  return chars.join("").replace(/\D/g, "").slice(0, 6);
}
