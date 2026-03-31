#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { QTM4JClient } from "./qtm4j-client.js";

const baseUrl =
  process.env.QTM4J_BASE_URL ?? "https://qtmcloud.qmetry.com/rest/api/latest";
const apiKey = process.env.QTM4J_API_KEY;
const defaultProjectId = process.env.QTM4J_PROJECT_ID
  ? Number(process.env.QTM4J_PROJECT_ID)
  : undefined;

if (!apiKey) {
  console.error("QTM4J_API_KEY environment variable is required");
  process.exit(1);
}

const client = new QTM4JClient(baseUrl, apiKey);

const server = new McpServer(
  { name: "qtm4j-mcp-server", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// --- Tool registrations ---

server.tool(
  "create_test_cycle",
  "Create a new test cycle (run) in QTM4J. Returns the cycle ID.",
  {
    projectId: z
      .number()
      .optional()
      .describe(`QMetry project ID (default: ${defaultProjectId ?? "none"})`),
    summary: z.string().describe("Test cycle name/summary"),
  },
  async ({ projectId, summary }) => {
    const pid = projectId ?? defaultProjectId;
    if (!pid) return errorResult("projectId is required (no default configured)");

    const cycleId = await client.createTestCycle(pid, summary);
    if (!cycleId) return errorResult("Failed to create test cycle");

    return textResult({ cycleId });
  }
);

server.tool(
  "search_test_case",
  "Search for a test case by key (e.g. PE26-TC-2). Returns test case ID and version.",
  {
    projectId: z
      .number()
      .optional()
      .describe(`QMetry project ID (default: ${defaultProjectId ?? "none"})`),
    key: z.string().describe("Test case key, e.g. PE26-TC-2"),
  },
  async ({ projectId, key }) => {
    const pid = projectId ?? defaultProjectId;
    if (!pid) return errorResult("projectId is required (no default configured)");

    const ref = await client.searchTestCaseByKey(pid, key);
    if (!ref) return errorResult(`Test case not found: ${key}`);

    return textResult({ testCaseId: ref.id, versionNo: ref.versionNo });
  }
);

server.tool(
  "create_test_case",
  "Create a new test case in QTM4J. Returns test case ID and version.",
  {
    projectId: z
      .number()
      .optional()
      .describe(`QMetry project ID (default: ${defaultProjectId ?? "none"})`),
    summary: z.string().describe("Test case summary/title"),
  },
  async ({ projectId, summary }) => {
    const pid = projectId ?? defaultProjectId;
    if (!pid) return errorResult("projectId is required (no default configured)");

    const ref = await client.createTestCase(pid, summary);
    if (!ref) return errorResult("Failed to create test case");

    return textResult({ testCaseId: ref.id, versionNo: ref.versionNo });
  }
);

server.tool(
  "list_cycle_test_cases",
  "List all test cases in a test cycle with their execution IDs.",
  {
    testCycleId: z.string().describe("Test cycle ID"),
  },
  async ({ testCycleId }) => {
    const cases = await client.listCycleTestCases(testCycleId);
    return textResult({ count: cases.length, testCases: cases });
  }
);

server.tool(
  "add_test_case_to_cycle",
  "Add a test case to a test cycle. Returns the execution ID.",
  {
    testCycleId: z.string().describe("Test cycle ID"),
    testCaseId: z.string().describe("Test case ID"),
    versionNo: z.number().default(1).describe("Test case version number (default 1)"),
  },
  async ({ testCycleId, testCaseId, versionNo }) => {
    const execId = await client.addTestCaseToCycle(testCycleId, testCaseId, versionNo);
    if (execId === null) return errorResult("Failed to add test case to cycle");

    return textResult({ testCaseExecutionId: execId });
  }
);

server.tool(
  "update_execution_status",
  "Update execution result (Pass/Fail) for a test case execution in a cycle.",
  {
    projectId: z
      .number()
      .optional()
      .describe(`QMetry project ID (default: ${defaultProjectId ?? "none"})`),
    testCycleId: z.string().describe("Test cycle ID"),
    testCaseExecutionId: z.number().describe("Test case execution ID"),
    executionResultId: z
      .number()
      .describe("Execution result ID (project-specific, e.g. 279279=Pass, 279276=Fail)"),
  },
  async ({ projectId, testCycleId, testCaseExecutionId, executionResultId }) => {
    const pid = projectId ?? defaultProjectId;
    if (!pid) return errorResult("projectId is required (no default configured)");

    await client.updateExecutionStatus(pid, testCycleId, testCaseExecutionId, executionResultId);
    return textResult({ success: true, testCaseExecutionId, executionResultId });
  }
);

server.tool(
  "close_test_cycle",
  "Close a test cycle by setting its status to Done.",
  {
    projectId: z
      .number()
      .optional()
      .describe(`QMetry project ID (default: ${defaultProjectId ?? "none"})`),
    testCycleId: z.string().describe("Test cycle ID"),
    statusId: z.number().describe("Status ID for Done (project-specific, e.g. 621499)"),
  },
  async ({ projectId, testCycleId, statusId }) => {
    const pid = projectId ?? defaultProjectId;
    if (!pid) return errorResult("projectId is required (no default configured)");

    await client.closeTestCycle(pid, testCycleId, statusId);
    return textResult({ success: true, testCycleId, status: "closed" });
  }
);

server.tool(
  "get_attachment_url",
  "Get a presigned URL for uploading an attachment to a test case execution.",
  {
    testCycleId: z.string().describe("Test cycle ID"),
    projectId: z
      .number()
      .optional()
      .describe(`QMetry project ID (default: ${defaultProjectId ?? "none"})`),
    fileName: z.string().describe("Name of the file to attach"),
    testCaseExecutionId: z.number().describe("Test case execution ID"),
  },
  async ({ testCycleId, projectId, fileName, testCaseExecutionId }) => {
    const pid = projectId ?? defaultProjectId;
    if (!pid) return errorResult("projectId is required (no default configured)");

    const result = await client.getAttachmentUrl(testCycleId, pid, fileName, testCaseExecutionId);
    return textResult(result);
  }
);

// --- Helpers ---

function textResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function errorResult(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

// --- Start ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`qtm4j-mcp-server running (base: ${baseUrl})`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
