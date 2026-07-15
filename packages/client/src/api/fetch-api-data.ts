/** Platform-neutral options supplied by the app boundary for API requests. */
export interface FetchApiDataOptions {
  readonly bcHostname?: string;
  readonly headers?: HeadersInit;
  readonly requestInit?: RequestInit;
}

/** Fetch API data with fallback handling while keeping platform details caller-owned. */
export async function fetchApiData<T>(
  baseUrl: string,
  path: string,
  fallback: T,
  label: string,
  options: FetchApiDataOptions = {},
): Promise<T> {
  try {
    const headers = new Headers(options.headers || {});

    if (options.bcHostname) {
      headers.set("x-bc-hostname", options.bcHostname);
    }

    const requestInit = {
      ...options.requestInit,
      headers,
    };
    const res = await fetch(`${baseUrl}${path}`, requestInit);

    if (!res.ok) {
      return fallback;
    }

    const json = await res.json();
    return json.data || json || fallback;
  } catch (error) {
    console.error(`Failed to fetch ${label}:`, error);
    return fallback;
  }
}
