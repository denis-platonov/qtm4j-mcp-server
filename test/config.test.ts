import { describe, expect, it } from "vitest";
import {
  ConfigError,
  DEFAULT_QTM4J_BASE_URL,
  loadConfig,
} from "../src/config.js";

describe("loadConfig", () => {
  it("requires QTM4J_API_KEY", () => {
    expect(() => loadConfig({})).toThrowError(
      new ConfigError("QTM4J_API_KEY environment variable is required")
    );
  });

  it("uses the default base url when one is not provided", () => {
    expect(loadConfig({ QTM4J_API_KEY: "secret" })).toEqual({
      apiKey: "secret",
      baseUrl: DEFAULT_QTM4J_BASE_URL,
    });
  });

  it("parses and trims explicit env values", () => {
    expect(
      loadConfig({
        QTM4J_API_KEY: " secret ",
        QTM4J_BASE_URL: " https://example.test/api ",
        QTM4J_PROJECT_ID: " 10800 ",
      })
    ).toEqual({
      apiKey: "secret",
      baseUrl: "https://example.test/api",
      defaultProjectId: 10800,
    });
  });

  it("rejects non-numeric project ids", () => {
    expect(() =>
      loadConfig({
        QTM4J_API_KEY: "secret",
        QTM4J_PROJECT_ID: "nope",
      })
    ).toThrowError(new ConfigError("QTM4J_PROJECT_ID environment variable must be a number"));
  });
});
