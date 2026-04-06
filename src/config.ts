export const DEFAULT_QTM4J_BASE_URL = "https://qtmcloud.qmetry.com/rest/api/latest";

export interface AppConfig {
  baseUrl: string;
  apiKey: string;
  defaultProjectId?: number;
}

export interface ConfigEnv {
  QTM4J_API_KEY?: string;
  QTM4J_BASE_URL?: string;
  QTM4J_PROJECT_ID?: string;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export function loadConfig(env: ConfigEnv = process.env): AppConfig {
  const apiKey = env.QTM4J_API_KEY?.trim();
  if (!apiKey) {
    throw new ConfigError("QTM4J_API_KEY environment variable is required");
  }

  const baseUrl = env.QTM4J_BASE_URL?.trim() || DEFAULT_QTM4J_BASE_URL;
  const projectIdValue = env.QTM4J_PROJECT_ID?.trim();

  if (!projectIdValue) {
    return { baseUrl, apiKey };
  }

  const defaultProjectId = Number(projectIdValue);
  if (Number.isNaN(defaultProjectId)) {
    throw new ConfigError("QTM4J_PROJECT_ID environment variable must be a number");
  }

  return { baseUrl, apiKey, defaultProjectId };
}
