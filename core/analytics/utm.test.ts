import { describe, expect, it } from "vitest";

import { decodeFirstTouch, encodeFirstTouch, firstTouchFrom, isHeardAbout } from "./utm";

const now = new Date("2026-10-24T12:00:00Z");

describe("first-touch attribution", () => {
  it("keeps the utm tags, the outside referrer's host and the landing path", () => {
    const t = firstTouchFrom(
      new URL("https://thecadpillar.com/jewelry-cad?utm_source=google&utm_campaign=bridal&gclid=x"),
      "https://www.google.com/search?q=jewelry+cad",
      now,
    );
    expect(t).toEqual({
      utm_source: "google",
      utm_campaign: "bridal",
      referrer: "www.google.com",
      landing_path: "/jewelry-cad",
      at: "2026-10-24T12:00:00.000Z",
    });
  });

  it("ignores its own site as a referrer and a malformed header", () => {
    expect(firstTouchFrom(new URL("https://a.com/pricing"), "https://a.com/", now).referrer).toBeUndefined();
    expect(firstTouchFrom(new URL("https://a.com/pricing"), "not a url", now).referrer).toBeUndefined();
  });

  it("round-trips through the cookie and rejects anything tampered", () => {
    const t = firstTouchFrom(new URL("https://a.com/?utm_source=ig"), null, now);
    expect(decodeFirstTouch(encodeFirstTouch(t))).toEqual(t);
    expect(decodeFirstTouch("%7Bnot json")).toBeNull();
    expect(decodeFirstTouch(encodeURIComponent(JSON.stringify({ utm_source: "x" })))).toBeNull();
    expect(decodeFirstTouch(encodeURIComponent(JSON.stringify({ landing_path: "/", at: "t", evil: "<script>" })))).toEqual({
      landing_path: "/",
      at: "t",
    });
  });

  it("knows the answers to 'How did you hear about us?'", () => {
    expect(isHeardAbout("google")).toBe(true);
    expect(isHeardAbout("tiktok")).toBe(false);
  });
});
