const BASE = import.meta.env.VITE_API_URL || "";

async function request(method: string, url: string, body?: any, token?: string | null) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${url}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { error: json.error || { message: "Request failed" }, data: null };
  return { data: json.data, error: null };
}

export const api = {
  get: (url: string, token?: string | null) => request("GET", url, undefined, token),
  post: (url: string, body: any, token?: string | null) => request("POST", url, body, token),
  patch: (url: string, body: any, token?: string | null) => request("PATCH", url, body, token),
  put: (url: string, body: any, token?: string | null) => request("PUT", url, body, token),
};
