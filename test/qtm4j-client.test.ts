import { describe, expect, it } from "vitest";
import {
  QTM4JClient,
  extractExecutionId,
  extractId,
  extractVersionNo,
} from "../src/qtm4j-client.js";
import { createFetchMock, createJsonResponse, createTextResponse } from "./helpers.js";

describe("QTM4JClient", () => {
  it("normalizes the base url, request headers, and JSON body", async () => {
    const fetchMock = createFetchMock(createJsonResponse(201, { id: "TC-1" }));
    const client = new QTM4JClient("https://example.test///", "secret", fetchMock);

    await expect(client.createTestCycle(42, "Smoke")).resolves.toBe("TC-1");

    expect(fetchMock).toHaveBeenCalledWith("https://example.test/testcycles", {
      method: "POST",
      headers: {
        apiKey: "secret",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ projectId: 42, summary: "Smoke" }),
    });
  });

  it("parses plain text success responses", async () => {
    const fetchMock = createFetchMock(createTextResponse(200, "plain-text-result"));
    const client = new QTM4JClient("https://example.test", "secret", fetchMock);

    await expect(client.getAttachmentUrl("CYCLE-1", 42, "report.txt", 77)).resolves.toBe(
      "plain-text-result"
    );
  });

  it("throws JSON error payloads with serialized content", async () => {
    const fetchMock = createFetchMock(createJsonResponse(404, { message: "missing" }));
    const client = new QTM4JClient("https://example.test", "secret", fetchMock);

    await expect(client.createTestCycle(42, "Smoke")).rejects.toThrow(
      'HTTP 404: {"message":"missing"}'
    );
  });

  it("throws plain text error payloads", async () => {
    const fetchMock = createFetchMock(createTextResponse(500, "upstream error"));
    const client = new QTM4JClient("https://example.test", "secret", fetchMock);

    await expect(client.createTestCycle(42, "Smoke")).rejects.toThrow("HTTP 500: upstream error");
  });

  it("returns null for blank search keys without calling fetch", async () => {
    const fetchMock = createFetchMock();
    const client = new QTM4JClient("https://example.test", "secret", fetchMock);

    await expect(client.searchTestCaseByKey(42, "   ")).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null when search results are empty or missing ids", async () => {
    const emptyFetch = createFetchMock(createJsonResponse(200, { data: [] }));
    const missingIdFetch = createFetchMock(createJsonResponse(200, { data: [{ version: {} }] }));

    await expect(
      new QTM4JClient("https://example.test", "secret", emptyFetch).searchTestCaseByKey(42, "TC-1")
    ).resolves.toBeNull();
    await expect(
      new QTM4JClient("https://example.test", "secret", missingIdFetch).searchTestCaseByKey(
        42,
        "TC-1"
      )
    ).resolves.toBeNull();
  });

  it("returns the first matching test case ref with version fallback", async () => {
    const fetchMock = createFetchMock(
      createJsonResponse(200, {
        data: [{ id: " 123 ", version: { versionNo: 3 } }],
      })
    );
    const client = new QTM4JClient("https://example.test", "secret", fetchMock);

    await expect(client.searchTestCaseByKey(42, "TC-1")).resolves.toEqual({
      id: "123",
      versionNo: 3,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.test/testcases/search?startAt=0&maxResults=1",
      {
        method: "POST",
        headers: {
          apiKey: "secret",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filter: { projectId: "42", key: "TC-1" },
          startAt: 0,
          maxResults: 1,
        }),
      }
    );
  });

  it("searchTestCases sends filter, startAt, and capped maxResults", async () => {
    const fetchMock = createFetchMock(
      createJsonResponse(200, { data: [], total: 0, startAt: 10, maxResults: 50 })
    );
    const client = new QTM4JClient("https://example.test", "secret", fetchMock);

    await client.searchTestCases({
      projectId: 7,
      summary: "~Lex",
      startAt: 10,
      maxResults: 9999,
    });

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://example.test/testcases/search?startAt=10&maxResults=500"
    );
    expect(JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body)).toEqual({
      filter: { projectId: "7", summary: "~Lex" },
      startAt: 10,
      maxResults: 500,
    });
  });

  it("listAllProjectTestCases walks pages and dedupes by key", async () => {
    const fetchMock = createFetchMock(
      createJsonResponse(200, {
        data: [
          { key: "A", id: "1" },
          { key: "B", id: "2" },
        ],
      }),
      createJsonResponse(200, {
        data: [
          { key: "B", id: "2b" },
          { key: "C", id: "3" },
        ],
      }),
      createJsonResponse(200, { data: [] })
    );
    const client = new QTM4JClient("https://example.test", "secret", fetchMock);

    await expect(
      client.listAllProjectTestCases({
        projectId: 5,
        summaryContains: "foo",
        maxResultsPerPage: 2,
        maxPages: 10,
      })
    ).resolves.toMatchObject({
      projectId: 5,
      pagesFetched: 3,
      totalRows: 3,
      uniqueKeys: 3,
    });

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://example.test/testcases/search?startAt=0&maxResults=2"
    );
    expect(JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body)).toMatchObject({
      filter: { projectId: "5", summary: "~foo" },
      startAt: 0,
      maxResults: 2,
    });
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://example.test/testcases/search?startAt=2&maxResults=2"
    );
    expect(fetchMock.mock.calls[2][0]).toBe(
      "https://example.test/testcases/search?startAt=4&maxResults=2"
    );
  });

  it("listAllProjectTestCases continues when API caps page size below maxResultsPerPage but total is larger", async () => {
    const fetchMock = createFetchMock(
      createJsonResponse(200, {
        total: 5,
        data: [
          { key: "A", id: "1" },
          { key: "B", id: "2" },
          { key: "C", id: "3" },
        ],
      }),
      createJsonResponse(200, {
        total: 5,
        data: [
          { key: "D", id: "4" },
          { key: "E", id: "5" },
        ],
      })
    );
    const client = new QTM4JClient("https://example.test", "secret", fetchMock);

    await expect(
      client.listAllProjectTestCases({
        projectId: 1,
        maxResultsPerPage: 100,
        maxPages: 10,
      })
    ).resolves.toMatchObject({
      projectId: 1,
      pagesFetched: 2,
      totalRows: 5,
      uniqueKeys: 5,
    });

    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://example.test/testcases/search?startAt=3&maxResults=100"
    );
  });

  it("listAllProjectTestCases stops on a short page when total is absent", async () => {
    const fetchMock = createFetchMock(
      createJsonResponse(200, {
        data: [{ key: "A", id: "1" }],
      })
    );
    const client = new QTM4JClient("https://example.test", "secret", fetchMock);

    await expect(
      client.listAllProjectTestCases({
        projectId: 1,
        maxResultsPerPage: 2,
        maxPages: 10,
      })
    ).resolves.toMatchObject({
      pagesFetched: 1,
      totalRows: 1,
    });
  });

  it("reads nested version data when createTestCase falls back from the root payload", async () => {
    const fetchMock = createFetchMock(
      createJsonResponse(200, {
        id: "TC-9",
        data: { version: { versionNo: 7 } },
      })
    );
    const client = new QTM4JClient("https://example.test", "secret", fetchMock);

    await expect(client.createTestCase(42, "New case")).resolves.toEqual({
      id: "TC-9",
      versionNo: 7,
    });
  });

  it("returns null when createTestCase cannot extract an id", async () => {
    const fetchMock = createFetchMock(createJsonResponse(200, { data: { version: { versionNo: 2 } } }));
    const client = new QTM4JClient("https://example.test", "secret", fetchMock);

    await expect(client.createTestCase(42, "New case")).resolves.toBeNull();
  });

  it("createTestCaseWithFolders preserves an explicit folder id without auto-picking", async () => {
    const fetchMock = createFetchMock(createJsonResponse(200, { id: "TC-7", version: { versionNo: 2 } }));
    const client = new QTM4JClient("https://example.test", "secret", fetchMock);

    await expect(
      client.createTestCaseWithFolders(42, "New case", { folderId: 55, autoPickFolder: true })
    ).resolves.toEqual({
      testCaseId: "TC-7",
      versionNo: 2,
      folderId: 55,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body)).toEqual({
      summary: "New case",
      projectId: 42,
      folderId: 55,
    });
  });

  it("createTestCaseWithFolders auto-picks a folder and warns when none match", async () => {
    const pickerFetch = createFetchMock(
      createJsonResponse(200, {
        data: [
          { id: 1, name: "API", childFolders: [] },
          { id: 2, name: "Web", childFolders: [{ id: 3, name: "Login", childFolders: [] }] },
        ],
      }),
      createJsonResponse(200, { id: "TC-8", version: { versionNo: 4 } })
    );
    const warningFetch = createFetchMock(
      createJsonResponse(200, { data: [{ id: 1, name: "API", childFolders: [] }] }),
      createJsonResponse(200, { id: "TC-9" })
    );

    await expect(
      new QTM4JClient("https://example.test", "secret", pickerFetch).createTestCaseWithFolders(42, "Login", {
        folderKeywords: ["login"],
      })
    ).resolves.toEqual({
      testCaseId: "TC-8",
      versionNo: 4,
      folderId: 3,
      pickedFolder: { id: 3, name: "Login", path: "Web / Login" },
    });

    await expect(
      new QTM4JClient("https://example.test", "secret", warningFetch).createTestCaseWithFolders(42, "Login", {
        folderKeywords: ["login"],
      })
    ).resolves.toEqual({
      testCaseId: "TC-9",
      versionNo: 1,
      folderWarning: "No folder matched the given keywords",
    });
  });

  it("createTestCaseWithFolders uses default keywords when autoPickFolder is true", async () => {
    const fetchMock = createFetchMock(
      createJsonResponse(200, {
        data: [{ id: 5, name: "Web", childFolders: [] }],
      }),
      createJsonResponse(200, { id: "TC-10", version: { versionNo: 1 } })
    );
    const client = new QTM4JClient("https://example.test", "secret", fetchMock);

    await expect(
      client.createTestCaseWithFolders(42, "Web case", { autoPickFolder: true })
    ).resolves.toEqual({
      testCaseId: "TC-10",
      versionNo: 1,
      folderId: 5,
      pickedFolder: { id: 5, name: "Web", path: "Web" },
    });
  });

  it("listTestCaseFoldersRaw adds withCount and listTestCaseFoldersWithFlat wraps non-object payloads", async () => {
    const rawFetch = createFetchMock(createJsonResponse(200, [{ id: 1, name: "Root", childFolders: [] }]));
    const wrappedFetch = createFetchMock(createJsonResponse(200, [{ id: 2, name: "Other", childFolders: [] }]));

    await expect(
      new QTM4JClient("https://example.test", "secret", rawFetch).listTestCaseFoldersRaw(42, true)
    ).resolves.toEqual([{ id: 1, name: "Root", childFolders: [] }]);
    await expect(
      new QTM4JClient("https://example.test", "secret", wrappedFetch).listTestCaseFoldersWithFlat(42, false)
    ).resolves.toEqual({
      data: [{ id: 2, name: "Other", childFolders: [] }],
      flatFolders: [{ id: 2, name: "Other", path: "Other" }],
    });

    expect(rawFetch.mock.calls[0][0]).toBe("https://example.test/projects/42/testcase-folders?withCount=true");
  });

  it("listTestCaseFoldersWithFlat preserves object payload fields", async () => {
    const fetchMock = createFetchMock(
      createJsonResponse(200, { data: [{ id: 1, name: "Root", childFolders: [] }], total: 1 })
    );
    const client = new QTM4JClient("https://example.test", "secret", fetchMock);

    await expect(client.listTestCaseFoldersWithFlat(42)).resolves.toEqual({
      data: [{ id: 1, name: "Root", childFolders: [] }],
      total: 1,
      flatFolders: [{ id: 1, name: "Root", path: "Root" }],
    });
  });

  it("getTestCaseVersionDetails trims fields and getTestCaseFlexible falls back by key", async () => {
    const versionFetch = createFetchMock(createJsonResponse(200, { id: "TC-1" }));
    const fallbackVersionFetch = createFetchMock(
      createJsonResponse(404, { message: "missing" }),
      createJsonResponse(200, { data: [{ id: "REAL-ID", version: { versionNo: 6 } }] }),
      createJsonResponse(200, { id: "REAL-ID", versionNo: 4 })
    );
    const fallbackBasicFetch = createFetchMock(
      createJsonResponse(404, { message: "missing" }),
      createJsonResponse(200, { data: [{ id: "REAL-ID", version: { versionNo: 2 } }] }),
      createJsonResponse(200, { id: "REAL-ID" })
    );

    await expect(
      new QTM4JClient("https://example.test", "secret", versionFetch).getTestCaseVersionDetails(
        "TC-1",
        3,
        42,
        " summary,steps "
      )
    ).resolves.toEqual({ id: "TC-1" });
    await expect(
      new QTM4JClient("https://example.test", "secret", fallbackVersionFetch).getTestCaseFlexible(
        "PE26-TC-2",
        42,
        4
      )
    ).resolves.toEqual({ id: "REAL-ID", versionNo: 4 });
    await expect(
      new QTM4JClient("https://example.test", "secret", fallbackBasicFetch).getTestCaseFlexible(
        "PE26-TC-2",
        42
      )
    ).resolves.toEqual({ id: "REAL-ID" });

    expect(versionFetch.mock.calls[0][0]).toBe(
      "https://example.test/testcases/TC-1/versions/3?projectId=42&fields=summary%2Csteps"
    );
  });

  it("getTestCaseFlexible throws when fallback key lookup finds nothing", async () => {
    const fetchMock = createFetchMock(
      createJsonResponse(404, { message: "missing" }),
      createJsonResponse(200, { data: [] })
    );
    const client = new QTM4JClient("https://example.test", "secret", fetchMock);

    await expect(client.getTestCaseFlexible("PE26-TC-2", 42)).rejects.toThrow(
      "Test case not found: PE26-TC-2"
    );
  });

  it("createTestCaseFolder trims descriptions and omits blank descriptions", async () => {
    const withDescription = createFetchMock(createJsonResponse(200, { id: 1 }));
    const blankDescription = createFetchMock(createJsonResponse(200, { id: 2 }));

    await new QTM4JClient("https://example.test", "secret", withDescription).createTestCaseFolder(
      42,
      "Folder",
      -1,
      "  desc  "
    );
    await new QTM4JClient("https://example.test", "secret", blankDescription).createTestCaseFolder(
      42,
      "Folder",
      -1,
      "   "
    );

    expect(JSON.parse((withDescription.mock.calls[0][1] as { body: string }).body)).toEqual({
      folderName: "Folder",
      parentId: -1,
      description: "desc",
    });
    expect(JSON.parse((blankDescription.mock.calls[0][1] as { body: string }).body)).toEqual({
      folderName: "Folder",
      parentId: -1,
    });
  });

  it("updateTestCaseFolders sends add and delete payloads through the shared version endpoint", async () => {
    const fetchMock = createFetchMock(createJsonResponse(200, { ok: true }));
    const client = new QTM4JClient("https://example.test", "secret", fetchMock);

    await client.updateTestCaseFolders("TC-1", 2, 42, [1, 2], [3]);

    expect(fetchMock.mock.calls[0][0]).toBe("https://example.test/testcases/TC-1/versions/2?projectId=42");
    expect(JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body)).toEqual({
      projectId: 42,
      folders: { add: [1, 2], delete: [3] },
    });
  });

  it("normalizes cycle test case execution ids from multiple field names", async () => {
    const fetchMock = createFetchMock(
      createJsonResponse(200, {
        data: [
          { testCaseExecutionId: 11, key: "A" },
          { testcaseExecutionId: 12, key: "B" },
          { id: 13, key: "C" },
          { key: "missing" },
        ],
      })
    );
    const client = new QTM4JClient("https://example.test", "secret", fetchMock);

    await expect(client.listCycleTestCases("CYCLE-1")).resolves.toEqual([
      { testCaseExecutionId: 11, key: "A" },
      { testcaseExecutionId: 12, testCaseExecutionId: 12, key: "B" },
      { id: 13, testCaseExecutionId: 13, key: "C" },
    ]);
  });

  it("returns an empty list when cycle test cases payload is not an array", async () => {
    const fetchMock = createFetchMock(createJsonResponse(200, { data: {} }));
    const client = new QTM4JClient("https://example.test", "secret", fetchMock);

    await expect(client.listCycleTestCases("CYCLE-1")).resolves.toEqual([]);
  });

  it("returns execution ids from addTestCaseToCycle response payloads", async () => {
    const cases = [
      createJsonResponse(200, { data: [{ testCaseExecutionId: 55 }] }),
      createJsonResponse(200, { data: { testcaseExecutionId: 56 } }),
      createJsonResponse(200, { id: 57 }),
    ];

    await expect(
      new QTM4JClient("https://example.test", "secret", createFetchMock(cases[0])).addTestCaseToCycle(
        "CYCLE-1",
        "TC-1",
        1
      )
    ).resolves.toBe(55);
    await expect(
      new QTM4JClient("https://example.test", "secret", createFetchMock(cases[1])).addTestCaseToCycle(
        "CYCLE-1",
        "TC-1",
        1
      )
    ).resolves.toBe(56);
    await expect(
      new QTM4JClient("https://example.test", "secret", createFetchMock(cases[2])).addTestCaseToCycle(
        "CYCLE-1",
        "TC-1",
        1
      )
    ).resolves.toBe(57);
  });

  it("falls back to listing cycle test cases when addTestCaseToCycle response lacks an execution id", async () => {
    const fetchMock = createFetchMock(
      createJsonResponse(200, { data: [] }),
      createJsonResponse(200, { data: [{ testCaseExecutionId: 91 }, { testCaseExecutionId: 92 }] })
    );
    const client = new QTM4JClient("https://example.test", "secret", fetchMock);

    await expect(client.addTestCaseToCycle("CYCLE-1", "TC-1", 1)).resolves.toBe(92);
  });

  it("returns null when addTestCaseToCycle fallback list is empty", async () => {
    const fetchMock = createFetchMock(
      createJsonResponse(200, { data: [] }),
      createJsonResponse(200, { data: [] })
    );
    const client = new QTM4JClient("https://example.test", "secret", fetchMock);

    await expect(client.addTestCaseToCycle("CYCLE-1", "TC-1", 1)).resolves.toBeNull();
  });

  it("sends query parameters for updateExecutionStatus", async () => {
    const fetchMock = createFetchMock(createJsonResponse(204, {}));
    const client = new QTM4JClient("https://example.test", "secret", fetchMock);

    await client.updateExecutionStatus(77, "CYCLE-1", 88, 99);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.test/testcycles/CYCLE-1/testcase-executions/88?projectId=77",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ executionResultId: 99 }),
      })
    );
  });

  it("accepts closeTestCycle responses with 200 or 204 and rejects other 2xx statuses", async () => {
    await expect(
      new QTM4JClient("https://example.test", "secret", createFetchMock(createJsonResponse(200, {})))
        .closeTestCycle(42, "CYCLE-1", 7)
    ).resolves.toBeUndefined();
    await expect(
      new QTM4JClient("https://example.test", "secret", createFetchMock(createJsonResponse(204, "")))
        .closeTestCycle(42, "CYCLE-1", 7)
    ).resolves.toBeUndefined();
    await expect(
      new QTM4JClient("https://example.test", "secret", createFetchMock(createJsonResponse(201, {})))
        .closeTestCycle(42, "CYCLE-1", 7)
    ).rejects.toThrow("closeTestCycle failed: expected 200 or 204, got 201");
  });

  it("builds getAttachmentUrl query parameters", async () => {
    const fetchMock = createFetchMock(createJsonResponse(200, { url: "https://upload" }));
    const client = new QTM4JClient("https://example.test", "secret", fetchMock);

    await expect(client.getAttachmentUrl("CYCLE-1", 42, "report.txt", 77)).resolves.toEqual({
      url: "https://upload",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.test/testcycles/CYCLE-1/testcase-executions/attachments/url/?fileName=report.txt&projectId=42&testcaseExecutionId=77&inline=true",
      expect.objectContaining({
        method: "GET",
      })
    );
  });

  it("PUTs summary and description on the test case version endpoint", async () => {
    const fetchMock = createFetchMock(
      createJsonResponse(200, { ok: true }),
      createJsonResponse(200, { ok: true })
    );
    const client = new QTM4JClient("https://example.test", "secret", fetchMock);

    await client.updateTestCaseSummary("TC-1", 2, 99, "New title");
    await client.updateTestCaseDescription("TC-1", 2, 99, "New body");

    expect(fetchMock.mock.calls[0][0]).toBe("https://example.test/testcases/TC-1/versions/2?projectId=99");
    expect(JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body)).toEqual({
      projectId: 99,
      summary: "New title",
    });
    expect(JSON.parse((fetchMock.mock.calls[1][1] as { body: string }).body)).toEqual({
      projectId: 99,
      description: "New body",
    });
  });

  it("PUTs test step updates as an array on the collection endpoint (optional latest version path)", async () => {
    const fetchMock = createFetchMock(createJsonResponse(200, { step: 1 }));
    const client = new QTM4JClient("https://example.test", "secret", fetchMock);

    await client.updateTestCaseStep("TC-1", 3, 5, "88", { stepDetails: "Click" }, true);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.test/testcases/TC-1/versions/latest/teststeps?projectId=5",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify([{ id: 88, stepDetails: "Click" }]),
      })
    );
  });

  it("rejects test step updates with a non-numeric step id", async () => {
    const fetchMock = createFetchMock();
    const client = new QTM4JClient("https://example.test", "secret", fetchMock);

    await expect(
      client.updateTestCaseStep("TC-1", 1, 1, "not-a-number", { stepDetails: "Click" })
    ).rejects.toThrow("stepId must be the numeric id from get_test_case_steps; got: not-a-number");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects test step updates with no mutable fields", async () => {
    const fetchMock = createFetchMock();
    const client = new QTM4JClient("https://example.test", "secret", fetchMock);

    await expect(client.updateTestCaseStep("TC-1", 1, 1, "s", {})).rejects.toThrow(
      "Provide at least one of stepDetails, expectedResult, or testData"
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("searchTestCaseSteps POSTs empty body when no step field filters (Swagger GetTestStepRequest)", async () => {
    const fetchMock = createFetchMock(createJsonResponse(200, { data: [], total: 0 }));
    const client = new QTM4JClient("https://example.test", "secret", fetchMock);

    await client.searchTestCaseSteps({
      testCaseId: "abc-123",
      versionNo: 2,
      projectId: 99,
      startAt: 0,
      maxResults: 25,
    });

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://example.test/testcases/abc-123/versions/2/teststeps/search?startAt=0&maxResults=25"
    );
    expect((fetchMock.mock.calls[0][1] as { method?: string }).method).toBe("POST");
    expect((fetchMock.mock.calls[0][1] as { body: string }).body).toBe("{}");
  });

  it("searchTestCaseSteps falls back to POST search when stepDetailsContains is set", async () => {
    const fetchMock = createFetchMock(createJsonResponse(200, { data: [], total: 0 }));
    const client = new QTM4JClient("https://example.test", "secret", fetchMock);

    await client.searchTestCaseSteps({
      testCaseId: "abc-123",
      versionNo: 2,
      projectId: 99,
      stepDetailsContains: "click",
      startAt: 0,
      maxResults: 25,
    });

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://example.test/testcases/abc-123/versions/2/teststeps/search?startAt=0&maxResults=25"
    );
    expect(JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body)).toEqual({
      filter: { stepDetails: "~click" },
    });
  });

  it("searchTestCaseSteps supports sort, latest version path, and testData/expectedResult filters", async () => {
    const fetchMock = createFetchMock(createJsonResponse(200, { data: [], total: 0 }));
    const client = new QTM4JClient("https://example.test", "secret", fetchMock);

    await client.searchTestCaseSteps({
      testCaseId: "abc-123",
      versionNo: 2,
      projectId: 99,
      testDataContains: "user",
      expectedResultContains: "~visible",
      sort: "seqNo:asc",
      useLatestVersion: true,
      maxResults: 500,
    });

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://example.test/testcases/abc-123/versions/latest/teststeps/search?startAt=0&maxResults=100&sort=seqNo%3Aasc"
    );
    expect(JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body)).toEqual({
      filter: { testData: "~user", expectedResult: "~visible" },
    });
  });

  it("addTestCaseSteps includes aiGenerated only when requested", async () => {
    const withAi = createFetchMock(createJsonResponse(200, { ok: true }));
    const withoutAi = createFetchMock(createJsonResponse(200, { ok: true }));

    await new QTM4JClient("https://example.test", "secret", withAi).addTestCaseSteps(
      "TC-1",
      2,
      42,
      [{ stepDetails: "Click" }],
      true
    );
    await new QTM4JClient("https://example.test", "secret", withoutAi).addTestCaseSteps(
      "TC-1",
      2,
      42,
      [{ stepDetails: "Click" }]
    );

    expect(withAi.mock.calls[0][0]).toBe(
      "https://example.test/testcases/TC-1/versions/2/teststeps?projectId=42&aiGenerated=true"
    );
    expect(withoutAi.mock.calls[0][0]).toBe(
      "https://example.test/testcases/TC-1/versions/2/teststeps?projectId=42"
    );
  });
});

describe("QTM4JClient helper parsers", () => {
  it("extracts ids from root and nested data objects", () => {
    expect(extractId({ id: 11 })).toBe("11");
    expect(extractId({ data: { id: "nested" } })).toBe("nested");
    expect(extractId({ data: [] })).toBeNull();
  });

  it("extracts version numbers with a default fallback", () => {
    expect(extractVersionNo({ version: { versionNo: "5" } })).toBe(5);
    expect(extractVersionNo({ version: {} })).toBe(1);
    expect(extractVersionNo({})).toBe(1);
  });

  it("extracts execution ids from arrays, objects, and root payloads", () => {
    expect(extractExecutionId({ data: [{ testCaseExecutionId: 11 }, { testcaseExecutionId: 12 }] })).toBe(
      12
    );
    expect(extractExecutionId({ data: { testcaseExecutionId: 21 } })).toBe(21);
    expect(extractExecutionId({ id: 31 })).toBe(31);
    expect(extractExecutionId({ data: [] })).toBeNull();
  });
});
