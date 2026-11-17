import { describe, expect, it } from "vitest";

import { SEARCH_TERMS, SUGGESTED_AREAS, domainOf, hashtagsFor, placeOf, searchLinks } from "./research";
import { SEGMENTS } from ".";

const austin = { segment: "RETAIL_JEWELER", city: "Austin", region: "TX", country: "United States" };

describe("research searches", () => {
  it("names the place the way people search for it", () => {
    expect(placeOf(austin)).toBe("Austin, TX");
    expect(placeOf({ ...austin, city: "Toronto", region: "ON", country: "Canada" })).toBe("Toronto, ON, Canada");
  });

  it("has search words for every business type", () => {
    for (const [s] of SEGMENTS) expect(SEARCH_TERMS[s]?.length, s).toBeGreaterThan(0);
  });

  it("builds Maps, Google, Instagram, Yelp, Facebook and LinkedIn searches, all https and encoded", () => {
    const links = searchLinks(austin);
    expect(new Set(links.map((l) => l.source))).toEqual(new Set(["Google Maps", "Google", "Instagram", "Yelp", "Facebook", "LinkedIn"]));
    expect(links[0]!.url).toBe("https://www.google.com/maps/search/custom%20jeweler%20near%20Austin%2C%20TX");
    expect(links.find((l) => l.source === "Instagram")!.url).toBe("https://www.instagram.com/explore/tags/austinjeweler/");
    for (const l of links) expect(l.url).toMatch(/^https:\/\/www\.[a-z]+\.com\/[^\s]*$/);
    expect(searchLinks({ ...austin, segment: "DESIGN_STUDIO" }).some((l) => l.source === "Etsy")).toBe(true);
  });

  it("makes city hashtags without spaces or punctuation", () => {
    expect(hashtagsFor({ ...austin, city: "St. Louis" })[0]).toBe("stlouisjeweler");
  });

  it("suggests the main US jewelry markets, manufacturing hubs first, each once", () => {
    expect(SUGGESTED_AREAS.slice(0, 3).map((a) => a.city)).toEqual(["New York", "Los Angeles", "Providence"]);
    expect(new Set(SUGGESTED_AREAS.map((a) => `${a.city}, ${a.region}`)).size).toBe(SUGGESTED_AREAS.length);
  });
});

describe("domainOf", () => {
  it("reduces a website to its domain, like the database does", () => {
    expect(domainOf("https://www.Bright.example.com/about?x=1")).toBe("bright.example.com");
    expect(domainOf("bright.example.com:8080")).toBe("bright.example.com");
  });

  it("ignores shared platforms and non-domains", () => {
    expect(domainOf("https://www.instagram.com/brightbridal")).toBeNull();
    expect(domainOf("etsy.com/shop/x")).toBeNull();
    expect(domainOf("not a site")).toBeNull();
  });
});
