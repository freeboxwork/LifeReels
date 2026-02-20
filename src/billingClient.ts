function parseJsonSafe<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export async function getCreditBalance(accessToken: string) {
  const resp = await fetch("/api/credits/balance", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });
  const text = await resp.text();
  const parsed = parseJsonSafe<{ error?: string; credits?: number }>(text);
  if (!resp.ok) {
    throw new Error(parsed?.error || `Failed to load credits: ${resp.status}`);
  }
  if (!parsed) {
    throw new Error("Credits endpoint returned non-JSON response.");
  }
  return Math.max(0, Number(parsed.credits ?? 0) || 0);
}

export async function createPolarCheckout(accessToken: string) {
  const resp = await fetch("/api/polar/create-checkout", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });
  const text = await resp.text();
  const parsed = parseJsonSafe<{ error?: string; url?: string }>(text);
  if (!resp.ok) {
    throw new Error(parsed?.error || `Checkout creation failed: ${resp.status}`);
  }
  const url = String(parsed?.url ?? "").trim();
  if (!url) throw new Error("Checkout URL is missing.");
  return url;
}
