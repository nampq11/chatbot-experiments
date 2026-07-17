import type { Api, Model } from "@chatbot-experiments/llm-core";

/** Minimal model registry owned by Chatbot Experiments's server runtime. */
export const models: Model<Api>[] = [
  {
    id: "gpt-5.4-nano",
    name: "GPT-5.4 Nano",
    api: "azure-openai-responses",
    provider: "azure-openai",
    baseUrl: "",
    reasoning: true,
    thinkingLevelMap: { none: null, short: 40000, medium: 80000, long: 100000 },
    input: ["text", "image"],
    cost: {
      input: 0.2,
      output: 1.25,
      cacheRead: 0.02,
      cacheWrite: 0,
    },
    contextWindow: 400000,
    maxTokens: 128000,
  },
  {
    id: "gpt-5.4",
    name: "GPT-5.4",
    api: "azure-openai-responses",
    provider: "azure-openai",
    baseUrl: "",
    reasoning: true,
    thinkingLevelMap: { none: null, short: 40000, medium: 80000, long: 100000 },
    input: ["text", "image"],
    cost: {
      input: 2.5,
      output: 15,
      cacheRead: 0.25,
      cacheWrite: 0,
    },
    contextWindow: 1050000,
    maxTokens: 128000,
  },
];

const modelMap = new Map(models.map((model) => [model.id, model]));

/** Looks up a model by id. */
export function getModel(id: string): Model<Api> | undefined {
  return modelMap.get(id);
}

/** Lists all registered models. */
export function listModels(): Model<Api>[] {
  return [...models];
}

/** Lists registered models for a provider. */
export function getModelsByProvider(provider: string): Model<Api>[] {
  return models.filter((model) => model.provider === provider);
}
