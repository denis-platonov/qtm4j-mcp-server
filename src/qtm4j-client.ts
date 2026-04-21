/**
 * HTTP client wrapping the QTM4J (QMetry for Jira) Open API.
 * Base URL: https://qtmcloud.qmetry.com/rest/api/latest
 * Auth: apiKey header
 */

import {
  DEFAULT_FOLDER_KEYWORDS,
  extractFolderRoots,
  flattenFolderNodes,
  pickBestFolder,
} from "./folder-utils.js";

export interface TestCaseRef {
  id: string;
  versionNo: number;
}

export interface CycleTestCase {
  testCaseExecutionId: number;
  [key: string]: unknown;
}

export interface HttpResponseLike {
  status: number;
  text(): Promise<string>;
}

export type FetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string }
) => Promise<HttpResponseLike>;

export class QTM4JClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: FetchLike;

  constructor(baseUrl: string, apiKey: string, fetchImpl: FetchLike = fetch as FetchLike) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
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

    const res = await this.fetchImpl(url, {
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

  private async get(path: string, query: Record<string, string> = {}): Promise<unknown> {
    const { data } = await this.request("GET", path, query);
    return data;
  }

  // --- Public API operations ---

  async createTestCycle(projectId: number, summary: string): Promise<string | null> {
    const root = (await this.post("/testcycles", { projectId, summary })) as Record<string, unknown>;
    return extractId(root);
  }

  /**
   * POST /testcases/search — paginated test case search.
   * Use `summary` with a leading `~` for contains-style matching when your tenant expects that operator.
   */
  async searchTestCases(params: {
    projectId: number;
    key?: string;
    summary?: string;
    startAt?: number;
    maxResults?: number;
  }): Promise<Record<string, unknown>> {
    const filter: Record<string, string> = {
      projectId: params.projectId.toString(),
    };
    const key = params.key?.trim();
    if (key) {
      filter.key = key;
    }
    const summary = params.summary?.trim();
    if (summary) {
      filter.summary = summary;
    }
    const maxResults = Math.min(Math.max(params.maxResults ?? 100, 1), 500);
    const startAt = params.startAt ?? 0;
    // QMetry Cloud applies pagination from query string; values in the JSON body are ignored.
    const query: Record<string, string> = {
      startAt: String(startAt),
      maxResults: String(maxResults),
    };
    const body = {
      filter,
      startAt,
      maxResults,
    };
    return (await this.post("/testcases/search", body, query)) as Record<string, unknown>;
  }

  /**
   * Walks pages until a short page or maxPages. Merges `data`; dedupes rows that expose a string `key`.
   */
  async listAllProjectTestCases(params: {
    projectId: number;
    key?: string;
    summaryContains?: string;
    maxResultsPerPage?: number;
    maxPages?: number;
  }): Promise<{
    projectId: number;
    pagesFetched: number;
    totalRows: number;
    uniqueKeys: number;
    data: unknown[];
    lastRawPage: Record<string, unknown>;
  }> {
    const maxResultsPerPage = Math.min(Math.max(params.maxResultsPerPage ?? 100, 1), 500);
    const maxPages = Math.min(Math.max(params.maxPages ?? 100, 1), 500);
    let summary: string | undefined;
    if (params.summaryContains?.trim()) {
      const s = params.summaryContains.trim();
      summary = s.startsWith("~") ? s : `~${s}`;
    }
    const all: unknown[] = [];
    const seenKeys = new Set<string>();
    let startAt = 0;
    let pagesFetched = 0;
    let lastRaw: Record<string, unknown> = {};

    for (let page = 0; page < maxPages; page += 1) {
      lastRaw = await this.searchTestCases({
        projectId: params.projectId,
        key: params.key,
        summary,
        startAt,
        maxResults: maxResultsPerPage,
      });
      const chunk = Array.isArray(lastRaw.data) ? (lastRaw.data as unknown[]) : [];
      pagesFetched += 1;
      for (const row of chunk) {
        if (row && typeof row === "object" && "key" in row && typeof (row as { key: unknown }).key === "string") {
          const k = (row as { key: string }).key;
          if (seenKeys.has(k)) {
            continue;
          }
          seenKeys.add(k);
        }
        all.push(row);
      }
      if (chunk.length === 0) {
        break;
      }
      const total =
        typeof lastRaw.total === "number" && Number.isFinite(lastRaw.total) ? lastRaw.total : undefined;
      const nextStart = startAt + chunk.length;
      // QMetry may cap page size below requested maxResults; use `total` when present so we do not
      // stop early (e.g. 50 rows returned while maxResultsPerPage is 100 but total is 467).
      if (total !== undefined) {
        if (nextStart >= total) {
          break;
        }
      } else if (chunk.length < maxResultsPerPage) {
        break;
      }
      startAt = nextStart;
    }

    return {
      projectId: params.projectId,
      pagesFetched,
      totalRows: all.length,
      uniqueKeys: seenKeys.size,
      data: all,
      lastRawPage: lastRaw,
    };
  }

  async searchTestCaseByKey(projectId: number, key: string): Promise<TestCaseRef | null> {
    const k = key.trim();
    if (!k) return null;

    const root = await this.searchTestCases({
      projectId,
      key: k,
      startAt: 0,
      maxResults: 1,
    });

    const data = root?.data;
    if (!Array.isArray(data) || data.length === 0) return null;
    const item = data[0] as Record<string, unknown>;
    const id = item?.id?.toString()?.trim();
    if (!id) return null;
    return { id, versionNo: extractVersionNo(item) };
  }

  async createTestCase(projectId: number, summary: string): Promise<TestCaseRef | null> {
    const enriched = await this.createTestCaseWithFolders(projectId, summary, {});
    if (!enriched) return null;
    return { id: enriched.testCaseId as string, versionNo: enriched.versionNo as number };
  }

  /**
   * Create test case with optional folderId or auto-picked folder (GET folder tree + keyword scoring).
   */
  async createTestCaseWithFolders(
    projectId: number,
    summary: string,
    opts: {
      folderId?: number;
      autoPickFolder?: boolean;
      folderKeywords?: string[];
    }
  ): Promise<Record<string, unknown> | null> {
    let folderId = opts.folderId;
    let pickedFolder: Record<string, unknown> | null = null;
    let folderWarning: string | undefined;

    const shouldPick =
      folderId == null &&
      (opts.autoPickFolder === true || (opts.folderKeywords?.length ?? 0) > 0);

    if (shouldPick) {
      const raw = await this.listTestCaseFoldersRaw(projectId, false);
      const flat = flattenFolderNodes(extractFolderRoots(raw), "");
      const kws =
        opts.autoPickFolder === true
          ? [...DEFAULT_FOLDER_KEYWORDS, ...((opts.folderKeywords as string[] | undefined) ?? [])]
          : [...((opts.folderKeywords as string[] | undefined) ?? [])];
      const pick = pickBestFolder(flat, kws);
      if (pick) {
        folderId = pick.id;
        pickedFolder = { id: pick.id, name: pick.name, path: pick.path };
      } else {
        folderWarning = "No folder matched the given keywords";
      }
    }

    const body: Record<string, unknown> = { summary, projectId };
    if (folderId != null) body.folderId = folderId;

    const root = (await this.post("/testcases", body)) as Record<string, unknown>;
    const id = extractId(root);
    if (!id) return null;

    let versionNo = extractVersionNo(root);
    if (versionNo === 1 && root?.data && typeof root.data === "object" && !Array.isArray(root.data)) {
      versionNo = extractVersionNo(root.data as Record<string, unknown>);
    }

    const out: Record<string, unknown> = { testCaseId: id, versionNo };
    if (folderId != null) out.folderId = folderId;
    if (pickedFolder) out.pickedFolder = pickedFolder;
    if (folderWarning) out.folderWarning = folderWarning;
    return out;
  }

  async listTestCaseFoldersRaw(projectId: number, withCount?: boolean): Promise<unknown> {
    const q: Record<string, string> = {};
    if (withCount) q.withCount = "true";
    return this.get(`/projects/${projectId}/testcase-folders`, q);
  }

  async listTestCaseFoldersWithFlat(projectId: number, withCount?: boolean): Promise<Record<string, unknown>> {
    const apiPayload = await this.listTestCaseFoldersRaw(projectId, withCount);
    const flatFolders = flattenFolderNodes(extractFolderRoots(apiPayload), "");
    const base =
      apiPayload && typeof apiPayload === "object" && !Array.isArray(apiPayload)
        ? (apiPayload as Record<string, unknown>)
        : { data: apiPayload };
    return { ...base, flatFolders };
  }

  async getTestCaseVersionDetails(
    testCaseIdOrKey: string,
    versionNo: number,
    projectId: number,
    fields?: string
  ): Promise<unknown> {
    const q: Record<string, string> = { projectId: projectId.toString() };
    if (fields?.trim()) q.fields = fields.trim();
    return this.get(
      `/testcases/${encodeURIComponent(testCaseIdOrKey)}/versions/${versionNo}`,
      q
    );
  }

  async getTestCaseFlexible(testCaseId: string, projectId: number, versionNo?: number): Promise<unknown> {
    const q = { projectId: projectId.toString() };
    if (versionNo != null) {
      try {
        return await this.getTestCaseVersionDetails(testCaseId, versionNo, projectId, undefined);
      } catch {
        const ref = await this.searchTestCaseByKey(projectId, testCaseId);
        if (!ref) throw new Error(`Test case not found: ${testCaseId}`);
        return await this.getTestCaseVersionDetails(ref.id, versionNo, projectId, undefined);
      }
    }
    try {
      return await this.get(`/testcases/${encodeURIComponent(testCaseId)}`, q);
    } catch {
      const ref = await this.searchTestCaseByKey(projectId, testCaseId);
      if (!ref) throw new Error(`Test case not found: ${testCaseId}`);
      return this.get(`/testcases/${encodeURIComponent(ref.id)}`, q);
    }
  }

  async createTestCaseFolder(
    projectId: number,
    folderName: string,
    parentId: number,
    description?: string
  ): Promise<unknown> {
    const body: Record<string, unknown> = { folderName, parentId };
    if (description?.trim()) body.description = description.trim();
    return this.post(`/projects/${projectId}/testcase-folders`, body);
  }

  /**
   * PUT /testcases/{id}/versions/{no} — same endpoint as folder updates (MetaDataUpdateRequest in Swagger).
   */
  private async putTestCaseVersion(
    testCaseId: string,
    versionNo: number,
    projectId: number,
    extra: Record<string, unknown>
  ): Promise<unknown> {
    return this.put(
      `/testcases/${encodeURIComponent(testCaseId)}/versions/${versionNo}`,
      { projectId, ...extra },
      { projectId: projectId.toString() }
    );
  }

  async updateTestCaseFolders(
    testCaseId: string,
    versionNo: number,
    projectId: number,
    addFolderIds?: number[],
    removeFolderIds?: number[]
  ): Promise<unknown> {
    const folders: Record<string, number[]> = {};
    if (addFolderIds?.length) folders.add = addFolderIds;
    if (removeFolderIds?.length) folders.delete = removeFolderIds;
    return this.putTestCaseVersion(testCaseId, versionNo, projectId, { folders });
  }

  /** Update test case version summary (title). */
  async updateTestCaseSummary(
    testCaseId: string,
    versionNo: number,
    projectId: number,
    summary: string
  ): Promise<unknown> {
    return this.putTestCaseVersion(testCaseId, versionNo, projectId, { summary });
  }

  /** Update test case version description. */
  async updateTestCaseDescription(
    testCaseId: string,
    versionNo: number,
    projectId: number,
    description: string
  ): Promise<unknown> {
    return this.putTestCaseVersion(testCaseId, versionNo, projectId, { description });
  }

  /**
   * PUT …/versions/{v}/teststeps — update step(s); body is an array per Swagger (UpdateTestStepRequest).
   * stepId must be the numeric `id` from get_test_case_steps. When useLatestVersion is true, the path uses `latest`.
   */
  async updateTestCaseStep(
    testCaseId: string,
    versionNo: number,
    projectId: number,
    stepId: string,
    fields: { stepDetails?: string; expectedResult?: string; testData?: string },
    useLatestVersion?: boolean
  ): Promise<unknown> {
    const ver = useLatestVersion ? "latest" : String(versionNo ?? 1);
    const hasMutableField =
      fields.stepDetails !== undefined ||
      fields.expectedResult !== undefined ||
      fields.testData !== undefined;
    if (!hasMutableField) {
      throw new Error("Provide at least one of stepDetails, expectedResult, or testData");
    }
    const idNum = Number(stepId);
    if (!Number.isFinite(idNum)) {
      throw new Error(`stepId must be the numeric id from get_test_case_steps; got: ${stepId}`);
    }
    const step: Record<string, unknown> = { id: idNum };
    if (fields.stepDetails !== undefined) step.stepDetails = fields.stepDetails;
    if (fields.expectedResult !== undefined) step.expectedResult = fields.expectedResult;
    if (fields.testData !== undefined) step.testData = fields.testData;
    return this.put(
      `/testcases/${encodeURIComponent(testCaseId)}/versions/${ver}/teststeps`,
      [step],
      { projectId: projectId.toString() }
    );
  }

  async searchTestCaseSteps(params: {
    testCaseId: string;
    versionNo: number;
    projectId: number;
    startAt?: number;
    maxResults?: number;
    sort?: string;
    stepDetailsContains?: string;
    testDataContains?: string;
    expectedResultContains?: string;
    useLatestVersion?: boolean;
  }): Promise<unknown> {
    const ver = params.useLatestVersion ? "latest" : String(params.versionNo ?? 1);
    const maxResults = Math.min(Math.max(params.maxResults ?? 50, 1), 100);
    const startAt = params.startAt ?? 0;
    const basePath = `/testcases/${encodeURIComponent(params.testCaseId)}/versions/${ver}/teststeps`;

    // QTM4J Cloud: GET …/teststeps is not supported (405). List/search is POST …/teststeps/search (Swagger: GetTestStepRequest).
    // Body is either {} (all steps) or { filter: { stepDetails?, testData?, expectedResult? } } — no projectId in filter.
    const sd = params.stepDetailsContains?.trim();
    const td = params.testDataContains?.trim();
    const er = params.expectedResultContains?.trim();
    const hasStepFilters = Boolean(sd || td || er);

    const filter: Record<string, string> = {};
    if (sd) filter.stepDetails = sd.startsWith("~") ? sd : `~${sd}`;
    if (td) filter.testData = td.startsWith("~") ? td : `~${td}`;
    if (er) filter.expectedResult = er.startsWith("~") ? er : `~${er}`;

    const paginationQuery: Record<string, string> = {
      startAt: String(startAt),
      maxResults: String(maxResults),
    };
    if (params.sort?.trim()) paginationQuery.sort = params.sort.trim();

    const body: Record<string, unknown> = hasStepFilters ? { filter } : {};

    return this.post(`${basePath}/search`, body, paginationQuery);
  }

  async addTestCaseSteps(
    testCaseId: string,
    versionNo: number,
    projectId: number,
    steps: Array<{ stepDetails: string; expectedResult?: string; testData?: string }>,
    aiGenerated?: boolean
  ): Promise<unknown> {
    const query: Record<string, string> = { projectId: projectId.toString() };
    if (aiGenerated) query.aiGenerated = "true";
    return this.post(
      `/testcases/${encodeURIComponent(testCaseId)}/versions/${versionNo}/teststeps`,
      steps,
      query
    );
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

export function extractId(root: Record<string, unknown>): string | null {
  if (root?.id != null) return root.id.toString();
  if (root?.data && typeof root.data === "object" && !Array.isArray(root.data)) {
    const id = (root.data as Record<string, unknown>).id;
    return id != null ? id.toString() : null;
  }
  return null;
}

export function extractVersionNo(obj: Record<string, unknown>): number {
  if (obj?.version && typeof obj.version === "object") {
    const v = (obj.version as Record<string, unknown>).versionNo;
    return v != null ? Number(v) : 1;
  }
  return 1;
}

export function extractExecutionId(root: Record<string, unknown>): number | null {
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
