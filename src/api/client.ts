const API_URL = import.meta.env.VITE_API_URL;

// ✅ Debug : afficher l'URL API en console (utile en prod)
console.log("API_URL =", API_URL);

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

  // Gestion des erreurs
  let data: any = null;
  const contentType = res.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  if (!res.ok) {
    // Retourner un objet clair avec l'erreur
    return { error: data?.error || data || "Erreur inconnue" };
  }

  return data;
}
