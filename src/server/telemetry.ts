import "server-only";

type Fields = Record<string, string | number | boolean | null | undefined>;
export function recordMetric(name: string, fields: Fields) {
  console.info(JSON.stringify({ level: "info", kind: "metric", name, timestamp: new Date().toISOString(), ...fields }));
}
