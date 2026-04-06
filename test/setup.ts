import { afterEach } from "vitest";

afterEach(() => {
  delete process.env.QTM4J_API_KEY;
  delete process.env.QTM4J_BASE_URL;
  delete process.env.QTM4J_PROJECT_ID;
});
