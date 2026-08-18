export const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));
export const round = (value: number, places = 2) => Math.round((value + Number.EPSILON) * 10 ** places) / 10 ** places;
export const clone = <T>(value: T): T => structuredClone(value);

export function finite(value: number, label: string) {
  if (!Number.isFinite(value)) throw new Error(`NON_FINITE_STATE:${label}`);
  return value;
}
