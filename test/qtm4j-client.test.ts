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
