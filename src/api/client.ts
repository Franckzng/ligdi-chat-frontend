const API_URL = import.meta.env.VITE_API_URL;

export async function api(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem("token");

  // Construire les headers de base
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  // ⚡️ Ne pas forcer Content-Type si body est FormData
  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...headers,
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text);
  }

  // Si la réponse est vide (ex: 204 No Content), éviter une erreur de parsing
  const contentType = res.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    return res.json();
  }
  return null;
}
