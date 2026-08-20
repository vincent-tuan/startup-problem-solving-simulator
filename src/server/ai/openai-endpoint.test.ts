import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_OPENAI_REQUEST_TIMEOUT_MS,
  openAiBaseUrl,
  openAiEndpoint,
  openAiRequestTimeoutMs,
} from "./openai-endpoint";

afterEach(() => vi.unstubAllEnvs());

describe("OpenAI-compatible provider endpoint", () => {
  it("uses the official API by default", () => {
    vi.stubEnv("OPENAI_BASE_URL", "");
    expect(openAiEndpoint("responses")).toBe("https://api.openai.com/v1/responses");
  });

  it("normalizes a custom HTTPS base URL", () => {
    vi.stubEnv("OPENAI_BASE_URL", "https://chat.green.cloud/ai/v1/");
    expect(openAiBaseUrl()).toBe("https://chat.green.cloud/ai/v1");
    expect(openAiEndpoint("moderations")).toBe("https://chat.green.cloud/ai/v1/moderations");
  });

  it("rejects transport downgrade and embedded credentials", () => {
    vi.stubEnv("OPENAI_BASE_URL", "http://provider.invalid/v1");
    expect(() => openAiBaseUrl()).toThrow("OPENAI_BASE_URL_MUST_USE_HTTPS");
    vi.stubEnv("OPENAI_BASE_URL", "https://secret@provider.invalid/v1");
    expect(() => openAiBaseUrl()).toThrow("OPENAI_BASE_URL_MUST_NOT_CONTAIN_CREDENTIALS");
  });

  it("defaults to a 90-second request limit and clamps unsafe overrides", () => {
    vi.stubEnv("OPENAI_REQUEST_TIMEOUT_MS", "");
    expect(openAiRequestTimeoutMs()).toBe(90_000);
    expect(MAX_OPENAI_REQUEST_TIMEOUT_MS).toBe(90_000);
    expect(openAiRequestTimeoutMs(120_000)).toBe(90_000);
    expect(openAiRequestTimeoutMs(200)).toBe(1_000);
  });

  it("accepts a shorter configured timeout and rejects non-numeric configuration", () => {
    vi.stubEnv("OPENAI_REQUEST_TIMEOUT_MS", "45000");
    expect(openAiRequestTimeoutMs()).toBe(45_000);
    vi.stubEnv("OPENAI_REQUEST_TIMEOUT_MS", "not-a-number");
    expect(openAiRequestTimeoutMs()).toBe(90_000);
  });
});
