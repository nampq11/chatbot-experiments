import type { Api, Model, Usage } from "@dentaltrip-ai/llm-core";

/** Calculates provider cost in USD from token usage and model pricing. */
export function calculateCost(usage: Usage, model: Model<Api>): Usage["cost"] {
  const input = (usage.input / 1_000_000) * model.cost.input;
  const output = (usage.output / 1_000_000) * model.cost.output;
  const cacheRead = (usage.cacheRead / 1_000_000) * model.cost.cacheRead;
  const cacheWrite = (usage.cacheWrite / 1_000_000) * model.cost.cacheWrite;
  const total = input + output + cacheRead + cacheWrite;
  return { input, output, cacheRead, cacheWrite, total };
}
