import type { SportRow } from "./data";

export type Assumptions = {
  targetPercent: string;
  monthlyCost: string;
  months: string;
};
export type ScenarioResult = {
  targetCount: bigint;
  additionalCount: bigint;
  cost: bigint;
  observedPercent: string;
};
export class CalculationError extends Error {}

function boundedInteger(value: number | null, label: string): bigint {
  if (value === null || !Number.isSafeInteger(value) || value < 0)
    throw new CalculationError(`${label} 값이 비어 있거나 정수가 아닙니다.`);
  return BigInt(value);
}

export function calculate(
  row: SportRow,
  assumptions: Assumptions,
): ScenarioResult {
  if (row.quality_status === "hold" && row.issues.length)
    throw new CalculationError(row.issues.join(" · "));
  const target = boundedInteger(row.CRRSPND_FLAG_TRGET_NMPR_CO, "대상인원");
  const received = boundedInteger(row.CRRSPND_FLAG_RECIPT_NMPR_CO, "수급인원");
  if (target === 0n)
    throw new CalculationError(
      "대상인원이 0명이므로 비율을 계산할 수 없습니다.",
    );
  if (received > target)
    throw new CalculationError(
      "수급인원이 대상인원을 초과합니다. 자료를 확인해 주세요.",
    );
  if (!/^(?:0|[1-9]\d{0,2})(?:\.\d{1,2})?$/.test(assumptions.targetPercent))
    throw new CalculationError(
      "목표 비율은 0~100%, 소수 둘째 자리까지 입력해 주세요.",
    );
  const percent = Number(assumptions.targetPercent);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100)
    throw new CalculationError("목표 비율은 0~100% 범위로 입력해 주세요.");
  if (!/^(?:0|[1-9]\d{0,6})$/.test(assumptions.monthlyCost))
    throw new CalculationError("월 단가는 0~1,000,000원 정수로 입력해 주세요.");
  const costValue = Number(assumptions.monthlyCost);
  if (!Number.isSafeInteger(costValue) || costValue > 1_000_000)
    throw new CalculationError("월 단가는 0~1,000,000원 범위로 입력해 주세요.");
  if (!/^(?:[1-9]|1[0-2])$/.test(assumptions.months))
    throw new CalculationError("기간은 1~12개월 정수로 입력해 주세요.");
  const targetBps = BigInt(Math.round(percent * 100));
  const targetCount = (target * targetBps + 9999n) / 10000n;
  const additionalCount = targetCount > received ? targetCount - received : 0n;
  const cost = additionalCount * BigInt(costValue) * BigInt(assumptions.months);
  const observedHundredths = (received * 10000n + target / 2n) / target;
  const observedPercent = `${observedHundredths / 100n}.${(observedHundredths % 100n).toString().padStart(2, "0")}`;
  return { targetCount, additionalCount, cost, observedPercent };
}

export function formatInteger(value: number | bigint): string {
  const text = String(value);
  return text.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatCurrency(value: bigint): string {
  return `${formatInteger(value)}원`;
}
