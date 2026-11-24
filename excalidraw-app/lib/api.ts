export type AuthUser = {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  isOwner: boolean;
};

export const isCloudEnabled = () =>
  import.meta.env.VITE_APP_CLOUD_ENABLED === "true";

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type ApiOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  json?: unknown;
  body?: BodyInit | Uint8Array | null;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

const toUrl = (path: string) =>
  path.startsWith("/api/") ? path : `/api${path}`;

const parseBody = async (response: Response) => {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

export const apiFetch = async <T>(
  path: string,
  options: ApiOptions = {},
): Promise<T> => {
  const { method = "GET", json, body, headers = {}, signal } = options;

  const init: RequestInit = {
    method,
    credentials: "include",
    headers: { ...headers },
    signal,
  };

  if (json !== undefined) {
    init.body = JSON.stringify(json);
    (init.headers as Record<string, string>)["content-type"] =
      "application/json";
  } else if (body !== undefined) {
    init.body = body as BodyInit;
  }

  const response = await fetch(toUrl(path), init);

  if (response.status === 204) {
    return undefined as T;
  }

  const data = await parseBody(response);

  if (!response.ok) {
    const errorData = data as { error?: string; code?: string } | null;
    throw new ApiError(
      response.status,
      errorData?.error ?? response.statusText,
      errorData?.code,
    );
  }

  return data as T;
};

export const apiFetchBlob = async (
  path: string,
  options: Omit<ApiOptions, "json"> = {},
): Promise<Blob> => {
  const response = await fetch(toUrl(path), {
    method: options.method ?? "GET",
    credentials: "include",
    headers: options.headers,
    body: options.body as BodyInit,
    signal: options.signal,
  });

  if (!response.ok) {
    const data = await parseBody(response);
    const errorData = data as { error?: string; code?: string } | null;
    throw new ApiError(
      response.status,
      errorData?.error ?? response.statusText,
      errorData?.code,
    );
  }

  return response.blob();
};
