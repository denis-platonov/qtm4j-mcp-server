import { vi } from "vitest";
import type { FetchLike, HttpResponseLike } from "../src/qtm4j-client.js";
import type { QTM4JToolClient } from "../src/tools.js";

export function createJsonResponse(status: number, data: unknown): HttpResponseLike {
  return {
    status,
    text: vi.fn().mockResolvedValue(JSON.stringify(data)),
  };
}

export function createTextResponse(status: number, text: string): HttpResponseLike {
  return {
    status,
    text: vi.fn().mockResolvedValue(text),
  };
}

export function createFetchMock(...responses: HttpResponseLike[]): ReturnType<typeof vi.fn<FetchLike>> {
  const fetchMock = vi.fn<FetchLike>();
  responses.forEach((response) => {
    fetchMock.mockResolvedValueOnce(response);
  });
  return fetchMock;
}

export function createToolClientMock(): {
  client: QTM4JToolClient;
  mocks: Record<string, ReturnType<typeof vi.fn>>;
} {
  const mocks = {
    createTestCycle: vi.fn(),
    searchTestCaseByKey: vi.fn(),
    searchTestCases: vi.fn(),
    listAllProjectTestCases: vi.fn(),
    createTestCaseWithFolders: vi.fn(),
    listTestCaseFoldersWithFlat: vi.fn(),
    getTestCaseFlexible: vi.fn(),
    getTestCaseVersionDetails: vi.fn(),
    createTestCaseFolder: vi.fn(),
    updateTestCaseFolders: vi.fn(),
    searchTestCaseSteps: vi.fn(),
    addTestCaseSteps: vi.fn(),
    listCycleTestCases: vi.fn(),
    addTestCaseToCycle: vi.fn(),
    updateExecutionStatus: vi.fn(),
    closeTestCycle: vi.fn(),
    getAttachmentUrl: vi.fn(),
    updateTestCaseSummary: vi.fn(),
    updateTestCaseDescription: vi.fn(),
    updateTestCaseStep: vi.fn(),
  };

  return {
    client: mocks as unknown as QTM4JToolClient,
    mocks,
  };
}

export function parseToolPayload(result: { content: Array<{ text: string }> }) {
  return JSON.parse(result.content[0].text);
}
