import { z } from "zod";
import type { CycleTestCase, TestCaseRef } from "./qtm4j-client.js";

export interface QTM4JToolClient {
  createTestCycle(projectId: number, summary: string): Promise<string | null>;
  searchTestCaseByKey(projectId: number, key: string): Promise<TestCaseRef | null>;
  createTestCase(projectId: number, summary: string): Promise<TestCaseRef | null>;
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
  create_test_case: {
    description: "Create a new test case in QTM4J. Returns test case ID and version.",
    parameters: (defaultProjectId?: number) => ({
      projectId: optionalProjectId(defaultProjectId),
      summary: z.string().describe("Test case summary/title"),
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
} as const satisfies Record<string, ToolDefinition>;

export type ToolName = keyof typeof TOOL_DEFINITIONS;

type ToolHandlerMap = Record<ToolName, (args: Record<string, unknown>) => Promise<ToolResult>>;

function resolveProjectId(projectId: number | undefined, defaultProjectId?: number): number | undefined {
  return projectId ?? defaultProjectId;
}

function requireProjectId(projectId: number | undefined, defaultProjectId?: number): number | ToolResult {
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
      const pid = requireProjectId(projectId as number | undefined, defaultProjectId);
      if (typeof pid !== "number") return pid;

      const cycleId = await client.createTestCycle(pid, summary as string);
      if (!cycleId) return errorResult("Failed to create test cycle");

      return textResult({ cycleId });
    },
    search_test_case: async ({ projectId, key }) => {
      const pid = requireProjectId(projectId as number | undefined, defaultProjectId);
      if (typeof pid !== "number") return pid;

      const ref = await client.searchTestCaseByKey(pid, key as string);
      if (!ref) return errorResult(`Test case not found: ${key as string}`);

      return textResult({ testCaseId: ref.id, versionNo: ref.versionNo });
    },
    create_test_case: async ({ projectId, summary }) => {
      const pid = requireProjectId(projectId as number | undefined, defaultProjectId);
      if (typeof pid !== "number") return pid;

      const ref = await client.createTestCase(pid, summary as string);
      if (!ref) return errorResult("Failed to create test case");

      return textResult({ testCaseId: ref.id, versionNo: ref.versionNo });
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
      const pid = requireProjectId(projectId as number | undefined, defaultProjectId);
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
      const pid = requireProjectId(projectId as number | undefined, defaultProjectId);
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
      const pid = requireProjectId(projectId as number | undefined, defaultProjectId);
      if (typeof pid !== "number") return pid;

      const result = await client.getAttachmentUrl(
        testCycleId as string,
        pid,
        fileName as string,
        testCaseExecutionId as number
      );
      return textResult(result);
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
