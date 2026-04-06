#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { QTM4JClient } from "./qtm4j-client.js";
import { loadConfig, type AppConfig, type ConfigEnv } from "./config.js";
import { registerQtm4jTools, type QTM4JToolClient, type ToolRegistrar } from "./tools.js";

// --- Start ---

export interface ConnectableServer {
  connect(transport: unknown): Promise<void>;
}

export interface MainOptions {
  env?: ConfigEnv;
  clientFactory?: (config: AppConfig) => QTM4JToolClient;
  serverFactory?: (config: AppConfig, client: QTM4JToolClient) => ConnectableServer;
  transportFactory?: () => unknown;
  log?: (message: string) => void;
}

export interface CliOptions {
  mainFn?: () => Promise<unknown>;
  error?: (...args: unknown[]) => void;
  exit?: (code: number) => void;
}

export function createServer(
  config: AppConfig,
  client: QTM4JToolClient = new QTM4JClient(config.baseUrl, config.apiKey)
): McpServer {
  const server = new McpServer(
    { name: "qtm4j-mcp-server", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );
  registerQtm4jTools(server as unknown as ToolRegistrar, client, config.defaultProjectId);
  return server;
}

export async function main({
  env = process.env,
  clientFactory = (config) => new QTM4JClient(config.baseUrl, config.apiKey),
  serverFactory = createServer,
  transportFactory = () => new StdioServerTransport(),
  log = console.error,
}: MainOptions = {}) {
  const config = loadConfig(env);
  const client = clientFactory(config);
  const server = serverFactory(config, client);
  const transport = transportFactory();
  await server.connect(transport);
  log(`qtm4j-mcp-server running (base: ${config.baseUrl})`);
  return { config, client, server };
}

export async function runCli({
  mainFn = () => main(),
  error = console.error,
  exit = process.exit,
}: CliOptions = {}) {
  try {
    await mainFn();
  } catch (err) {
    error("Fatal error:", err);
    exit(1);
  }
}

const isEntrypoint =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];

if (isEntrypoint) {
  void runCli();
}
