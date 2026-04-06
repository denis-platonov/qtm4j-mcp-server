import { describe, expect, it } from "vitest";
import { QTM4JClient } from "../../src/qtm4j-client.js";

const apiKey = process.env.QTM4J_API_KEY;
const baseUrl = process.env.QTM4J_BASE_URL ?? "https://qtmcloud.qmetry.com/rest/api/latest";
const projectId = Number(process.env.QTM4J_PROJECT_ID);

const liveConfigAvailable = Boolean(apiKey) && Number.isFinite(projectId);
const existingTestCaseKey = process.env.QTM4J_LIVE_TEST_CASE_KEY;
const existingCycleId = process.env.QTM4J_LIVE_TEST_CYCLE_ID;
const existingExecutionId = process.env.QTM4J_LIVE_TEST_EXECUTION_ID;
const mutationEnabled = process.env.QTM4J_LIVE_ENABLE_MUTATIONS === "1";

function getClient() {
  if (!apiKey) {
    throw new Error("QTM4J_API_KEY must be set for live tests");
  }
  return new QTM4JClient(baseUrl, apiKey);
}

describe("QTM4J live integration", () => {
  (liveConfigAvailable && existingTestCaseKey ? it : it.skip)(
    "searches for a known live test case",
    async () => {
      const client = getClient();
      const result = await client.searchTestCaseByKey(projectId, existingTestCaseKey!);

      expect(result).not.toBeNull();
      expect(result?.id).toBeTruthy();
      expect(result?.versionNo).toBeGreaterThan(0);
    }
  );

  (liveConfigAvailable && existingCycleId ? it : it.skip)("lists test cases for an existing cycle", async () => {
    const client = getClient();
    const result = await client.listCycleTestCases(existingCycleId!);

    expect(Array.isArray(result)).toBe(true);
  });

  (liveConfigAvailable && existingCycleId && existingExecutionId ? it : it.skip)(
    "fetches an attachment upload url for an existing execution",
    async () => {
      const client = getClient();
      const response = await client.getAttachmentUrl(
        existingCycleId!,
        projectId,
        `vitest-live-${Date.now()}.txt`,
        Number(existingExecutionId)
      );

      expect(response).toBeTruthy();
    }
  );

  (liveConfigAvailable && mutationEnabled ? it : it.skip)(
    "creates real artifacts when mutation tests are explicitly enabled",
    async () => {
      const client = getClient();
      const suffix = Date.now();
      const cycleId = await client.createTestCycle(projectId, `Vitest live cycle ${suffix}`);
      const testCase = await client.createTestCase(projectId, `Vitest live case ${suffix}`);

      expect(cycleId).toBeTruthy();
      expect(testCase?.id).toBeTruthy();
    }
  );
});
