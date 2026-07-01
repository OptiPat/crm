/** Chiffres internationaux sans « + » pour wa.me / sms: (ex. 33612345678). */

function stripInternationalPrefix(digits: string): string {
  if (digits.startsWith("00") && digits.length > 4) {
    return digits.slice(2);
  }
  return digits;
}

function frenchInternationalMobile(digits: string): string | null {
  if (digits.length !== 11 || !digits.startsWith("33")) return null;
  if (digits[2] !== "6" && digits[2] !== "7") return null;
  return digits;
}

function frenchDomesticMobileToInternational(digits: string): string | null {
  if (digits.length !== 10 || !digits.startsWith("0")) return null;
  if (digits[1] !== "6" && digits[1] !== "7") return null;
  return `33${digits.slice(1)}`;
}

function frenchNineDigitMobile(digits: string): string | null {
  if (digits.length !== 9 || (digits[0] !== "6" && digits[0] !== "7")) return null;
  return `33${digits}`;
}

/** Mobile UK saisi en 07… (11 chiffres) → 447… */
function ukDomesticMobileToInternational(digits: string): string | null {
  if (digits.length !== 11 || !digits.startsWith("07")) return null;
  return `44${digits.slice(1)}`;
}

function isFrenchLandlineDigits(digits: string): boolean {
  if (digits.length === 10 && digits.startsWith("0")) {
    return digits[1] !== "6" && digits[1] !== "7";
  }
  if (digits.length === 11 && digits.startsWith("33")) {
    return digits[2] !== "6" && digits[2] !== "7";
  }
  return false;
}

function isValidInternationalDigits(digits: string): boolean {
  return digits.length >= 10 && digits.length <= 15;
}

export function phoneDigitsForMessagingUrl(telephone?: string | null): string | null {
  const raw = String(telephone ?? "").replace(/\D/g, "");
  if (!raw) return null;

  const digits = stripInternationalPrefix(raw);

  const frenchMobile =
    frenchInternationalMobile(digits) ??
    frenchDomesticMobileToInternational(digits) ??
    frenchNineDigitMobile(digits);
  if (frenchMobile) return frenchMobile;

  if (isFrenchLandlineDigits(digits)) return null;

  const ukMobile = ukDomesticMobileToInternational(digits);
  if (ukMobile) return ukMobile;

  if (isValidInternationalDigits(digits)) return digits;

  return null;
}

export function hasMessagingPhone(telephone?: string | null): boolean {
  return phoneDigitsForMessagingUrl(telephone) != null;
}

export function buildSmsUrl(telephone: string, body: string): string | null {
  const digits = phoneDigitsForMessagingUrl(telephone);
  if (!digits) return null;
  return `sms:+${digits}?body=${encodeURIComponent(body)}`;
}

export function buildWhatsAppUrl(telephone: string, body: string): string | null {
  const digits = phoneDigitsForMessagingUrl(telephone);
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(body)}`;
}
