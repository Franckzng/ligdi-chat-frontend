const API_URL = import.meta.env.VITE_API_URL?.replace(/\/$/, ""); 
// ⚡️ supprime le slash final si présent (ex: https://test-gandyam.onrender.com/ → https://test-gandyam.onrender.com)

// Debug : afficher l’URL API en console (utile en prod)
console.log("API_URL =", API_URL);

export async function api(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem("token");

  // Construire les headers
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  // Ne pas forcer Content-Type si body est FormData
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

  let data: any = null;
  const contentType = res.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  if (!res.ok) {
    return { error: data?.error || data || "Erreur inconnue" };
  }

  return data;
}
