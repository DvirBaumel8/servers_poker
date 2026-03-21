const API_BASE = "/api/v1";

interface RequestOptions extends RequestInit {
  token?: string;
}

async function request<T>(
  endpoint: string,
  options: RequestOptions = {},
): Promise<T> {
  const { token, ...fetchOptions } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...fetchOptions,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

export const api = {
  get: <T>(endpoint: string, token?: string) =>
    request<T>(endpoint, { method: "GET", token }),

  post: <T>(endpoint: string, data?: unknown, token?: string) =>
    request<T>(endpoint, {
      method: "POST",
      body: data ? JSON.stringify(data) : undefined,
      token,
    }),

  put: <T>(endpoint: string, data?: unknown, token?: string) =>
    request<T>(endpoint, {
      method: "PUT",
      body: data ? JSON.stringify(data) : undefined,
      token,
    }),

  patch: <T>(endpoint: string, data?: unknown, token?: string) =>
    request<T>(endpoint, {
      method: "PATCH",
      body: data ? JSON.stringify(data) : undefined,
      token,
    }),

  delete: <T>(endpoint: string, token?: string) =>
    request<T>(endpoint, { method: "DELETE", token }),
};
