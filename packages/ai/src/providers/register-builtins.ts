import { registerApiProvider } from "../api-registry.js";
import { type AzureOpenAIResponsesOptions, azureOpenAIResponsesProvider } from "./azure-openai-responses.js";

let registered = false;

/** Registers built-in DentalTrip AI provider adapters once. */
export function registerBuiltinProviders(): void {
  if (registered) {
    return;
  }
  registered = true;

  registerApiProvider<"azure-openai-responses", AzureOpenAIResponsesOptions>({
    api: "azure-openai-responses",
    stream: azureOpenAIResponsesProvider.stream,
    streamSimple: azureOpenAIResponsesProvider.streamSimple,
  });
}
