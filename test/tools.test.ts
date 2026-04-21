import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  TOOL_DEFINITIONS,
  coerceOptionalNumber,
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

  it("coerces optional numeric inputs and rejects invalid values", () => {
    expect(coerceOptionalNumber(undefined)).toBeUndefined();
    expect(coerceOptionalNumber(null)).toBeUndefined();
    expect(coerceOptionalNumber(12)).toBe(12);
    expect(coerceOptionalNumber(" 34 ")).toBe(34);
    expect(coerceOptionalNumber("")).toBeUndefined();
    expect(coerceOptionalNumber("abc")).toBeUndefined();
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

  it("forwards search_test_cases with summaryContains and paging fields", async () => {
    const { client, mocks } = createToolClientMock();
    mocks.searchTestCases.mockResolvedValue({ data: [], total: 0 });
    const handlers = createToolHandlers(client, 42);

    const result = await handlers.search_test_cases({
      summaryContains: "Lex",
      startAt: 100,
      maxResults: 50,
    });

    expect(mocks.searchTestCases).toHaveBeenCalledWith({
      projectId: 42,
      key: undefined,
      summary: "~Lex",
      startAt: 100,
      maxResults: 50,
    });
    expect(parseToolPayload(result)).toEqual({ data: [], total: 0 });
  });

  it("coerces string startAt, maxResults, and projectId for search_test_cases", async () => {
    const { client, mocks } = createToolClientMock();
    mocks.searchTestCases.mockResolvedValue({ data: [] });
    const handlers = createToolHandlers(client);

    await handlers.search_test_cases({
      projectId: "10800",
      summaryContains: "e",
      startAt: "100",
      maxResults: "50",
    });

    expect(mocks.searchTestCases).toHaveBeenCalledWith({
      projectId: 10800,
      key: undefined,
      summary: "~e",
      startAt: 100,
      maxResults: 50,
    });
  });

  it("uses raw summary over summaryContains for search_test_cases", async () => {
    const { client, mocks } = createToolClientMock();
    mocks.searchTestCases.mockResolvedValue({});
    const handlers = createToolHandlers(client, 42);

    await handlers.search_test_cases({ summary: "~Raw", summaryContains: "ignored" });

    expect(mocks.searchTestCases).toHaveBeenCalledWith(
      expect.objectContaining({ summary: "~Raw" })
    );
  });

  it("preserves an existing tilde in summaryContains for search_test_cases", async () => {
    const { client, mocks } = createToolClientMock();
    mocks.searchTestCases.mockResolvedValue({});
    const handlers = createToolHandlers(client, 42);

    await handlers.search_test_cases({ summaryContains: "~Lex" });

    expect(mocks.searchTestCases).toHaveBeenCalledWith(
      expect.objectContaining({ summary: "~Lex" })
    );
  });

  it("omits blank key and summary filters for search_test_cases", async () => {
    const { client, mocks } = createToolClientMock();
    mocks.searchTestCases.mockResolvedValue({ data: [] });
    const handlers = createToolHandlers(client, 42);

    await handlers.search_test_cases({
      key: "   ",
      summaryContains: "   ",
    });

    expect(mocks.searchTestCases).toHaveBeenCalledWith({
      projectId: 42,
      key: undefined,
      summary: undefined,
      startAt: undefined,
      maxResults: undefined,
    });
  });

  it("returns list_all_project_test_cases merged payload", async () => {
    const { client, mocks } = createToolClientMock();
    mocks.listAllProjectTestCases.mockResolvedValue({ projectId: 42, totalRows: 0, data: [] });
    const handlers = createToolHandlers(client, 42);

    const result = await handlers.list_all_project_test_cases({
      key: "PE26-TC-1",
      summaryContains: "Login",
      maxResultsPerPage: 200,
      maxPages: 5,
    });

    expect(mocks.listAllProjectTestCases).toHaveBeenCalledWith({
      projectId: 42,
      key: "PE26-TC-1",
      summaryContains: "Login",
      maxResultsPerPage: 200,
      maxPages: 5,
    });
    expect(parseToolPayload(result)).toEqual({ projectId: 42, totalRows: 0, data: [] });
  });

  it("coerces string paging values for list_all_project_test_cases", async () => {
    const { client, mocks } = createToolClientMock();
    mocks.listAllProjectTestCases.mockResolvedValue({ data: [] });
    const handlers = createToolHandlers(client);

    await handlers.list_all_project_test_cases({
      projectId: "10800",
      key: "  ",
      summaryContains: 7,
      maxResultsPerPage: "50",
      maxPages: "2",
    });

    expect(mocks.listAllProjectTestCases).toHaveBeenCalledWith({
      projectId: 10800,
      key: undefined,
      summaryContains: undefined,
      maxResultsPerPage: 50,
      maxPages: 2,
    });
  });

  it("returns a created test case payload", async () => {
    const { client, mocks } = createToolClientMock();
    mocks.createTestCaseWithFolders.mockResolvedValue({ testCaseId: "TC-1", versionNo: 4 });
    const handlers = createToolHandlers(client, 42);

    const result = await handlers.create_test_case({ summary: "Create me" });

    expect(mocks.createTestCaseWithFolders).toHaveBeenCalledWith(42, "Create me", {});
    expect(parseToolPayload(result)).toEqual({ testCaseId: "TC-1", versionNo: 4 });
  });

  it("returns an error when create_test_case yields null", async () => {
    const { client, mocks } = createToolClientMock();
    mocks.createTestCaseWithFolders.mockResolvedValue(null);
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

  it("returns an error when create_test_cycle yields null", async () => {
    const { client, mocks } = createToolClientMock();
    mocks.createTestCycle.mockResolvedValue(null);
    const handlers = createToolHandlers(client, 42);

    await expect(handlers.create_test_cycle({ summary: "Smoke" })).resolves.toEqual(
      errorResult("Failed to create test cycle")
    );
  });

  it("propagates client exceptions", async () => {
    const { client, mocks } = createToolClientMock();
    mocks.createTestCaseWithFolders.mockRejectedValue(new Error("boom"));
    const handlers = createToolHandlers(client, 42);

    await expect(handlers.create_test_case({ summary: "Create me" })).rejects.toThrow("boom");
  });

  it("returns an error when update_test_case_step has no step fields", async () => {
    const { client, mocks } = createToolClientMock();
    const handlers = createToolHandlers(client, 42);

    const result = await handlers.update_test_case_step({
      testCaseId: "1",
      stepId: "99",
    });

    expect(mocks.updateTestCaseStep).not.toHaveBeenCalled();
    expect(result).toEqual(
      errorResult("Provide at least one of stepDetails, expectedResult, or testData")
    );
  });

  it("forwards update_test_case_summary to the client", async () => {
    const { client, mocks } = createToolClientMock();
    mocks.updateTestCaseSummary.mockResolvedValue({ success: true });
    const handlers = createToolHandlers(client, 42);

    const result = await handlers.update_test_case_summary({
      testCaseId: "PE26-TC-1",
      versionNo: 2,
      summary: "Updated",
    });

    expect(mocks.updateTestCaseSummary).toHaveBeenCalledWith("PE26-TC-1", 2, 42, "Updated");
    expect(parseToolPayload(result)).toEqual({ success: true });
  });

  it("forwards add_test_case_steps with defaults and returns client payload", async () => {
    const { client, mocks } = createToolClientMock();
    mocks.addTestCaseSteps.mockResolvedValue({ created: 2 });
    const handlers = createToolHandlers(client, 42);

    const result = await handlers.add_test_case_steps({
      testCaseId: "TC-1",
      steps: [{ stepDetails: "Click login" }],
      aiGenerated: true,
    });

    expect(mocks.addTestCaseSteps).toHaveBeenCalledWith(
      "TC-1",
      1,
      42,
      [{ stepDetails: "Click login" }],
      true
    );
    expect(parseToolPayload(result)).toEqual({ created: 2 });
  });

  it("returns client errors from add_test_case_steps", async () => {
    const { client, mocks } = createToolClientMock();
    mocks.addTestCaseSteps.mockRejectedValue("boom");
    const handlers = createToolHandlers(client, 42);

    await expect(
      handlers.add_test_case_steps({ testCaseId: "TC-1", steps: [{ stepDetails: "step" }] })
    ).resolves.toEqual(errorResult("boom"));
  });

  it("forwards add_test_case_to_folders and remove_test_case_from_folders", async () => {
    const { client, mocks } = createToolClientMock();
    mocks.updateTestCaseFolders
      .mockResolvedValueOnce({ added: true })
      .mockResolvedValueOnce({ removed: true });
    const handlers = createToolHandlers(client, 42);

    const addResult = await handlers.add_test_case_to_folders({
      testCaseId: "TC-1",
      addFolderIds: [4, 5],
    });
    const removeResult = await handlers.remove_test_case_from_folders({
      testCaseId: "TC-1",
      removeFolderIds: [8],
    });

    expect(mocks.updateTestCaseFolders).toHaveBeenNthCalledWith(
      1,
      "TC-1",
      1,
      42,
      [4, 5],
      undefined
    );
    expect(mocks.updateTestCaseFolders).toHaveBeenNthCalledWith(
      2,
      "TC-1",
      1,
      42,
      undefined,
      [8]
    );
    expect(parseToolPayload(addResult)).toEqual({ added: true });
    expect(parseToolPayload(removeResult)).toEqual({ removed: true });
  });

  it("returns client errors from folder mutation handlers", async () => {
    const { client, mocks } = createToolClientMock();
    mocks.updateTestCaseFolders.mockRejectedValue(new Error("folder fail"));
    const handlers = createToolHandlers(client, 42);

    await expect(
      handlers.add_test_case_to_folders({ testCaseId: "TC-1", addFolderIds: [1] })
    ).resolves.toEqual(errorResult("folder fail"));
  });

  it("returns client errors from remove_test_case_from_folders", async () => {
    const { client, mocks } = createToolClientMock();
    mocks.updateTestCaseFolders.mockRejectedValue(new Error("remove fail"));
    const handlers = createToolHandlers(client, 42);

    await expect(
      handlers.remove_test_case_from_folders({ testCaseId: "TC-1", removeFolderIds: [1] })
    ).resolves.toEqual(errorResult("remove fail"));
  });

  it("creates a test case folder with default root parent id", async () => {
    const { client, mocks } = createToolClientMock();
    mocks.createTestCaseFolder.mockResolvedValue({ id: 99 });
    const handlers = createToolHandlers(client, 42);

    const result = await handlers.create_test_case_folder({
      folderName: "New Folder",
      description: "Nested",
    });

    expect(mocks.createTestCaseFolder).toHaveBeenCalledWith(42, "New Folder", -1, "Nested");
    expect(parseToolPayload(result)).toEqual({ id: 99 });
  });

  it("returns client errors from create_test_case_folder", async () => {
    const { client, mocks } = createToolClientMock();
    mocks.createTestCaseFolder.mockRejectedValue(new Error("cannot create"));
    const handlers = createToolHandlers(client, 42);

    await expect(
      handlers.create_test_case_folder({ folderName: "Folder" })
    ).resolves.toEqual(errorResult("cannot create"));
  });

  it("returns get_test_case and get_test_case_details payloads", async () => {
    const { client, mocks } = createToolClientMock();
    mocks.getTestCaseFlexible.mockResolvedValue({ id: "TC-1" });
    mocks.getTestCaseVersionDetails.mockResolvedValue({ versionNo: 3 });
    const handlers = createToolHandlers(client, 42);

    const testCaseResult = await handlers.get_test_case({
      testCaseId: "TC-1",
      versionNo: 2,
    });
    const detailResult = await handlers.get_test_case_details({
      testCaseId: "TC-1",
      fields: "summary",
    });

    expect(mocks.getTestCaseFlexible).toHaveBeenCalledWith("TC-1", 42, 2);
    expect(mocks.getTestCaseVersionDetails).toHaveBeenCalledWith("TC-1", 1, 42, "summary");
    expect(parseToolPayload(testCaseResult)).toEqual({ id: "TC-1" });
    expect(parseToolPayload(detailResult)).toEqual({ versionNo: 3 });
  });

  it("returns client errors from get_test_case and get_test_case_details", async () => {
    const { client, mocks } = createToolClientMock();
    mocks.getTestCaseFlexible.mockRejectedValue(new Error("missing"));
    mocks.getTestCaseVersionDetails.mockRejectedValue(new Error("bad version"));
    const handlers = createToolHandlers(client, 42);

    await expect(handlers.get_test_case({ testCaseId: "TC-1" })).resolves.toEqual(
      errorResult("missing")
    );
    await expect(handlers.get_test_case_details({ testCaseId: "TC-1" })).resolves.toEqual(
      errorResult("bad version")
    );
  });

  it("forwards get_test_case_steps with coercion and latest-version flag", async () => {
    const { client, mocks } = createToolClientMock();
    mocks.searchTestCaseSteps.mockResolvedValue({ data: [{ id: 1 }] });
    const handlers = createToolHandlers(client, 42);

    const result = await handlers.get_test_case_steps({
      testCaseId: "TC-1",
      startAt: "10",
      maxResults: "25",
      sort: "seqNo:asc",
      stepDetailsContains: "click",
      testDataContains: "user",
      expectedResultContains: "open",
      useLatestVersion: true,
    });

    expect(mocks.searchTestCaseSteps).toHaveBeenCalledWith({
      testCaseId: "TC-1",
      versionNo: 1,
      projectId: 42,
      startAt: 10,
      maxResults: 25,
      sort: "seqNo:asc",
      stepDetailsContains: "click",
      testDataContains: "user",
      expectedResultContains: "open",
      useLatestVersion: true,
    });
    expect(parseToolPayload(result)).toEqual({ data: [{ id: 1 }] });
  });

  it("returns client errors from get_test_case_steps", async () => {
    const { client, mocks } = createToolClientMock();
    mocks.searchTestCaseSteps.mockRejectedValue(new Error("step search failed"));
    const handlers = createToolHandlers(client, 42);

    await expect(handlers.get_test_case_steps({ testCaseId: "TC-1" })).resolves.toEqual(
      errorResult("step search failed")
    );
  });

  it("returns list_test_case_folders payload and error results", async () => {
    const { client, mocks } = createToolClientMock();
    mocks.listTestCaseFoldersWithFlat
      .mockResolvedValueOnce({ flatFolders: [{ id: 1 }] })
      .mockRejectedValueOnce(new Error("folder list failed"));
    const handlers = createToolHandlers(client, 42);

    const successResult = await handlers.list_test_case_folders({ withCount: true });
    const errorPayload = await handlers.list_test_case_folders({});

    expect(mocks.listTestCaseFoldersWithFlat).toHaveBeenNthCalledWith(1, 42, true);
    expect(mocks.listTestCaseFoldersWithFlat).toHaveBeenNthCalledWith(2, 42, undefined);
    expect(parseToolPayload(successResult)).toEqual({ flatFolders: [{ id: 1 }] });
    expect(errorPayload).toEqual(errorResult("folder list failed"));
  });

  it("returns update_test_case_description payload and error results", async () => {
    const { client, mocks } = createToolClientMock();
    mocks.updateTestCaseDescription
      .mockResolvedValueOnce({ ok: true })
      .mockRejectedValueOnce(new Error("desc fail"));
    const handlers = createToolHandlers(client, 42);

    const successResult = await handlers.update_test_case_description({
      testCaseId: "TC-1",
      description: "Updated",
    });
    const errorPayload = await handlers.update_test_case_description({
      testCaseId: "TC-1",
      description: "Updated",
    });

    expect(mocks.updateTestCaseDescription).toHaveBeenNthCalledWith(1, "TC-1", 1, 42, "Updated");
    expect(parseToolPayload(successResult)).toEqual({ ok: true });
    expect(errorPayload).toEqual(errorResult("desc fail"));
  });

  it("returns update_test_case_step payload and client errors", async () => {
    const { client, mocks } = createToolClientMock();
    mocks.updateTestCaseStep
      .mockResolvedValueOnce({ ok: true })
      .mockRejectedValueOnce(new Error("step fail"));
    const handlers = createToolHandlers(client, 42);

    const successResult = await handlers.update_test_case_step({
      testCaseId: "TC-1",
      versionNo: 3,
      stepId: "8",
      stepDetails: "Click",
      expectedResult: "Shown",
      useLatestVersion: true,
    });
    const errorPayload = await handlers.update_test_case_step({
      testCaseId: "TC-1",
      stepId: "8",
      testData: "sample",
    });

    expect(mocks.updateTestCaseStep).toHaveBeenNthCalledWith(
      1,
      "TC-1",
      3,
      42,
      "8",
      { stepDetails: "Click", expectedResult: "Shown", testData: undefined },
      true
    );
    expect(mocks.updateTestCaseStep).toHaveBeenNthCalledWith(
      2,
      "TC-1",
      1,
      42,
      "8",
      { stepDetails: undefined, expectedResult: undefined, testData: "sample" },
      undefined
    );
    expect(parseToolPayload(successResult)).toEqual({ ok: true });
    expect(errorPayload).toEqual(errorResult("step fail"));
  });

  it("returns update_test_case_summary client errors", async () => {
    const { client, mocks } = createToolClientMock();
    mocks.updateTestCaseSummary.mockRejectedValue(new Error("summary fail"));
    const handlers = createToolHandlers(client, 42);

    await expect(
      handlers.update_test_case_summary({ testCaseId: "TC-1", summary: "Updated" })
    ).resolves.toEqual(errorResult("summary fail"));
  });

  it("returns the missing-project error for every project-scoped handler", async () => {
    const { client, mocks } = createToolClientMock();
    const handlers = createToolHandlers(client);
    const expected = errorResult("projectId is required (no default configured)");

    await expect(handlers.create_test_cycle({ summary: "Smoke" })).resolves.toEqual(expected);
    await expect(handlers.search_test_case({ key: "TC-1" })).resolves.toEqual(expected);
    await expect(handlers.search_test_cases({ key: "TC-1" })).resolves.toEqual(expected);
    await expect(handlers.list_all_project_test_cases({ key: "TC-1" })).resolves.toEqual(expected);
    await expect(handlers.create_test_case({ summary: "Create me" })).resolves.toEqual(expected);
    await expect(
      handlers.update_execution_status({
        testCycleId: "CYCLE-1",
        testCaseExecutionId: 8,
        executionResultId: 9,
      })
    ).resolves.toEqual(expected);
    await expect(handlers.close_test_cycle({ testCycleId: "CYCLE-1", statusId: 5 })).resolves.toEqual(
      expected
    );
    await expect(
      handlers.get_attachment_url({
        testCycleId: "CYCLE-1",
        fileName: "report.txt",
        testCaseExecutionId: 7,
      })
    ).resolves.toEqual(expected);
    await expect(
      handlers.add_test_case_steps({ testCaseId: "TC-1", steps: [{ stepDetails: "Click" }] })
    ).resolves.toEqual(expected);
    await expect(
      handlers.add_test_case_to_folders({ testCaseId: "TC-1", addFolderIds: [1] })
    ).resolves.toEqual(expected);
    await expect(handlers.create_test_case_folder({ folderName: "Folder" })).resolves.toEqual(expected);
    await expect(handlers.get_test_case({ testCaseId: "TC-1" })).resolves.toEqual(expected);
    await expect(handlers.get_test_case_details({ testCaseId: "TC-1" })).resolves.toEqual(expected);
    await expect(handlers.get_test_case_steps({ testCaseId: "TC-1" })).resolves.toEqual(expected);
    await expect(handlers.list_test_case_folders({})).resolves.toEqual(expected);
    await expect(
      handlers.remove_test_case_from_folders({ testCaseId: "TC-1", removeFolderIds: [1] })
    ).resolves.toEqual(expected);
    await expect(
      handlers.update_test_case_description({ testCaseId: "TC-1", description: "Body" })
    ).resolves.toEqual(expected);
    await expect(
      handlers.update_test_case_step({ testCaseId: "TC-1", stepId: "1", stepDetails: "Click" })
    ).resolves.toEqual(expected);
    await expect(
      handlers.update_test_case_summary({ testCaseId: "TC-1", summary: "Summary" })
    ).resolves.toEqual(expected);

    expect(mocks.searchTestCaseByKey).not.toHaveBeenCalled();
    expect(mocks.createTestCaseWithFolders).not.toHaveBeenCalled();
    expect(mocks.updateExecutionStatus).not.toHaveBeenCalled();
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
