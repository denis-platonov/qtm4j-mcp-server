import { describe, expect, it, vi } from "vitest";
import { createServer, main, runCli } from "../src/index.js";
import { TOOL_DEFINITIONS } from "../src/tools.js";
import { createToolClientMock } from "./helpers.js";

describe("createServer", () => {
  it("registers the expected tool set on the MCP server", () => {
    const { client } = createToolClientMock();
    const server = createServer(
      {
        apiKey: "secret",
        baseUrl: "https://example.test",
        defaultProjectId: 42,
      },
      client
    );

    expect(server).toBeDefined();
    expect(Object.keys(TOOL_DEFINITIONS).sort()).toEqual(
      [
        "add_test_case_steps",
        "add_test_case_to_cycle",
        "add_test_case_to_folders",
        "close_test_cycle",
        "create_test_case",
        "create_test_case_folder",
        "create_test_cycle",
        "get_attachment_url",
        "get_test_case",
        "get_test_case_details",
        "get_test_case_steps",
        "list_all_project_test_cases",
        "list_cycle_test_cases",
        "list_test_case_folders",
        "remove_test_case_from_folders",
        "search_test_case",
        "search_test_cases",
        "update_execution_status",
        "update_test_case_description",
        "update_test_case_step",
        "update_test_case_summary",
      ].sort()
    );
  });
});

describe("main", () => {
  it("loads config, builds the server, connects the transport, and logs startup", async () => {
    const transport = { kind: "transport" };
    const client = createToolClientMock().client;
    const clientFactory = vi.fn().mockReturnValue(client);
    const connect = vi.fn().mockResolvedValue(undefined);
    const serverFactory = vi.fn().mockReturnValue({ connect });
    const transportFactory = vi.fn().mockReturnValue(transport);
    const log = vi.fn();

    const result = await main({
      env: {
        QTM4J_API_KEY: "secret",
        QTM4J_BASE_URL: "https://example.test",
        QTM4J_PROJECT_ID: "55",
      },
      clientFactory,
      serverFactory,
      transportFactory,
      log,
    });

    expect(clientFactory).toHaveBeenCalledWith({
      apiKey: "secret",
      baseUrl: "https://example.test",
      defaultProjectId: 55,
    });
    expect(serverFactory).toHaveBeenCalledWith(
      {
        apiKey: "secret",
        baseUrl: "https://example.test",
        defaultProjectId: 55,
      },
      client
    );
    expect(connect).toHaveBeenCalledWith(transport);
    expect(log).toHaveBeenCalledWith("qtm4j-mcp-server running (base: https://example.test)");
    expect(result.config.defaultProjectId).toBe(55);
  });

  it("rejects when required config is missing", async () => {
    await expect(main({ env: {} })).rejects.toThrow("QTM4J_API_KEY environment variable is required");
  });
});

describe("runCli", () => {
  it("delegates to main and avoids exiting on success", async () => {
    const mainFn = vi.fn().mockResolvedValue(undefined);
    const error = vi.fn();
    const exit = vi.fn();

    await runCli({ mainFn, error, exit });

    expect(mainFn).toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });

  it("logs fatal errors and exits with code 1", async () => {
    const err = new Error("boom");
    const error = vi.fn();
    const exit = vi.fn();

    await runCli({
      mainFn: vi.fn().mockRejectedValue(err),
      error,
      exit,
    });

    expect(error).toHaveBeenCalledWith("Fatal error:", err);
    expect(exit).toHaveBeenCalledWith(1);
  });
});
