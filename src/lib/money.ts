import { Prisma } from '@prisma/client';

export { Prisma };

export type DecimalLike = Prisma.Decimal | number | string;

/**
 * Coerces any numeric or string representation into a precise Prisma.Decimal instance
 * rounded to 2 decimal places using half-up rounding.
 */
export function toDecimal(val: DecimalLike): Prisma.Decimal {
  if (val instanceof Prisma.Decimal) {
    return val.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  }
  if (typeof val === 'number') {
    // Avoid binary float string artifacts like 19.990000000000002
    return new Prisma.Decimal(val.toFixed(2)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  }
  return new Prisma.Decimal(val).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/**
 * Explicit DTO serializer: converts a Decimal, number, or string to a standard
 * JavaScript primitive number with 2 decimal places for JSON API responses and RSC compatibility.
 */
export function toMoneyNumber(val: DecimalLike | null | undefined): number {
  if (val === null || val === undefined) return 0;
  if (val instanceof Prisma.Decimal) {
    return val.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toNumber();
  }
  if (typeof val === 'number') {
    return Math.round(val * 100) / 100;
  }
  const d = new Prisma.Decimal(val);
  return d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toNumber();
}

/**
 * Explicit DTO serializer: converts to standard currency string "$xx.xx" or "xx.xx"
 */
export function toMoneyString(val: DecimalLike | null | undefined, includeSymbol = false): string {
  const num = toMoneyNumber(val);
  const formatted = num.toFixed(2);
  return includeSymbol ? `$${formatted}` : formatted;
}

/**
 * Converts a monetary amount to integer cents (e.g. $10.50 -> 1050).
 */
export function moneyCents(val: DecimalLike): number {
  const d = toDecimal(val);
  return d.times(100).round().toNumber();
}

/**
 * Exact Decimal addition rounded to 2 decimal places.
 */
export function moneyAdd(a: DecimalLike, b: DecimalLike): Prisma.Decimal {
  return toDecimal(a).plus(toDecimal(b)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/**
 * Exact Decimal subtraction rounded to 2 decimal places.
 */
export function moneySub(a: DecimalLike, b: DecimalLike): Prisma.Decimal {
  return toDecimal(a).minus(toDecimal(b)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/**
 * Exact Decimal multiplication rounded to 2 decimal places.
 */
export function moneyMul(a: DecimalLike, b: DecimalLike): Prisma.Decimal {
  return toDecimal(a).times(toDecimal(b)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/**
 * Exact Decimal division rounded to 2 decimal places.
 */
export function moneyDiv(a: DecimalLike, b: DecimalLike): Prisma.Decimal {
  return toDecimal(a).dividedBy(toDecimal(b)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/**
 * Checks if a value is strictly positive (> 0.00).
 */
export function isPositiveMoney(val: DecimalLike): boolean {
  return toDecimal(val).greaterThan(0);
}

/**
 * Checks if a value is non-negative (>= 0.00).
 */
export function isNonNegativeMoney(val: DecimalLike): boolean {
  return toDecimal(val).greaterThanOrEqualTo(0);
}

// ============================================================================
// EXPLICIT DTO SERIALIZERS FOR API BOUNDARIES
// ============================================================================

export function serializeOffender<T extends Record<string, any>>(offender: T | null | undefined): T | null {
  if (!offender) return null;
  const copy: any = { ...offender };
  if ('balance' in copy) copy.balance = toMoneyNumber(copy.balance);
  if ('weeklyLimit' in copy) copy.weeklyLimit = toMoneyNumber(copy.weeklyLimit);
  if ('currentWeeklySpent' in copy) copy.currentWeeklySpent = toMoneyNumber(copy.currentWeeklySpent);
  if (copy.facility) copy.facility = serializeFacility(copy.facility);
  return copy as T;
}

export function serializeOrderItem<T extends Record<string, any>>(item: T | null | undefined): T | null {
  if (!item) return null;
  const copy: any = { ...item };
  if ('unitPrice' in copy) copy.unitPrice = toMoneyNumber(copy.unitPrice);
  if ('totalPrice' in copy) copy.totalPrice = toMoneyNumber(copy.totalPrice);
  if (copy.product) copy.product = serializeProduct(copy.product);
  return copy as T;
}

export function serializeOrder<T extends Record<string, any>>(order: T | null | undefined): T | null {
  if (!order) return null;
  const copy: any = { ...order };
  if ('subtotal' in copy) copy.subtotal = toMoneyNumber(copy.subtotal);
  if ('tax' in copy) copy.tax = toMoneyNumber(copy.tax);
  if ('total' in copy) copy.total = toMoneyNumber(copy.total);
  if (Array.isArray(copy.items)) {
    copy.items = copy.items.map(serializeOrderItem);
  }
  return copy as T;
}

export function serializeProduct<T extends Record<string, any>>(product: T | null | undefined): T | null {
  if (!product) return null;
  const copy: any = { ...product };
  if ('price' in copy) copy.price = toMoneyNumber(copy.price);
  return copy as T;
}

export function serializeDeposit<T extends Record<string, any>>(deposit: T | null | undefined): T | null {
  if (!deposit) return null;
  const copy: any = { ...deposit };
  if ('amount' in copy) copy.amount = toMoneyNumber(copy.amount);
  if ('fee' in copy) copy.fee = toMoneyNumber(copy.fee);
  if ('totalPaid' in copy) copy.totalPaid = toMoneyNumber(copy.totalPaid);
  return copy as T;
}

export function serializeLedgerEntry<T extends Record<string, any>>(entry: T | null | undefined): T | null {
  if (!entry) return null;
  const copy: any = { ...entry };
  if ('debit' in copy) copy.debit = toMoneyNumber(copy.debit);
  if ('credit' in copy) copy.credit = toMoneyNumber(copy.credit);
  if ('balanceBefore' in copy) copy.balanceBefore = toMoneyNumber(copy.balanceBefore);
  if ('balanceAfter' in copy) copy.balanceAfter = toMoneyNumber(copy.balanceAfter);
  return copy as T;
}

export function serializeFacility<T extends Record<string, any>>(facility: T | null | undefined): T | null {
  if (!facility) return null;
  const copy: any = { ...facility };
  if ('maxWeeklySpend' in copy) copy.maxWeeklySpend = toMoneyNumber(copy.maxWeeklySpend);
  if ('maxDepositAmount' in copy) copy.maxDepositAmount = toMoneyNumber(copy.maxDepositAmount);
  return copy as T;
}

export function serializeGiftPackage<T extends Record<string, any>>(pkg: T | null | undefined): T | null {
  if (!pkg) return null;
  const copy: any = { ...pkg };
  if ('totalValue' in copy) copy.totalValue = toMoneyNumber(copy.totalValue);
  return copy as T;
}
