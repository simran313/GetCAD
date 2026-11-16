/**
 * Outreach research (0071; DECISIONS 1.34): finding prospects by hand from
 * public sources. These build the searches a researcher opens in a new tab;
 * nothing here fetches or scrapes a page.
 */

/** How strong a prospect looks, decided while researching. */
export const FITS = [
  ["A", "Strong fit", "Does custom or bridal work or makes its own designs, posted in the last month, and you found an email or a direct way to reach them."],
  ["B", "Maybe", "Some custom work, or not sure yet; reachable."],
  ["C", "Weak fit", "Mostly resells brands, a large chain, or inactive."],
] as const;
export const fitLabel = (f: string | null | undefined) => FITS.find(([k]) => k === f)?.[1] ?? "Not graded";

/** What people call each kind of business when they search for it. */
export const SEARCH_TERMS: Record<string, string[]> = {
  RETAIL_JEWELER: ["custom jeweler", "custom engagement rings", "bridal jeweler"],
  MANUFACTURER: ["jewelry manufacturer", "jewelry casting", "fine jewelry manufacturing"],
  BRAND_WHOLESALER: ["fine jewelry brand", "jewelry wholesaler"],
  DESIGN_STUDIO: ["jewelry designer", "jewelry design studio"],
  OTHER: ["jewelry store"],
};

/** Places to start: the largest US jewelry markets; the first three are where manufacturing and the trade sit. */
export const SUGGESTED_AREAS = [
  { city: "New York", region: "NY", note: "Diamond District: manufacturers and trade shops" },
  { city: "Los Angeles", region: "CA", note: "Jewelry District: manufacturers and wholesalers" },
  { city: "Providence", region: "RI", note: "Manufacturing and casting" },
  { city: "Miami", region: "FL" },
  { city: "Chicago", region: "IL" },
  { city: "Dallas", region: "TX" },
  { city: "Houston", region: "TX" },
  { city: "Atlanta", region: "GA" },
  { city: "Phoenix", region: "AZ" },
  { city: "San Francisco", region: "CA" },
  { city: "Seattle", region: "WA" },
  { city: "Boston", region: "MA" },
  { city: "Denver", region: "CO" },
  { city: "Austin", region: "TX" },
  { city: "Philadelphia", region: "PA" },
  { city: "Las Vegas", region: "NV" },
  { city: "San Diego", region: "CA" },
  { city: "Nashville", region: "TN" },
  { city: "Charlotte", region: "NC" },
  { city: "Minneapolis", region: "MN" },
] as const;

export interface Area {
  segment: string;
  city: string;
  region: string | null;
  country: string;
}

/** "Austin, TX" (or "Austin, TX, Canada" outside the US). */
export function placeOf(a: Area): string {
  const us = !a.country || /^(us|usa|united states)$/i.test(a.country.trim());
  return [a.city, a.region, us ? null : a.country].filter(Boolean).join(", ");
}

/** Instagram tags people use for a city's jewelers, e.g. #austinjeweler. */
export function hashtagsFor(a: Area): string[] {
  const city = a.city.toLowerCase().replace(/[^a-z0-9]/g, "");
  const words: Record<string, string[]> = {
    RETAIL_JEWELER: ["jeweler", "engagementrings", "customjewelry"],
    MANUFACTURER: ["jewelrymanufacturer", "jewelry"],
    BRAND_WHOLESALER: ["jewelrybrand", "finejewelry"],
    DESIGN_STUDIO: ["jewelrydesigner", "handmadejewelry"],
    OTHER: ["jewelry"],
  };
  return (words[a.segment] ?? words.OTHER!).map((w) => `${city}${w}`);
}

export interface SearchLink {
  source: string;
  label: string;
  url: string;
}

const enc = encodeURIComponent;

/** The searches for one area, each opened by hand in a new tab. */
export function searchLinks(a: Area): SearchLink[] {
  const place = placeOf(a);
  const terms = SEARCH_TERMS[a.segment] ?? SEARCH_TERMS.OTHER!;
  const main = terms[0]!;
  const links: SearchLink[] = [
    ...terms.map((t) => ({ source: "Google Maps", label: `${t} near ${place}`, url: `https://www.google.com/maps/search/${enc(`${t} near ${place}`)}` })),
    { source: "Google", label: `${main} ${place}`, url: `https://www.google.com/search?q=${enc(`${main} ${place}`)}` },
    { source: "Google", label: `${main} ${place}: contact pages`, url: `https://www.google.com/search?q=${enc(`${main} ${place} contact email`)}` },
    ...hashtagsFor(a).map((tag) => ({ source: "Instagram", label: `#${tag}`, url: `https://www.instagram.com/explore/tags/${enc(tag)}/` })),
    { source: "Yelp", label: `${main} in ${place}`, url: `https://www.yelp.com/search?find_desc=${enc(main)}&find_loc=${enc(place)}` },
    { source: "Facebook", label: `${main} ${a.city}`, url: `https://www.facebook.com/search/pages/?q=${enc(`${main} ${a.city}`)}` },
    { source: "LinkedIn", label: `${main} ${a.city}`, url: `https://www.linkedin.com/search/results/companies/?keywords=${enc(`${main} ${a.city}`)}` },
  ];
  if (a.segment === "DESIGN_STUDIO" || a.segment === "BRAND_WHOLESALER") {
    links.push({ source: "Etsy", label: `${main} shops`, url: `https://www.etsy.com/search/shops?search_query=${enc(main)}` });
  }
  return links;
}

/** A website's own domain ("bright.example.com"), or null for a link on a shared platform. */
export function domainOf(site: string | null | undefined): string | null {
  const d = (site ?? "").trim().replace(/^[a-z]+:\/\//i, "").replace(/^www\.|[:/?#].*$/gi, "").toLowerCase();
  if (!d || !d.includes(".")) return null;
  if (/(^|\.)(instagram|facebook|fb|etsy|linktr|linkedin|google|goo|yelp|tiktok|pinterest|twitter|x|youtube|amazon|ebay|wa|whatsapp)\.(com|ee|gl|me)$/.test(d)) return null;
  return d;
}
