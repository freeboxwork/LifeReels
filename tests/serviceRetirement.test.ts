import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequest } from "../functions/api/_middleware";
import { LIFEREELS_RETIRED, RETIRED_PAYLOAD } from "../shared/serviceRetirement";

const providers = vi.hoisted(() => ({
  render: vi.fn(() => { throw new Error("Paid rendering is forbidden in tests."); }),
  progress: vi.fn(() => { throw new Error("AWS polling is forbidden in tests."); }),
  s3: vi.fn(() => { throw new Error("S3 access is forbidden in tests."); }),
}));

vi.mock("@remotion/lambda/client", () => ({
  renderMediaOnLambda: providers.render,
  getRenderProgress: providers.progress,
}));
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: providers.s3,
  GetObjectCommand: vi.fn(),
  PutObjectCommand: vi.fn(),
}));

import { handler } from "../bridge-lambda/src/handler";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Life Reels retirement", () => {
  const routes = [
    ["POST", "/api/polar/create-checkout"],
    ["POST", "/api/polar/webhook"],
    ["POST", "/api/pipeline/start"],
    ["GET", "/api/pipeline/status?id=offline-test"],
    ["POST", "/api/elevenlabs/tts"],
    ["POST", "/api/notify/reel-email"],
    ["GET", "/api/credits/balance"],
    ["OPTIONS", "/api/pipeline/start"],
    ["POST", "/api/future-generation-endpoint"],
  ];

  it.each(routes)("blocks %s %s without reaching an API handler", async (method, path) => {
    const fetchSpy = vi.fn(() => { throw new Error("Network is forbidden in tests."); });
    vi.stubGlobal("fetch", fetchSpy);
    const next = vi.fn(() => { throw new Error("API handler must not run."); });
    const context = {
      request: new Request(`https://lifereels.invalid${path}`, { method }),
      get env() { throw new Error("Credentials must not be read."); },
      next,
    };
    const response = await onRequest(context as never);
    expect(response.status).toBe(410);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual(RETIRED_PAYLOAD);
    expect(next).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    ["POST", "/pipeline/start"],
    ["GET", "/pipeline/status"],
    ["OPTIONS", "/pipeline/start"],
  ])("blocks direct bridge %s %s before providers and body parsing", async (method, path) => {
    const fetchSpy = vi.fn(() => { throw new Error("Network is forbidden in tests."); });
    vi.stubGlobal("fetch", fetchSpy);
    const response = await handler({
      requestContext: { http: { method } },
      rawPath: path,
      body: "malformed JSON must never be parsed",
    });
    expect(response.statusCode).toBe(410);
    expect(JSON.parse(response.body)).toEqual(RETIRED_PAYLOAD);
    expect(providers.render).not.toHaveBeenCalled();
    expect(providers.progress).not.toHaveBeenCalled();
    expect(providers.s3).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("keeps retirement enabled without credentials or environment configuration", () => {
    expect(LIFEREELS_RETIRED).toBe(true);
  });
});
