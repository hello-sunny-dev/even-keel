import { describe, expect, it } from "vitest";
import { isSameOrigin } from "@/lib/origin";

function request(method: string, headers: Record<string, string>) {
  const lower = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { method, headers: { get: (name: string) => lower.get(name.toLowerCase()) ?? null } };
}

describe("refusing a cross-site state change", () => {
  it("accepts a form post from the host it was served on", () => {
    // The bug this replaces compared against `nextUrl.origin`, which reads
    // http://localhost:<port> whatever host was actually dialled — so a
    // browser at 127.0.0.1 had its own sign-up refused as cross-site.
    expect(
      isSameOrigin(request("POST", { origin: "http://127.0.0.1:3210", host: "127.0.0.1:3210" })),
    ).toBe(true);
    expect(
      isSameOrigin(request("POST", { origin: "http://localhost:3000", host: "localhost:3000" })),
    ).toBe(true);
  });

  it("accepts one that arrived through a proxy, on the host the browser saw", () => {
    expect(
      isSameOrigin(
        request("POST", {
          origin: "https://even-keel.example.com",
          host: "localhost:3000",
          "x-forwarded-host": "even-keel.example.com",
        }),
      ),
    ).toBe(true);
  });

  it("refuses one from somewhere else", () => {
    expect(
      isSameOrigin(request("POST", { origin: "https://evil.example", host: "127.0.0.1:3210" })),
    ).toBe(false);
    // A neighbouring port is a different origin, and a different app.
    expect(
      isSameOrigin(request("POST", { origin: "http://127.0.0.1:9999", host: "127.0.0.1:3210" })),
    ).toBe(false);
  });

  it("lets a read through, with any origin or none", () => {
    expect(isSameOrigin(request("GET", { origin: "https://evil.example", host: "x" }))).toBe(true);
  });

  it("lets a post with no origin header through, where SameSite is the lock", () => {
    expect(isSameOrigin(request("POST", { host: "127.0.0.1:3210" }))).toBe(true);
  });

  it("refuses when there is nothing to compare against", () => {
    expect(isSameOrigin(request("POST", { origin: "http://127.0.0.1:3210" }))).toBe(false);
    expect(isSameOrigin(request("POST", { origin: "not a url", host: "127.0.0.1:3210" }))).toBe(
      false,
    );
  });
});
