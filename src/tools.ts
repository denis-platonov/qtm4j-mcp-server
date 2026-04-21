import { z } from "zod";
import type { CycleTestCase, TestCaseRef } from "./qtm4j-client.js";

export interface QTM4JToolClient {
  createTestCycle(projectId: number, summary: string): Promise<string | null>;
  searchTestCaseByKey(projectId: number, key: string): Promise<TestCaseRef | null>;
  searchTestCases(params: {
    projectId: number;
    key?: string;
    summary?: string;
    startAt?: number;
    maxResults?: number;
  }): Promise<Record<string, unknown>>;
  listAllProjectTestCases(params: {
    projectId: number;
    key?: string;
    summaryContains?: string;
    maxResultsPerPage?: number;
    maxPages?: number;
  }): Promise<Record<string, unknown>>;
  createTestCaseWithFolders(
    projectId: number,
    summary: string,
    opts: { folderId?: number; autoPickFolder?: boolean; folderKeywords?: string[] }
  ): Promise<Record<string, unknown> | null>;
  listTestCaseFoldersWithFlat(projectId: number, withCount?: boolean): Promise<Record<string, unknown>>;
  getTestCaseFlexible(testCaseId: string, projectId: number, versionNo?: number): Promise<unknown>;
  getTestCaseVersionDetails(
    testCaseIdOrKey: string,
    versionNo: number,
    projectId: number,
    fields?: string
  ): Promise<unknown>;
  createTestCaseFolder(
    projectId: number,
    folderName: string,
    parentId: number,
    description?: string
  ): Promise<unknown>;
  updateTestCaseFolders(
    testCaseId: string,
    versionNo: number,
    projectId: number,
    addFolderIds?: number[],
    removeFolderIds?: number[]
  ): Promise<unknown>;
  searchTestCaseSteps(params: {
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
  }): Promise<unknown>;
  addTestCaseSteps(
    testCaseId: string,
    versionNo: number,
    projectId: number,
    steps: Array<{ stepDetails: string; expectedResult?: string; testData?: string }>,
    aiGenerated?: boolean
  ): Promise<unknown>;
  listCycleTestCases(testCycleId: string): Promise<CycleTestCase[]>;
  addTestCaseToCycle(testCycleId: string, testCaseId: string, versionNo: number): Promise<number | null>;
  updateExecutionStatus(
    projectId: number,
    testCycleId: string,
    testCaseExecutionId: number,
    executionResultId: number
  ): Promise<void>;
  closeTestCycle(projectId: number, testCycleId: string, statusId: number): Promise<void>;
  getAttachmentUrl(
    testCycleId: string,
    projectId: number,
    fileName: string,
    testCaseExecutionId: number
  ): Promise<unknown>;
}

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: true;
}

export interface ToolRegistrar {
  tool(
    name: string,
    description: string,
    parameters: Record<string, z.ZodTypeAny>,
    handler: (args: Record<string, unknown>) => Promise<ToolResult>
  ): void;
}

type ToolParameterFactory = (defaultProjectId?: number) => Record<string, z.ZodTypeAny>;

interface ToolDefinition {
  description: string;
  parameters: ToolParameterFactory;
}

function optionalProjectId(defaultProjectId?: number) {
  return z
    .number()
    .optional()
    .describe(`QMetry project ID (default: ${defaultProjectId ?? "none"})`);
}

export const TOOL_DEFINITIONS = {
  create_test_cycle: {
    description: "Create a new test cycle (run) in QTM4J. Returns the cycle ID.",
    parameters: (defaultProjectId?: number) => ({
      projectId: optionalProjectId(defaultProjectId),
      summary: z.string().describe("Test cycle name/summary"),
    }),
  },
  search_test_case: {
    description: "Search for a test case by key (e.g. PE26-TC-2). Returns test case ID and version.",
    parameters: (defaultProjectId?: number) => ({
      projectId: optionalProjectId(defaultProjectId),
      key: z.string().describe("Test case key, e.g. PE26-TC-2"),
    }),
  },
  search_test_cases: {
    description:
      "Paginated POST /testcases/search. Returns the raw API JSON (includes data, total, startAt, maxResults when provided). Use startAt/maxResults for paging; summaryContains adds a leading ~ for contains-style summary filter when not already present.",
    parameters: (defaultProjectId?: number) => ({
      projectId: optionalProjectId(defaultProjectId),
      key: z.string().optional().describe("Exact test case key filter (optional)"),
      summaryContains: z
        .string()
        .optional()
        .describe("Summary substring filter; sent as filter.summary with ~ prefix unless value already starts with ~"),
      summary: z
        .string()
        .optional()
        .describe("Raw filter.summary value (advanced; overrides summaryContains when both set)"),
      startAt: z.number().int().min(0).optional().default(0).describe("Zero-based offset for this page"),
      maxResults: z
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .default(100)
        .describe("Page size (1–500, default 100)"),
    }),
  },
  list_all_project_test_cases: {
    description:
      "Fetches all pages of /testcases/search for a project until a short page or maxPages. Merges rows and dedupes by test case key when present. Use for exporting or counting beyond a single page.",
    parameters: (defaultProjectId?: number) => ({
      projectId: optionalProjectId(defaultProjectId),
      key: z.string().optional().describe("Optional exact key filter"),
      summaryContains: z
        .string()
        .optional()
        .describe("Optional summary contains filter (~ prefix applied like search_test_cases)"),
      maxResultsPerPage: z
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .default(100)
        .describe("Page size per request"),
      maxPages: z
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .default(100)
        .describe("Safety cap: max pages to fetch (default 100 → up to 10k rows at page size 100)"),
    }),
  },
  create_test_case: {
    description:
      "Create a new test case in QTM4J. Returns testCaseId, versionNo, and optional folderId / pickedFolder / folderWarning. Use folderId, or autoPickFolder with optional folderKeywords.",
    parameters: (defaultProjectId?: number) => ({
      projectId: optionalProjectId(defaultProjectId),
      summary: z.string().describe("Test case summary/title"),
      folderId: z
        .number()
        .optional()
        .describe("Place the new case in this folder (from list_test_case_folders flatFolders.id)"),
      autoPickFolder: z
        .boolean()
        .optional()
        .describe("If true, score folders using built-in Web/LEX-style keywords plus folderKeywords"),
      folderKeywords: z
        .array(z.string())
        .optional()
        .describe("Extra keywords matched against folder path (case-insensitive)"),
    }),
  },
  list_cycle_test_cases: {
    description: "List all test cases in a test cycle with their execution IDs.",
    parameters: () => ({
      testCycleId: z.string().describe("Test cycle ID"),
    }),
  },
  add_test_case_to_cycle: {
    description: "Add a test case to a test cycle. Returns the execution ID.",
    parameters: () => ({
      testCycleId: z.string().describe("Test cycle ID"),
      testCaseId: z.string().describe("Test case ID"),
      versionNo: z.number().default(1).describe("Test case version number (default 1)"),
    }),
  },
  update_execution_status: {
    description: "Update execution result (Pass/Fail) for a test case execution in a cycle.",
    parameters: (defaultProjectId?: number) => ({
      projectId: optionalProjectId(defaultProjectId),
      testCycleId: z.string().describe("Test cycle ID"),
      testCaseExecutionId: z.number().describe("Test case execution ID"),
      executionResultId: z
        .number()
        .describe("Execution result ID (project-specific, e.g. 279279=Pass, 279276=Fail)"),
    }),
  },
  close_test_cycle: {
    description: "Close a test cycle by setting its status to Done.",
    parameters: (defaultProjectId?: number) => ({
      projectId: optionalProjectId(defaultProjectId),
      testCycleId: z.string().describe("Test cycle ID"),
      statusId: z.number().describe("Status ID for Done (project-specific, e.g. 621499)"),
    }),
  },
  get_attachment_url: {
    description: "Get a presigned URL for uploading an attachment to a test case execution.",
    parameters: (defaultProjectId?: number) => ({
      testCycleId: z.string().describe("Test cycle ID"),
      projectId: optionalProjectId(defaultProjectId),
      fileName: z.string().describe("Name of the file to attach"),
      testCaseExecutionId: z.number().describe("Test case execution ID"),
    }),
  },
  add_test_case_steps: {
    description:
      "Create test steps on a test case version (POST …/teststeps). steps[].stepDetails is required.",
    parameters: (defaultProjectId?: number) => ({
      projectId: optionalProjectId(defaultProjectId),
      testCaseId: z.string().describe("Internal test case id (or key if API accepts)"),
      versionNo: z.number().optional().default(1).describe("Test case version number"),
      steps: z
        .array(
          z.object({
            stepDetails: z.string(),
            expectedResult: z.string().optional(),
            testData: z.string().optional(),
          })
        )
        .min(1)
        .describe("Steps to create"),
      aiGenerated: z.boolean().optional().describe("If true, sends aiGenerated=true query flag"),
    }),
  },
  add_test_case_to_folders: {
    description:
      "Add a test case version to folders (PUT …/versions/{no} with folders.add). Use folder ids from list_test_case_folders.",
    parameters: (defaultProjectId?: number) => ({
      projectId: optionalProjectId(defaultProjectId),
      testCaseId: z.string().describe("Internal id or key PE26-TC-…"),
      versionNo: z.number().optional().default(1),
      addFolderIds: z.array(z.number()).min(1).describe("Folder ids to add"),
    }),
  },
  create_test_case_folder: {
    description: "Create a testcase folder (POST /projects/{projectId}/testcase-folders). parentId -1 = root.",
    parameters: (defaultProjectId?: number) => ({
      projectId: optionalProjectId(defaultProjectId),
      folderName: z.string().min(1).describe("New folder name"),
      parentId: z
        .number()
        .optional()
        .describe("Parent folder id from list_test_case_folders; omit for -1 (root)"),
      description: z.string().optional().describe("Optional folder description"),
    }),
  },
  get_test_case: {
    description:
      "GET /testcases/{id}; on failure resolves by key via search. Optional versionNo returns version details instead of slim record.",
    parameters: (defaultProjectId?: number) => ({
      projectId: optionalProjectId(defaultProjectId),
      testCaseId: z.string().describe("Internal id or key"),
      versionNo: z.number().optional().describe("If set, fetch that version details"),
    }),
  },
  get_test_case_details: {
    description: "GET /testcases/{id}/versions/{no} full version payload. Optional fields= comma-separated.",
    parameters: (defaultProjectId?: number) => ({
      projectId: optionalProjectId(defaultProjectId),
      testCaseId: z.string().describe("Internal id or key"),
      versionNo: z.number().optional().default(1),
      scope: z.enum(["project", "release", "cycle"]).optional().describe("Ignored; kept for compatibility"),
      fields: z.string().optional().describe("Optional comma-separated API fields"),
    }),
  },
  get_test_case_steps: {
    description: "POST …/teststeps/search with pagination (startAt, maxResults max 100).",
    parameters: (defaultProjectId?: number) => ({
      projectId: optionalProjectId(defaultProjectId),
      testCaseId: z.string().describe("Internal test case id"),
      versionNo: z.number().optional().default(1),
      startAt: z.number().int().min(0).optional().default(0),
      maxResults: z.number().int().min(1).max(100).optional().default(50),
      sort: z.string().optional().describe("e.g. seqNo:asc"),
      stepDetailsContains: z.string().optional(),
      testDataContains: z.string().optional(),
      expectedResultContains: z.string().optional(),
      useLatestVersion: z.boolean().optional().describe("Use /versions/latest/… path"),
    }),
  },
  list_test_case_folders: {
    description: "GET /projects/{id}/testcase-folders plus flatFolders (id, name, path).",
    parameters: (defaultProjectId?: number) => ({
      projectId: optionalProjectId(defaultProjectId),
      withCount: z.boolean().optional().describe("Request withCount=true when supported"),
    }),
  },
  remove_test_case_from_folders: {
    description: "Remove a test case version from folders (PUT …/versions/{no} with folders.delete).",
    parameters: (defaultProjectId?: number) => ({
      projectId: optionalProjectId(defaultProjectId),
      testCaseId: z.string().describe("Internal id or key"),
      versionNo: z.number().optional().default(1),
      removeFolderIds: z.array(z.number()).min(1).describe("Folder ids to remove"),
    }),
  },
} as const satisfies Record<string, ToolDefinition>;

export type ToolName = keyof typeof TOOL_DEFINITIONS;

type ToolHandlerMap = Record<ToolName, (args: Record<string, unknown>) => Promise<ToolResult>>;

/** Some MCP clients send numbers as strings; coerce so pagination and projectId work reliably. */
export function coerceOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function resolveProjectId(projectId: unknown, defaultProjectId?: number): number | undefined {
  const coerced = coerceOptionalNumber(projectId);
  if (coerced !== undefined) return coerced;
  return defaultProjectId;
}

function requireProjectId(projectId: unknown, defaultProjectId?: number): number | ToolResult {
  const resolvedProjectId = resolveProjectId(projectId, defaultProjectId);
  if (resolvedProjectId === undefined) {
    return errorResult("projectId is required (no default configured)");
  }
  return resolvedProjectId;
}

export function textResult(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

export function errorResult(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

export function createToolHandlers(
  client: QTM4JToolClient,
  defaultProjectId?: number
): ToolHandlerMap {
  return {
    create_test_cycle: async ({ projectId, summary }) => {
      const pid = requireProjectId(projectId, defaultProjectId);
      if (typeof pid !== "number") return pid;

      const cycleId = await client.createTestCycle(pid, summary as string);
      if (!cycleId) return errorResult("Failed to create test cycle");

      return textResult({ cycleId });
    },
    search_test_case: async ({ projectId, key }) => {
      const pid = requireProjectId(projectId, defaultProjectId);
      if (typeof pid !== "number") return pid;

      const ref = await client.searchTestCaseByKey(pid, key as string);
      if (!ref) return errorResult(`Test case not found: ${key as string}`);

      return textResult({ testCaseId: ref.id, versionNo: ref.versionNo });
    },
    search_test_cases: async ({ projectId, key, summaryContains, summary, startAt, maxResults }) => {
      const pid = requireProjectId(projectId, defaultProjectId);
      if (typeof pid !== "number") return pid;

      let summaryFilter: string | undefined;
      const rawSummary = typeof summary === "string" ? summary.trim() : "";
      if (rawSummary) {
        summaryFilter = rawSummary;
      } else if (typeof summaryContains === "string" && summaryContains.trim()) {
        const s = summaryContains.trim();
        summaryFilter = s.startsWith("~") ? s : `~${s}`;
      }

      const payload = await client.searchTestCases({
        projectId: pid,
        key: typeof key === "string" && key.trim() ? key.trim() : undefined,
        summary: summaryFilter,
        startAt: coerceOptionalNumber(startAt),
        maxResults: coerceOptionalNumber(maxResults),
      });
      return textResult(payload);
    },
    list_all_project_test_cases: async ({
      projectId,
      key,
      summaryContains,
      maxResultsPerPage,
      maxPages,
    }) => {
      const pid = requireProjectId(projectId, defaultProjectId);
      if (typeof pid !== "number") return pid;

      const payload = await client.listAllProjectTestCases({
        projectId: pid,
        key: typeof key === "string" && key.trim() ? key.trim() : undefined,
        summaryContains: typeof summaryContains === "string" ? summaryContains : undefined,
        maxResultsPerPage: coerceOptionalNumber(maxResultsPerPage),
        maxPages: coerceOptionalNumber(maxPages),
      });
      return textResult(payload);
    },
    create_test_case: async ({ projectId, summary, folderId, autoPickFolder, folderKeywords }) => {
      const pid = requireProjectId(projectId, defaultProjectId);
      if (typeof pid !== "number") return pid;

      const payload = await client.createTestCaseWithFolders(pid, summary as string, {
        folderId: folderId as number | undefined,
        autoPickFolder: autoPickFolder as boolean | undefined,
        folderKeywords: folderKeywords as string[] | undefined,
      });
      if (!payload) return errorResult("Failed to create test case");

      return textResult(payload);
    },
    list_cycle_test_cases: async ({ testCycleId }) => {
      const testCases = await client.listCycleTestCases(testCycleId as string);
      return textResult({ count: testCases.length, testCases });
    },
    add_test_case_to_cycle: async ({ testCycleId, testCaseId, versionNo }) => {
      const testCaseExecutionId = await client.addTestCaseToCycle(
        testCycleId as string,
        testCaseId as string,
        versionNo as number
      );
      if (testCaseExecutionId === null) {
        return errorResult("Failed to add test case to cycle");
      }

      return textResult({ testCaseExecutionId });
    },
    update_execution_status: async ({
      projectId,
      testCycleId,
      testCaseExecutionId,
      executionResultId,
    }) => {
      const pid = requireProjectId(projectId, defaultProjectId);
      if (typeof pid !== "number") return pid;

      await client.updateExecutionStatus(
        pid,
        testCycleId as string,
        testCaseExecutionId as number,
        executionResultId as number
      );
      return textResult({
        success: true,
        testCaseExecutionId,
        executionResultId,
      });
    },
    close_test_cycle: async ({ projectId, testCycleId, statusId }) => {
      const pid = requireProjectId(projectId, defaultProjectId);
      if (typeof pid !== "number") return pid;

      await client.closeTestCycle(pid, testCycleId as string, statusId as number);
      return textResult({ success: true, testCycleId, status: "closed" });
    },
    get_attachment_url: async ({
      testCycleId,
      projectId,
      fileName,
      testCaseExecutionId,
    }) => {
      const pid = requireProjectId(projectId, defaultProjectId);
      if (typeof pid !== "number") return pid;

      const result = await client.getAttachmentUrl(
        testCycleId as string,
        pid,
        fileName as string,
        testCaseExecutionId as number
      );
      return textResult(result);
    },
    add_test_case_steps: async ({
      projectId,
      testCaseId,
      versionNo,
      steps,
      aiGenerated,
    }) => {
      const pid = requireProjectId(projectId, defaultProjectId);
      if (typeof pid !== "number") return pid;
      const vNo = (versionNo as number | undefined) ?? 1;
      try {
        const data = await client.addTestCaseSteps(
          testCaseId as string,
          vNo,
          pid,
          steps as Array<{ stepDetails: string; expectedResult?: string; testData?: string }>,
          aiGenerated as boolean | undefined
        );
        return textResult(data);
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : String(e));
      }
    },
    add_test_case_to_folders: async ({ projectId, testCaseId, versionNo, addFolderIds }) => {
      const pid = requireProjectId(projectId, defaultProjectId);
      if (typeof pid !== "number") return pid;
      const vNo = (versionNo as number | undefined) ?? 1;
      try {
        const data = await client.updateTestCaseFolders(
          testCaseId as string,
          vNo,
          pid,
          addFolderIds as number[],
          undefined
        );
        return textResult(data);
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : String(e));
      }
    },
    create_test_case_folder: async ({ projectId, folderName, parentId, description: folderDescription }) => {
      const pid = requireProjectId(projectId, defaultProjectId);
      if (typeof pid !== "number") return pid;
      const p = parentId !== undefined ? (parentId as number) : -1;
      try {
        const data = await client.createTestCaseFolder(
          pid,
          folderName as string,
          p,
          folderDescription as string | undefined
        );
        return textResult(data);
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : String(e));
      }
    },
    get_test_case: async ({ projectId, testCaseId, versionNo }) => {
      const pid = requireProjectId(projectId, defaultProjectId);
      if (typeof pid !== "number") return pid;
      try {
        const data = await client.getTestCaseFlexible(
          testCaseId as string,
          pid,
          versionNo as number | undefined
        );
        return textResult(data);
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : String(e));
      }
    },
    get_test_case_details: async ({ projectId, testCaseId, versionNo, fields }) => {
      const pid = requireProjectId(projectId, defaultProjectId);
      if (typeof pid !== "number") return pid;
      const vNo = (versionNo as number | undefined) ?? 1;
      try {
        const data = await client.getTestCaseVersionDetails(
          testCaseId as string,
          vNo,
          pid,
          fields as string | undefined
        );
        return textResult(data);
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : String(e));
      }
    },
    get_test_case_steps: async ({
      projectId,
      testCaseId,
      versionNo,
      startAt,
      maxResults,
      sort,
      stepDetailsContains,
      testDataContains,
      expectedResultContains,
      useLatestVersion,
    }) => {
      const pid = requireProjectId(projectId, defaultProjectId);
      if (typeof pid !== "number") return pid;
      const vNo = (versionNo as number | undefined) ?? 1;
      try {
        const data = await client.searchTestCaseSteps({
          testCaseId: testCaseId as string,
          versionNo: vNo,
          projectId: pid,
          startAt: coerceOptionalNumber(startAt),
          maxResults: coerceOptionalNumber(maxResults),
          sort: sort as string | undefined,
          stepDetailsContains: stepDetailsContains as string | undefined,
          testDataContains: testDataContains as string | undefined,
          expectedResultContains: expectedResultContains as string | undefined,
          useLatestVersion: useLatestVersion as boolean | undefined,
        });
        return textResult(data);
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : String(e));
      }
    },
    list_test_case_folders: async ({ projectId, withCount }) => {
      const pid = requireProjectId(projectId, defaultProjectId);
      if (typeof pid !== "number") return pid;
      try {
        const data = await client.listTestCaseFoldersWithFlat(pid, withCount as boolean | undefined);
        return textResult(data);
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : String(e));
      }
    },
    remove_test_case_from_folders: async ({ projectId, testCaseId, versionNo, removeFolderIds }) => {
      const pid = requireProjectId(projectId, defaultProjectId);
      if (typeof pid !== "number") return pid;
      const vNo = (versionNo as number | undefined) ?? 1;
      try {
        const data = await client.updateTestCaseFolders(
          testCaseId as string,
          vNo,
          pid,
          undefined,
          removeFolderIds as number[]
        );
        return textResult(data);
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : String(e));
      }
    },
  };
}

export function registerQtm4jTools(
  registrar: ToolRegistrar,
  client: QTM4JToolClient,
  defaultProjectId?: number
): ToolHandlerMap {
  const handlers = createToolHandlers(client, defaultProjectId);

  (Object.keys(TOOL_DEFINITIONS) as ToolName[]).forEach((toolName) => {
    const definition = TOOL_DEFINITIONS[toolName];
    registrar.tool(
      toolName,
      definition.description,
      definition.parameters(defaultProjectId),
      handlers[toolName]
    );
  });

  return handlers;
}
