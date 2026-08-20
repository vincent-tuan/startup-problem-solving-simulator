const defaultBaseUrl = "https://api.openai.com/v1";
export const MAX_OPENAI_REQUEST_TIMEOUT_MS = 90_000;

export function openAiRequestTimeoutMs(override?: number): number {
  const environmentValue = process.env.OPENAI_REQUEST_TIMEOUT_MS?.trim();
  const configured = override ?? (environmentValue ? Number(environmentValue) : MAX_OPENAI_REQUEST_TIMEOUT_MS);
  if (!Number.isFinite(configured)) return MAX_OPENAI_REQUEST_TIMEOUT_MS;
  return Math.min(MAX_OPENAI_REQUEST_TIMEOUT_MS, Math.max(1_000, Math.trunc(configured)));
}

export function openAiBaseUrl(): string {
  const configured = process.env.OPENAI_BASE_URL?.trim();
  const value = (configured || defaultBaseUrl).replace(/\/+$/, "");
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("OPENAI_BASE_URL_MUST_USE_HTTPS");
  if (url.username || url.password) throw new Error("OPENAI_BASE_URL_MUST_NOT_CONTAIN_CREDENTIALS");
  return url.toString().replace(/\/$/, "");
}

export function openAiEndpoint(path: "responses" | "moderations" | "models"): string {
  return `${openAiBaseUrl()}/${path}`;
}
