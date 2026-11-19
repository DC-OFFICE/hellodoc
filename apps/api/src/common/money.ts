/** Exact LKR minor-unit arithmetic. Authoritative totals never use binary floats. */

const MONEY_RE = /^\d+(\.\d{1,2})?$/;
const RATE_RE = /^\d{1,3}(\.\d{1,2})?$/;

export function parseMoneyToCents(value: string, label = 'amount'): bigint {
  const trimmed = value.trim();
  if (!MONEY_RE.test(trimmed)) {
    throw new Error(`${label} must be a non-negative amount with at most 2 decimal places`);
  }
  const [whole, frac = ''] = trimmed.split('.');
  return BigInt(whole) * 100n + BigInt(frac.padEnd(2, '0'));
}

export function formatCents(cents: bigint): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const whole = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${whole}.${frac}`;
}

export function parsePercentBps(value: string): bigint {
  const trimmed = value.trim();
  if (!RATE_RE.test(trimmed)) throw new Error('Invalid tax rate');
  const [whole, frac = ''] = trimmed.split('.');
  const bps = BigInt(whole) * 100n + BigInt(frac.padEnd(2, '0'));
  if (bps > 10_000n) throw new Error('Tax rate cannot exceed 100');
  return bps;
}

function roundDiv(numerator: bigint, denominator: bigint): bigint {
  if (numerator < 0n) return -roundDiv(-numerator, denominator);
  return (numerator + denominator / 2n) / denominator;
}

export function lineAmounts(input: {
  quantity: number;
  unitPrice: string;
  discount?: string;
  taxRatePercent?: string | null;
}): { gross: string; discount: string; tax: string; total: string } {
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 99) {
    throw new Error('Quantity must be a whole number from 1 to 99');
  }
  const unit = parseMoneyToCents(input.unitPrice, 'unit price');
  const discount = parseMoneyToCents(input.discount ?? '0', 'discount');
  const gross = unit * BigInt(input.quantity);
  if (discount > gross) throw new Error('Discount cannot exceed the line amount');
  const net = gross - discount;
  let tax = 0n;
  if (input.taxRatePercent) {
    const bps = parsePercentBps(input.taxRatePercent);
    tax = roundDiv(net * bps, 10_000n);
  }
  return {
    gross: formatCents(gross),
    discount: formatCents(discount),
    tax: formatCents(tax),
    total: formatCents(net + tax),
  };
}

export function sumCents(values: string[]): string {
  return formatCents(values.reduce((acc, value) => acc + parseMoneyToCents(value), 0n));
}

export function compareMoney(left: string, right: string): number {
  const a = parseMoneyToCents(left);
  const b = parseMoneyToCents(right);
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function subtractMoney(left: string, right: string): string {
  return formatCents(parseMoneyToCents(left) - parseMoneyToCents(right));
}

export function csvCell(value: string): string {
  let text = value ?? '';
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}
