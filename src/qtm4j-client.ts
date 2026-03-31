/**
 * HTTP client wrapping the QTM4J (QMetry for Jira) Open API.
 * Base URL: https://qtmcloud.qmetry.com/rest/api/latest
 * Auth: apiKey header
 */

export interface TestCaseRef {
  id: string;
  versionNo: number;
}

export interface CycleTestCase {
  testCaseExecutionId: number;
  [key: string]: unknown;
}

export class QTM4JClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.apiKey = apiKey;
  }

  private async request(
    method: string,
    path: string,
    query?: Record<string, string>,
    body?: unknown
  ): Promise<{ status: number; data: unknown }> {
    let url = `${this.baseUrl}${path}`;
    if (query && Object.keys(query).length > 0) {
      const qs = new URLSearchParams(query).toString();
      url += `?${qs}`;
    }

    const headers: Record<string, string> = {
      apiKey: this.apiKey,
      "Content-Type": "application/json",
    };

    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    if (res.status < 200 || res.status > 299) {
      throw new Error(`HTTP ${res.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
    }

    return { status: res.status, data };
  }

  private async post(path: string, body: unknown, query?: Record<string, string>): Promise<unknown> {
    const { data } = await this.request("POST", path, query, body);
    return data;
  }

  private async put(path: string, body: unknown, query?: Record<string, string>): Promise<unknown> {
    const { data } = await this.request("PUT", path, query, body);
    return data;
  }

  private async putStatus(path: string, body: unknown): Promise<number> {
    const { status } = await this.request("PUT", path, undefined, body);
    return status;
  }

  private async get(path: string, query: Record<string, string>): Promise<unknown> {
    const { data } = await this.request("GET", path, query);
    return data;
  }

  // --- Public API operations ---

  async createTestCycle(projectId: number, summary: string): Promise<string | null> {
    const root = (await this.post("/testcycles", { projectId, summary })) as Record<string, unknown>;
    return extractId(root);
  }

  async searchTestCaseByKey(projectId: number, key: string): Promise<TestCaseRef | null> {
    const k = key.trim();
    if (!k) return null;

    const root = (await this.post("/testcases/search", {
      filter: { projectId: projectId.toString(), key: k },
    })) as Record<string, unknown>;

    const data = root?.data;
    if (!Array.isArray(data) || data.length === 0) return null;
    const item = data[0] as Record<string, unknown>;
    const id = item?.id?.toString()?.trim();
    if (!id) return null;
    return { id, versionNo: extractVersionNo(item) };
  }

  async createTestCase(projectId: number, summary: string): Promise<TestCaseRef | null> {
    const root = (await this.post("/testcases", { summary, projectId })) as Record<string, unknown>;
    const id = extractId(root);
    if (!id) return null;

    let versionNo = extractVersionNo(root);
    if (versionNo === 1 && root?.data && typeof root.data === "object" && !Array.isArray(root.data)) {
      versionNo = extractVersionNo(root.data as Record<string, unknown>);
    }
    return { id, versionNo };
  }

  async listCycleTestCases(testCycleId: string): Promise<CycleTestCase[]> {
    const root = (await this.post(
      `/testcycles/${testCycleId}/testcases/search/`,
      { filter: {} },
      { fields: "key", maxResults: "200" }
    )) as Record<string, unknown>;

    const data = root?.data;
    if (!Array.isArray(data)) return [];

    return data
      .map((item: Record<string, unknown>) => {
        const execId =
          item?.testCaseExecutionId ?? item?.testcaseExecutionId ?? item?.id;
        if (execId == null) return null;
        return { ...item, testCaseExecutionId: Number(execId) } as CycleTestCase;
      })
      .filter((x): x is CycleTestCase => x !== null);
  }

  async addTestCaseToCycle(
    testCycleId: string,
    testCaseId: string,
    versionNo: number
  ): Promise<number | null> {
    const root = (await this.post(`/testcycles/${testCycleId}/testcases`, {
      testCases: [{ id: testCaseId, versionNo }],
      sort: "key:ASC",
    })) as Record<string, unknown>;

    const fromResponse = extractExecutionId(root);
    if (fromResponse !== null) return fromResponse;

    // Fallback: search cycle test cases and take the last execution ID
    const cases = await this.listCycleTestCases(testCycleId);
    return cases.length > 0 ? cases[cases.length - 1].testCaseExecutionId : null;
  }

  async updateExecutionStatus(
    projectId: number,
    testCycleId: string,
    testCaseExecutionId: number,
    executionResultId: number
  ): Promise<void> {
    await this.put(
      `/testcycles/${testCycleId}/testcase-executions/${testCaseExecutionId}`,
      { executionResultId },
      { projectId: projectId.toString() }
    );
  }

  async closeTestCycle(projectId: number, testCycleId: string, statusId: number): Promise<void> {
    const status = await this.putStatus(`/testcycles/${testCycleId}`, {
      status: statusId,
      projectId,
    });
    if (status !== 200 && status !== 204) {
      throw new Error(`closeTestCycle failed: expected 200 or 204, got ${status}`);
    }
  }

  async getAttachmentUrl(
    testCycleId: string,
    projectId: number,
    fileName: string,
    testCaseExecutionId: number
  ): Promise<unknown> {
    return this.get(`/testcycles/${testCycleId}/testcase-executions/attachments/url/`, {
      fileName,
      projectId: projectId.toString(),
      testcaseExecutionId: testCaseExecutionId.toString(),
      inline: "true",
    });
  }
}

// --- Helpers ---

function extractId(root: Record<string, unknown>): string | null {
  if (root?.id != null) return root.id.toString();
  if (root?.data && typeof root.data === "object" && !Array.isArray(root.data)) {
    const id = (root.data as Record<string, unknown>).id;
    return id != null ? id.toString() : null;
  }
  return null;
}

function extractVersionNo(obj: Record<string, unknown>): number {
  if (obj?.version && typeof obj.version === "object") {
    const v = (obj.version as Record<string, unknown>).versionNo;
    return v != null ? Number(v) : 1;
  }
  return 1;
}

function extractExecutionId(root: Record<string, unknown>): number | null {
  const data = root?.data;

  if (Array.isArray(data) && data.length > 0) {
    const last = data[data.length - 1] as Record<string, unknown>;
    const id = last?.testCaseExecutionId ?? last?.testcaseExecutionId ?? last?.id;
    if (id != null) return Number(id);
  }

  if (data && typeof data === "object" && !Array.isArray(data)) {
    const d = data as Record<string, unknown>;
    const id = d?.testCaseExecutionId ?? d?.testcaseExecutionId ?? d?.id;
    if (id != null) return Number(id);
  }

  const id = root?.testCaseExecutionId ?? root?.testcaseExecutionId ?? root?.id;
  if (id != null) return Number(id);

  return null;
}
