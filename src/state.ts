import type { Assumptions, ScenarioResult } from "./calculate";
import type { Dataset, SportRow } from "./data";

export type Scenario = {
  id: string;
  assumptions: Assumptions;
  result?: ScenarioResult;
  stale: boolean;
  error?: string;
};
export type AppState = {
  dataset?: Dataset;
  selectedProvince: string;
  selectedCategory: string;
  selectedYear: string;
  search: string;
  sort: "name" | "ratio-asc" | "ratio-desc";
  selected?: SportRow;
  scenarios: Scenario[];
  toast?: string;
};
export const state: AppState = {
  selectedProvince: "",
  selectedCategory: "",
  selectedYear: "",
  search: "",
  sort: "name",
  scenarios: [],
};

export function createScenario(): Scenario {
  return {
    id: crypto.randomUUID(),
    assumptions: { targetPercent: "", monthlyCost: "", months: "" },
    stale: true,
    error: undefined,
  };
}
