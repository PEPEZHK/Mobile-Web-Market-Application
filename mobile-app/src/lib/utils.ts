import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(
  value: number,
  options?: { showSymbol?: boolean; fractionDigits?: number }
) {
  const safeValue = Number.isFinite(value) ? value : 0;
  const digits = options?.fractionDigits ?? 2;
  const formatted = safeValue.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
  if (options?.showSymbol === false) {
    return formatted;
  }
  return `TM ${formatted}`;
}
