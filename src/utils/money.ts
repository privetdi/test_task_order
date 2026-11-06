export function parseRub(raw: unknown): number {
  if (typeof raw === "string" && !/^\d+(?:\.\d+)?$/.test(raw.trim())) {
    throw new Error(`invalid amount: ${JSON.stringify(raw)}`);
  }
  const value = typeof raw === "string" ? Number(raw.trim()) : raw;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`invalid amount: ${JSON.stringify(raw)}`);
  }
  return value;
}

function convert(rub: number, round: boolean): number {
  if (!Number.isFinite(rub) || rub < 0) throw new Error("invalid amount");
  const [mantissa, exponent = "0"] = String(rub).toLowerCase().split("e");
  const [whole, fraction = ""] = mantissa.split(".");
  const digits = BigInt(whole + fraction);
  const shift = Number(exponent) - fraction.length + 2;
  const divisor = 10n ** BigInt(Math.max(0, -shift));
  const kop = shift >= 0 ? digits * 10n ** BigInt(shift)
    : (digits + (round ? divisor / 2n : 0n)) / divisor;
  if (kop > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("amount exceeds safe integer range");
  return Number(kop);
}

export function toKop(rub: number): number {
  return convert(rub, false);
}

export function roundKop(rub: number): number {
  return convert(rub, true);
}

export function discountedKop(amountKop: number, percent: number): number {
  if (!Number.isSafeInteger(amountKop) || amountKop < 0 || !Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new Error("invalid discount");
  }
  const [mantissa, exponent = "0"] = String(percent).toLowerCase().split("e");
  const [whole, fraction = ""] = mantissa.split(".");
  const scale = Math.max(0, fraction.length - Number(exponent));
  const denominator = 100n * 10n ** BigInt(scale);
  const discount = BigInt(whole + fraction) * 10n ** BigInt(Math.max(0, Number(exponent) - fraction.length));
  const numerator = BigInt(amountKop) * (denominator - discount);
  return Number((numerator + denominator / 2n) / denominator);
}

export function fromKop(kop: number): number {
  return kop / 100;
}
