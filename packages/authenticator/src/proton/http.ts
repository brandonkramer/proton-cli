import { APP_VERSION, DEFAULT_API_URL, USER_AGENT } from "./constants.ts";
import type { Session } from "./types.ts";

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  session?: Session | null;
  apiUrl?: string;
  headers?: Record<string, string>;
  query?: Record<string, string | undefined>;
  /** Solved human-verification headers from CAPTCHA challenge. */
  humanVerification?: {
    token: string;
    tokenType: string;
  };
}

export interface ProtonFetchResult<T> {
  status: number;
  data: T;
  raw: string;
}

export async function protonFetch<T>(
  path: string,
  options: RequestOptions = {},
): Promise<ProtonFetchResult<T>> {
  const apiUrl = options.apiUrl ?? DEFAULT_API_URL;
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "x-pm-appversion": APP_VERSION,
    "User-Agent": USER_AGENT,
    ...options.headers,
  };

  if (options.session) {
    headers.Authorization = `Bearer ${options.session.AccessToken}`;
    headers["x-pm-uid"] = options.session.UID;
  }

  if (options.humanVerification) {
    headers["x-pm-human-verification-token"] =
      options.humanVerification.token;
    headers["x-pm-human-verification-token-type"] =
      options.humanVerification.tokenType;
  }

  const url = new URL(`${apiUrl}${path}`);
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, value);
      }
    }
  }

  const response = await fetch(url, {
    method: options.method ?? (options.body ? "POST" : "GET"),
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const raw = await response.text();
  let data: T;
  try {
    data = JSON.parse(raw) as T;
  } catch {
    throw new Error(
      `Non-JSON response from Proton API (HTTP ${response.status}): ${raw.slice(0, 200)}`,
    );
  }

  return { status: response.status, data, raw };
}
