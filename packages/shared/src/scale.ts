/**
 * Parse weight from common retail scale serial output.
 * Supports Torrey/Systel-style lines like "  1.250 kg" or "W+001.250".
 */
export function parseScaleWeightLine(line: string): number | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const normalized = trimmed.replace(/,/g, '.');
  const kgMatch = normalized.match(/([+-]?\d+\.?\d*)\s*kg/i);
  if (kgMatch) {
    const value = Number(kgMatch[1]);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  const genericMatch = normalized.match(/([+-]?\d+\.\d{2,3})/);
  if (genericMatch) {
    const value = Number(genericMatch[1]);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  return null;
}

export function formatGtin14(gtin: string): string | null {
  const digits = gtin.replace(/\D/g, '');
  if (digits.length === 14) return digits;
  if (digits.length === 13) return `0${digits}`;
  return null;
}

export interface PtiLabelInput {
  gtin?: string | null;
  lotCode: string;
  packDate?: string | null;
}

export function buildPtiLabelString(input: PtiLabelInput): string {
  const gtin = input.gtin ? formatGtin14(input.gtin) : null;
  const parts = [
    gtin ? `(01)${gtin}` : null,
    `(10)${input.lotCode.trim()}`,
    input.packDate ? `(13)${input.packDate.replace(/-/g, '').slice(2)}` : null,
  ].filter(Boolean);
  return parts.join('');
}
