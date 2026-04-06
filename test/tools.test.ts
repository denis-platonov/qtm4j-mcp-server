import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  TOOL_DEFINITIONS,
  createToolHandlers,
  errorResult,
  registerQtm4jTools,
  textResult,
} from "../src/tools.js";
import { createToolClientMock, parseToolPayload } from "./helpers.js";

describe("tool helpers", () => {
  it("formats text and error results consistently", () => {
    expect(textResult({ ok: true })).toEqual({
      content: [{ type: "text", text: '{\n  "ok": true\n}' }],
    });
    expect(errorResult("nope")).toEqual({
      content: [{ type: "text", text: "nope" }],
      isError: true,
    });
  });
});

describe("TOOL_DEFINITIONS", () => {
  it("keeps projectId optional for defaultable tools", () => {
    const shape = TOOL_DEFINITIONS.create_test_cycle.parameters(123);
    expect(z.object(shape).parse({ summary: "Smoke" })).toEqual({ summary: "Smoke" });
  });

  it("applies the default version number for add_test_case_to_cycle", () => {
    const shape = TOOL_DEFINITIONS.add_test_case_to_cycle.parameters();
    expect(z.object(shape).parse({ testCycleId: "CYCLE-1", testCaseId: "TC-1" })).toEqual({
      testCycleId: "CYCLE-1",
      testCaseId: "TC-1",
      versionNo: 1,
    });
  });
});

describe("createToolHandlers", () => {
  it("uses the default project id for create_test_cycle", async () => {
    const { client, mocks } = createToolClientMock();
    mocks.createTestCycle.mockResolvedValue("CYCLE-1");
    const handlers = createToolHandlers(client, 88);

    const result = await handlers.create_test_cycle({ summary: "Smoke" });

    expect(mocks.createTestCycle).toHaveBeenCalledWith(88, "Smoke");
    expect(parseToolPayload(result)).toEqual({ cycleId: "CYCLE-1" });
  });

  it("returns an error when no project id is available", async () => {
    const { client } = createToolClientMock();
    const handlers = createToolHandlers(client);

    await expect(handlers.create_test_cycle({ summary: "Smoke" })).resolves.toEqual(
      errorResult("projectId is required (no default configured)")
    );
  });

  it("returns not found when search_test_case yields null", async () => {
    const { client, mocks } = createToolClientMock();
    mocks.searchTestCaseByKey.mockResolvedValue(null);
    const handlers = createToolHandlers(client, 42);

    await expect(handlers.search_test_case({ key: "TC-1" })).resolves.toEqual(
      errorResult("Test case not found: TC-1")
    );
  });

  it("returns a found test case payload", async () => {
    const { client, mocks } = createToolClientMock();
    mocks.searchTestCaseByKey.mockResolvedValue({ id: "TC-1", versionNo: 3 });
    const handlers = createToolHandlers(client, 42);

    const result = await handlers.search_test_case({ key: "TC-1" });

    expect(parseToolPayload(result)).toEqual({ testCaseId: "TC-1", versionNo: 3 });
  });

  it("returns a created test case payload", async () => {
    const { client, mocks } = createToolClientMock();
    mocks.createTestCase.mockResolvedValue({ id: "TC-1", versionNo: 4 });
    const handlers = createToolHandlers(client, 42);

    const result = await handlers.create_test_case({ summary: "Create me" });

    expect(mocks.createTestCase).toHaveBeenCalledWith(42, "Create me");
    expect(parseToolPayload(result)).toEqual({ testCaseId: "TC-1", versionNo: 4 });
  });

  it("returns an error when create_test_case yields null", async () => {
    const { client, mocks } = createToolClientMock();
    mocks.createTestCase.mockResolvedValue(null);
    const handlers = createToolHandlers(client, 42);

    await expect(handlers.create_test_case({ summary: "Create me" })).resolves.toEqual(
      errorResult("Failed to create test case")
    );
  });

  it("returns the cycle test case list with a count", async () => {
    const { client, mocks } = createToolClientMock();
    mocks.listCycleTestCases.mockResolvedValue([{ testCaseExecutionId: 1 }]);
    const handlers = createToolHandlers(client);

    const result = await handlers.list_cycle_test_cases({ testCycleId: "CYCLE-1" });

    expect(parseToolPayload(result)).toEqual({
      count: 1,
      testCases: [{ testCaseExecutionId: 1 }],
    });
  });

  it("returns an error when adding a test case to a cycle fails", async () => {
    const { client, mocks } = createToolClientMock();
    mocks.addTestCaseToCycle.mockResolvedValue(null);
    const handlers = createToolHandlers(client);

    await expect(
      handlers.add_test_case_to_cycle({ testCycleId: "CYCLE-1", testCaseId: "TC-1", versionNo: 2 })
    ).resolves.toEqual(errorResult("Failed to add test case to cycle"));
  });

  it("returns the execution id when adding a test case to a cycle succeeds", async () => {
    const { client, mocks } = createToolClientMock();
    mocks.addTestCaseToCycle.mockResolvedValue(101);
    const handlers = createToolHandlers(client);

    const result = await handlers.add_test_case_to_cycle({
      testCycleId: "CYCLE-1",
      testCaseId: "TC-1",
      versionNo: 2,
    });

    expect(parseToolPayload(result)).toEqual({ testCaseExecutionId: 101 });
  });

  it("returns success for update_execution_status", async () => {
    const { client, mocks } = createToolClientMock();
    mocks.updateExecutionStatus.mockResolvedValue(undefined);
    const handlers = createToolHandlers(client, 42);

    const result = await handlers.update_execution_status({
      testCycleId: "CYCLE-1",
      testCaseExecutionId: 8,
      executionResultId: 9,
    });

    expect(mocks.updateExecutionStatus).toHaveBeenCalledWith(42, "CYCLE-1", 8, 9);
    expect(parseToolPayload(result)).toEqual({
      success: true,
      testCaseExecutionId: 8,
      executionResultId: 9,
    });
  });

  it("returns success for close_test_cycle", async () => {
    const { client, mocks } = createToolClientMock();
    mocks.closeTestCycle.mockResolvedValue(undefined);
    const handlers = createToolHandlers(client, 42);

    const result = await handlers.close_test_cycle({ testCycleId: "CYCLE-1", statusId: 5 });

    expect(mocks.closeTestCycle).toHaveBeenCalledWith(42, "CYCLE-1", 5);
    expect(parseToolPayload(result)).toEqual({
      success: true,
      testCycleId: "CYCLE-1",
      status: "closed",
    });
  });

  it("returns attachment-url payloads unchanged", async () => {
    const { client, mocks } = createToolClientMock();
    mocks.getAttachmentUrl.mockResolvedValue({ url: "https://upload" });
    const handlers = createToolHandlers(client, 42);

    const result = await handlers.get_attachment_url({
      testCycleId: "CYCLE-1",
      fileName: "report.txt",
      testCaseExecutionId: 7,
    });

    expect(mocks.getAttachmentUrl).toHaveBeenCalledWith("CYCLE-1", 42, "report.txt", 7);
    expect(parseToolPayload(result)).toEqual({ url: "https://upload" });
  });

  it("propagates client exceptions", async () => {
    const { client, mocks } = createToolClientMock();
    mocks.createTestCase.mockRejectedValue(new Error("boom"));
    const handlers = createToolHandlers(client, 42);

    await expect(handlers.create_test_case({ summary: "Create me" })).rejects.toThrow("boom");
  });
});

describe("registerQtm4jTools", () => {
  it("registers every tool with aligned definitions", () => {
    const { client } = createToolClientMock();
    const registrations: Array<{
      name: string;
      description: string;
      parameters: Record<string, z.ZodTypeAny>;
      handler: (args: Record<string, unknown>) => Promise<unknown>;
    }> = [];

    const handlers = registerQtm4jTools(
      {
        tool(name, description, parameters, handler) {
          registrations.push({ name, description, parameters, handler });
        },
      },
      client,
      77
    );

    expect(registrations.map((item) => item.name)).toEqual(Object.keys(TOOL_DEFINITIONS));
    expect(Object.keys(handlers)).toEqual(Object.keys(TOOL_DEFINITIONS));
    expect(
      z.object(registrations.find((item) => item.name === "create_test_cycle")!.parameters).parse({
        summary: "Smoke",
      })
    ).toEqual({ summary: "Smoke" });
  });
});
