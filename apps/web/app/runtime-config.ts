import type { FetchApiDataOptions } from "@dentaltrip-ai/client/api";

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

export const AI_API_BASE_URL = trimTrailingSlashes(process.env.NEXT_PUBLIC_AI_API_URL || "http://localhost:8080");

export const API_BASE_URL = trimTrailingSlashes(process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001");

export const APP_BASE_URL = trimTrailingSlashes(process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000");

export const BC_HOSTNAME = process.env.NEXT_PUBLIC_BC_HOSTNAME;

const API_REVALIDATE_SECONDS = 60;

/** Build server-side API request options owned by the Next.js app boundary. */
export function createServerApiFetchOptions(revalidate: number = API_REVALIDATE_SECONDS): FetchApiDataOptions {
  return {
    ...(BC_HOSTNAME ? { bcHostname: BC_HOSTNAME } : {}),
    requestInit: { next: { revalidate } } as RequestInit,
  };
}
