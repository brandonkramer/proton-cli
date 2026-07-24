import { CliError, messageForApiCode } from "../util/errors.ts";
import { protonFetch, type RequestOptions } from "./http.ts";
import { isSuccessCode } from "./types.ts";

export async function calendarApi<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { status, data } = await protonFetch<{ Code: number; Error?: string } & T>(
    path,
    options,
  );

  if (status === 204) {
    return data as T;
  }

  const code = (data as { Code?: number }).Code;
  if (code !== undefined && !isSuccessCode(code)) {
    throw new CliError(
      messageForApiCode(code, (data as { Error?: string }).Error ?? `API error (HTTP ${status})`),
    );
  }

  if (status < 200 || status >= 300) {
    throw new CliError(`API request failed (HTTP ${status}).`);
  }

  return data as T;
}
