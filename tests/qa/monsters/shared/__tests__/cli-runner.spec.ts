import { describe, it, expect } from "vitest";
import { parseResultFromOutput, MonsterResultEnvelope } from "../cli-runner";

describe("parseResultFromOutput", () => {
  it("parses a valid result envelope from output", () => {
    const envelope: MonsterResultEnvelope = {
      passed: true,
      skipped: false,
      duration: 1234,
      findings: 3,
      checks: 100,
      severity: { critical: 0, high: 1, medium: 2, low: 0 },
    };

    const output = [
      "[12:00:00.000] [Test Monster] Starting...",
      "[12:00:01.000] [Test Monster] Completed",
      `MONSTER_RESULT_JSON:${JSON.stringify(envelope)}`,
    ].join("\n");

    const result = parseResultFromOutput(output);
    expect(result).toEqual(envelope);
  });

  it("returns null when no envelope is present", () => {
    const output = "just some normal output\nno result line here";
    expect(parseResultFromOutput(output)).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    const output = "MONSTER_RESULT_JSON:{not valid json}";
    expect(parseResultFromOutput(output)).toBeNull();
  });

  it("picks the last envelope when multiple exist", () => {
    const first: MonsterResultEnvelope = {
      passed: false,
      skipped: false,
      duration: 100,
      findings: 5,
      checks: 50,
      severity: { critical: 1, high: 2, medium: 2, low: 0 },
    };
    const second: MonsterResultEnvelope = {
      passed: true,
      skipped: false,
      duration: 200,
      findings: 0,
      checks: 100,
      severity: { critical: 0, high: 0, medium: 0, low: 0 },
    };

    const output = [
      `MONSTER_RESULT_JSON:${JSON.stringify(first)}`,
      "some more output",
      `MONSTER_RESULT_JSON:${JSON.stringify(second)}`,
    ].join("\n");

    const result = parseResultFromOutput(output);
    expect(result).toEqual(second);
  });

  it("handles envelope with error field", () => {
    const envelope: MonsterResultEnvelope = {
      passed: false,
      skipped: false,
      duration: 0,
      findings: 0,
      checks: 0,
      severity: { critical: 0, high: 0, medium: 0, low: 0 },
      error: "Timeout after 60000ms",
    };

    const output = `MONSTER_RESULT_JSON:${JSON.stringify(envelope)}`;
    const result = parseResultFromOutput(output);
    expect(result?.error).toBe("Timeout after 60000ms");
    expect(result?.passed).toBe(false);
  });

  it("handles skipped result", () => {
    const envelope: MonsterResultEnvelope = {
      passed: true,
      skipped: true,
      duration: 0,
      findings: 0,
      checks: 0,
      severity: { critical: 0, high: 0, medium: 0, low: 0 },
    };

    const output = `MONSTER_RESULT_JSON:${JSON.stringify(envelope)}`;
    const result = parseResultFromOutput(output);
    expect(result?.skipped).toBe(true);
  });
});
