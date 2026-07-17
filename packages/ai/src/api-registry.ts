import type {
  Api,
  AssistantMessageEventStreamContract,
  Context,
  Model,
  SimpleStreamOptions,
  StreamFunction,
  StreamOptions,
} from "@chatbot-experiments/llm-core";

/** Type-erased provider stream function stored in the registry. */
export type ApiStreamFunction = (
  model: Model<Api>,
  context: Context,
  options?: StreamOptions,
) => AssistantMessageEventStreamContract;

/** Type-erased simple provider stream function stored in the registry. */
export type ApiStreamSimpleFunction = (
  model: Model<Api>,
  context: Context,
  options?: SimpleStreamOptions,
) => AssistantMessageEventStreamContract;

/** Provider adapter registered for a specific API. */
export interface ApiProvider<
  TApi extends Api = Api,
  TOptions extends StreamOptions = StreamOptions,
> {
  api: TApi;
  stream: StreamFunction<TApi, TOptions>;
  streamSimple: StreamFunction<TApi, SimpleStreamOptions>;
}

interface ApiProviderInternal {
  api: Api;
  stream: ApiStreamFunction;
  streamSimple: ApiStreamSimpleFunction;
}

type RegisteredApiProvider = {
  provider: ApiProviderInternal;
  sourceId?: string;
};

const apiProviderRegistry = new Map<string, RegisteredApiProvider>();

function wrapStream<TApi extends Api, TOptions extends StreamOptions>(
  api: TApi,
  stream: StreamFunction<TApi, TOptions>,
): ApiStreamFunction {
  return (model, context, options) => {
    if (model.api !== api) {
      throw new Error(`Mismatched api: ${model.api} expected ${api}`);
    }
    return stream(model as Model<TApi>, context, options as TOptions);
  };
}

function wrapStreamSimple<TApi extends Api>(
  api: TApi,
  streamSimple: StreamFunction<TApi, SimpleStreamOptions>,
): ApiStreamSimpleFunction {
  return (model, context, options) => {
    if (model.api !== api) {
      throw new Error(`Mismatched api: ${model.api} expected ${api}`);
    }
    return streamSimple(model as Model<TApi>, context, options);
  };
}

/** Registers a provider for one API identifier. */
export function registerApiProvider<
  TApi extends Api,
  TOptions extends StreamOptions,
>(provider: ApiProvider<TApi, TOptions>, sourceId?: string): void {
  apiProviderRegistry.set(provider.api, {
    provider: {
      api: provider.api,
      stream: wrapStream(provider.api, provider.stream),
      streamSimple: wrapStreamSimple(provider.api, provider.streamSimple),
    },
    sourceId,
  });
}

/** Gets a provider adapter by API identifier. */
export function getApiProvider(api: Api): ApiProviderInternal | undefined {
  return apiProviderRegistry.get(api)?.provider;
}

/** Lists registered provider adapters. */
export function getApiProviders(): ApiProviderInternal[] {
  return Array.from(apiProviderRegistry.values(), (entry) => entry.provider);
}

/** Unregisters all providers registered for a source id. */
export function unregisterApiProviders(sourceId: string): void {
  for (const [api, entry] of apiProviderRegistry.entries()) {
    if (entry.sourceId === sourceId) {
      apiProviderRegistry.delete(api);
    }
  }
}

/** Clears provider registry state. Intended for tests. */
export function clearApiProviders(): void {
  apiProviderRegistry.clear();
}
