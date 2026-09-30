// Intentional source-level shutdown: environment variables cannot re-enable billing.
// Restore service only by reviewing and reverting the retirement changes together.
export const LIFEREELS_RETIRED = true;
export const RETIRED_STATUS = 410;
export const RETIRED_PAYLOAD = {
  code: "SERVICE_RETIRED",
  error: "Life Reels has closed. Payments and generation requests are disabled.",
};

export function retiredResponse() {
  return new Response(JSON.stringify(RETIRED_PAYLOAD), {
    status: RETIRED_STATUS,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
