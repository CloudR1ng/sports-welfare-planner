import { expect, test } from "vitest";
import { calculate } from "../src/calculate";
import type { SportRow } from "../src/data";

// Entirely synthetic fixtures; no official region record is distributed.
const synthetic = (target: number | null, received: number | null): SportRow => ({
  BASE_YEAR: "2000", CTPRVN_CD: "99", CTPRVN_NM: "테스트 시도",
  SIGNGU_CD: "99001", SIGNGU_NM: "테스트 지역", SIGNGU_ACCTO_POPLTN_CO: 0,
  SIGNGU_ACCTO_FCLTY_CO: 0, RECIPT_FLAG_CD: "N", RECIPT_FLAG_NM: "테스트 구분",
  CRRSPND_FLAG_TRGET_NMPR_CO: target, CRRSPND_FLAG_RECIPT_NMPR_CO: received,
  source_row_id: "synthetic", source_data_index: 1, quality_status: "valid", issues: [],
});
const assumptions = (targetPercent = "12.50", monthlyCost = "1000", months = "3") => ({ targetPercent, monthlyCost, months });
test("synthetic target uses ceiling and exact cost", () => {
  expect(calculate(synthetic(123, 4), assumptions())).toEqual({ targetCount: 16n, additionalCount: 12n, cost: 36000n, observedPercent: "3.25" });
});
test("fractional percentage boundaries", () => {
  expect(calculate(synthetic(10000, 0), assumptions("0.07")).targetCount).toBe(7n);
  expect(calculate(synthetic(3, 0), assumptions("33.34")).targetCount).toBe(2n);
});
test("observed count above goal requires no additional cost", () => {
  expect(calculate(synthetic(123, 20), assumptions()).cost).toBe(0n);
});
test("invalid source counts block calculation", () => {
  for (const [target, received] of [[0,0], [null,0], [-1,0], [3,4], [3,1.5]] as const)
    expect(() => calculate(synthetic(target, received), assumptions())).toThrow();
});
test("empty or out-of-range assumptions are rejected", () => {
  for (const input of [assumptions("100.01"), assumptions("1.001"), assumptions("10", ""), assumptions("10", "1000001"), assumptions("10", "1", "13")])
    expect(() => calculate(synthetic(123, 4), input)).toThrow();
  expect(calculate(synthetic(123, 4), assumptions("50", "0")).cost).toBe(0n);
});
