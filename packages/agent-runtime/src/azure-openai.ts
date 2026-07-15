import { z } from "zod";

const azureOpenAIEnvSchema = z.object({
  AZURE_OPENAI_ENDPOINT: z.string().url(),
  AZURE_OPENAI_API_KEY: z.string().min(1),
  AZURE_OPENAI_API_VERSION: z.string().min(1).optional(),
});

/** Azure OpenAI credentials and endpoint settings required by the runtime. */
export interface AzureOpenAIConfig {
  endpoint: string;
  apiKey: string;
  apiVersion?: string;
}

/** Loads Azure OpenAI configuration from an environment-shaped source. */
export function loadAzureOpenAIConfig(source: NodeJS.ProcessEnv = process.env): AzureOpenAIConfig {
  const env = azureOpenAIEnvSchema.parse(source);

  return {
    endpoint: env.AZURE_OPENAI_ENDPOINT,
    apiKey: env.AZURE_OPENAI_API_KEY,
    apiVersion: env.AZURE_OPENAI_API_VERSION,
  };
}
