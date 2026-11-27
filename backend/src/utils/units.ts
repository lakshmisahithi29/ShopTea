export type ItemUnit = 'KG' | 'G' | 'LITRES' | 'ML' | 'PACKETS' | 'PIECES';

export const UNIT_FAMILIES = {
  MASS: ['KG', 'G'],
  VOLUME: ['LITRES', 'ML'],
  COUNT: ['PACKETS', 'PIECES'],
} as const;

/**
 * Checks if two units are compatible for conversion (e.g. g <-> kg, ml <-> litres)
 */
export function areUnitsCompatible(unitA: ItemUnit, unitB: ItemUnit): boolean {
  if (unitA === unitB) return true;
  if (UNIT_FAMILIES.MASS.includes(unitA as any) && UNIT_FAMILIES.MASS.includes(unitB as any)) return true;
  if (UNIT_FAMILIES.VOLUME.includes(unitA as any) && UNIT_FAMILIES.VOLUME.includes(unitB as any)) return true;
  return false;
}

/**
 * Normalizes input quantity to the item's stored base unit.
 * Example: Item is in KG, user inputs 500 grams -> returns 0.5 KG
 */
export function convertQuantityToBaseUnit(
  quantity: number,
  inputUnit: ItemUnit,
  baseUnit: ItemUnit
): number {
  if (!Number.isFinite(quantity)) {
    throw new Error('Quantity must be finite.');
  }
  if (inputUnit === baseUnit) return quantity;

  // Mass conversions
  if (baseUnit === 'KG' && inputUnit === 'G') {
    return quantity / 1000;
  }
  if (baseUnit === 'G' && inputUnit === 'KG') {
    return quantity * 1000;
  }

  // Volume conversions
  if (baseUnit === 'LITRES' && inputUnit === 'ML') {
    return quantity / 1000;
  }
  if (baseUnit === 'ML' && inputUnit === 'LITRES') {
    return quantity * 1000;
  }

  throw new Error(`Incompatible unit conversion from ${inputUnit} to base unit ${baseUnit}`);
}

/** Returns how many base units equal one input unit. */
export function unitConversionFactor(inputUnit: ItemUnit, baseUnit: ItemUnit): number {
  return convertQuantityToBaseUnit(1, inputUnit, baseUnit);
}

/** Converts a price expressed per input unit to a price per stored base unit. */
export function convertUnitCostToBaseUnit(
  unitCost: number,
  inputUnit: ItemUnit,
  baseUnit: ItemUnit
): number {
  if (!Number.isFinite(unitCost)) {
    throw new Error('Unit cost must be finite.');
  }
  return unitCost / unitConversionFactor(inputUnit, baseUnit);
}
