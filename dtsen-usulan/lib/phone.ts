const PLACEHOLDER_DOMAIN = "dtsen-solok.internal";

export function normalizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = "62" + digits.slice(1);
  if (digits.startsWith("620")) digits = "62" + digits.slice(3);
  return digits;
}

export function emailFromPhone(phoneDigits: string): string {
  return `hp${phoneDigits}@${PLACEHOLDER_DOMAIN}`;
}
