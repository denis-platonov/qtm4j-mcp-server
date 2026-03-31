import { z } from "zod";

export const TOOL_DEFINITIONS = {
  create_test_cycle: {
    description:
      "Create a new test cycle (run) in QTM4J. Returns the cycle ID.",
    schema: z.object({
      projectId: z.number().describe("QMetry project ID"),
      summary: z.string().describe("Test cycle name/summary"),
    }),
  },

  search_test_case: {
    description:
      "Search for a test case by its key (e.g. PE26-TC-2). Returns test case ID and version number.",
    schema: z.object({
      projectId: z.number().describe("QMetry project ID"),
      key: z.string().describe("Test case key, e.g. PE26-TC-2"),
    }),
  },

  create_test_case: {
    description:
      "Create a new test case in QTM4J. Returns test case ID and version number.",
    schema: z.object({
      projectId: z.number().describe("QMetry project ID"),
      summary: z.string().describe("Test case summary/title"),
    }),
  },

  list_cycle_test_cases: {
    description:
      "List all test cases in a test cycle. Returns test case execution IDs.",
    schema: z.object({
      testCycleId: z.string().describe("Test cycle ID"),
    }),
  },

  add_test_case_to_cycle: {
    description:
      "Add a test case to a test cycle. Returns the test case execution ID.",
    schema: z.object({
      testCycleId: z.string().describe("Test cycle ID"),
      testCaseId: z.string().describe("Test case ID"),
      versionNo: z
        .number()
        .default(1)
        .describe("Test case version number (default 1)"),
    }),
  },

  update_execution_status: {
    description:
      "Update the execution result (Pass/Fail) for a test case execution in a cycle.",
    schema: z.object({
      projectId: z.number().describe("QMetry project ID"),
      testCycleId: z.string().describe("Test cycle ID"),
      testCaseExecutionId: z
        .number()
        .describe("Test case execution ID within the cycle"),
      executionResultId: z
        .number()
        .describe(
          "Execution result ID (e.g. 279279 for Pass, 279276 for Fail — project-specific)"
        ),
    }),
  },

  close_test_cycle: {
    description: "Close a test cycle by setting its status.",
    schema: z.object({
      projectId: z.number().describe("QMetry project ID"),
      testCycleId: z.string().describe("Test cycle ID"),
      statusId: z
        .number()
        .describe("Status ID for 'Done' (project-specific, e.g. 621499)"),
    }),
  },

  get_attachment_url: {
    description:
      "Get a presigned URL for uploading an attachment to a test case execution.",
    schema: z.object({
      testCycleId: z.string().describe("Test cycle ID"),
      projectId: z.number().describe("QMetry project ID"),
      fileName: z.string().describe("Name of the file to attach"),
      testCaseExecutionId: z
        .number()
        .describe("Test case execution ID within the cycle"),
    }),
  },
} as const;

export type ToolName = keyof typeof TOOL_DEFINITIONS;
