import type { ProductUnit } from "../types";

type TranslationValues = Record<string, string | number>;
type Translator = (key: string, options?: { defaultValue?: string; values?: TranslationValues }) => string;

const QUANTITY_EPSILON = 0.000001;

export function isMataCategory(category: string | null | undefined): boolean {
  return (category ?? "").trim().toLowerCase() === "mata";
}

export function resolveProductUnit(category: string | null | undefined): ProductUnit {
  return isMataCategory(category) ? "metr" : "pcs";
}

export function normalizeProductUnit(value: string | null | undefined): ProductUnit {
  return value === "metr" ? "metr" : "pcs";
}

export function getQuantityStep(unit: ProductUnit): number {
  return unit === "metr" ? 0.01 : 1;
}

export function getQuantityInputStep(unit: ProductUnit): string {
  return unit === "metr" ? "0.01" : "1";
}

export function roundQuantity(value: number, unit: ProductUnit): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  if (unit === "metr") {
    return Math.round(value * 100) / 100;
  }

  return Math.round(value);
}

export function formatQuantityValue(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }

  if (Math.abs(value - Math.round(value)) < QUANTITY_EPSILON) {
    return Math.round(value).toString();
  }

  return value.toFixed(2).replace(/\.?0+$/, "");
}

export function getUnitLabel(unit: ProductUnit, t: Translator, style: "short" | "long" = "long"): string {
  return t(`unit.${unit}.${style}`);
}

export function formatQuantityWithUnit(
  value: number,
  unit: ProductUnit,
  t: Translator,
  style: "short" | "long" = "long",
): string {
  return `${formatQuantityValue(value)} ${getUnitLabel(unit, t, style)}`;
}
