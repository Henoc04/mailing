import { env } from "../config/env";
import { ExternalApiError, ValidationError } from "../errors/errors";

export interface CompanySearchParams {
  country: string;
  city: string;
  sectors: string[];
}

export interface CompanySearchResult {
  placeId: string;
  name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  sectorsMatched: string[];
}

// Caps how many Geoapify Place Details calls a single search can trigger
// (the Places search itself is comparatively cheap; Details is billed per call).
const MAX_RESULTS = 30;

// Geoapify's Places API is category-based (no free-text query), so each
// free-text sector typed by the user is mapped to the closest Geoapify
// category slugs (see https://apidocs.geoapify.com/docs/places/#categories).
// Matching is a simple case-insensitive keyword lookup; anything unmatched
// falls back to the generic "office.company" category rather than being
// dropped, since an imprecise-but-present result beats silently ignoring
// a sector the user asked for.
const SECTOR_CATEGORY_KEYWORDS: Array<{ keywords: string[]; categories: string[] }> = [
  { keywords: ["it", "informatique", "tech", "logiciel", "digital", "numerique"], categories: ["office.it"] },
  {
    keywords: ["formation", "education", "ecole", "école", "training", "enseignement"],
    categories: [
      "education.school",
      "education.college",
      "education.university",
      "education.driving_school",
      "education.language_school",
      "office.educational_institution",
    ],
  },
  {
    keywords: ["btp", "construction", "batiment", "bâtiment", "travaux"],
    categories: [
      "office.architect",
      "service.metal_construction",
      "building.commercial",
      "building.industrial",
      "commercial.houseware_and_hardware.building_materials",
    ],
  },
  { keywords: ["finance", "banque", "comptab"], categories: ["office.financial", "office.financial_advisor", "office.accountant"] },
  { keywords: ["immobilier", "real estate"], categories: ["office.estate_agent"] },
  { keywords: ["transport", "logistique", "logistics"], categories: ["office.logistics"] },
  { keywords: ["sante", "santé", "health", "medical"], categories: ["healthcare"] },
];

const FALLBACK_CATEGORY = "office.company";

function sectorToCategories(sector: string): string[] {
  const normalized = sector.trim().toLowerCase();
  const match = SECTOR_CATEGORY_KEYWORDS.find((entry) => entry.keywords.some((kw) => normalized.includes(kw)));
  return match?.categories ?? [FALLBACK_CATEGORY];
}

/**
 * Retries a `fetch` call on transient network failures (connection
 * timeouts/resets — observed in practice against both Geoapify and
 * Hunter.io from behind some Docker/corporate networks), not on HTTP-level
 * error responses (4xx/5xx), which `fetch` doesn't throw for and retrying
 * wouldn't fix anyway.
 */
async function fetchWithRetry(url: string, attempts = 3, delayMs = 500): Promise<Response> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetch(url);
    } catch (err) {
      if (attempt === attempts) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  // Unreachable (the loop always returns or throws), but keeps TS happy.
  throw new Error("fetchWithRetry: exhausted attempts");
}

interface GeoapifyGeocodeResult {
  place_id: string;
}

interface GeoapifyGeocodeResponse {
  results?: GeoapifyGeocodeResult[];
}

interface GeoapifyPlaceItem {
  place_id: string;
  name?: string;
  formatted?: string;
}

interface GeoapifyPlacesResponse {
  features: Array<{ properties: GeoapifyPlaceItem }>;
}

interface GeoapifyPlaceDetailsResponse {
  features?: Array<{
    properties: {
      name?: string;
      formatted?: string;
      website?: string;
      // Geoapify (backed by raw OSM data) sometimes serializes this as a
      // JSON number when the phone looks purely numeric — normalized to a
      // string below rather than trusting the declared type.
      contact?: { phone?: string | number };
    };
  }>;
}

function requireGeoapifyKey(): string {
  if (!env.GEOAPIFY_API_KEY) {
    throw new ExternalApiError("Clé Geoapify (GEOAPIFY_API_KEY) non configurée");
  }
  return env.GEOAPIFY_API_KEY;
}

function requireHunterKey(): string {
  if (!env.HUNTER_API_KEY) {
    throw new ExternalApiError("Clé Hunter.io (HUNTER_API_KEY) non configurée");
  }
  return env.HUNTER_API_KEY;
}

/** Resolves "city, country" to a Geoapify place_id usable as a Places API area filter. */
async function geocodeCity(apiKey: string, city: string, country: string): Promise<string> {
  const text = `${city}, ${country}`;
  const url = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(text)}&type=city&format=json&apiKey=${apiKey}`;
  const res = await fetchWithRetry(url);
  const body = (await res.json()) as GeoapifyGeocodeResponse;

  const placeId = body.results?.[0]?.place_id;
  if (!placeId) {
    throw new ExternalApiError(`Ville introuvable : ${text}`);
  }
  return placeId;
}

async function placesSearch(apiKey: string, categories: string[], areaPlaceId: string): Promise<GeoapifyPlaceItem[]> {
  const url = `https://api.geoapify.com/v2/places?categories=${encodeURIComponent(
    categories.join(",")
  )}&filter=place:${areaPlaceId}&limit=20&apiKey=${apiKey}`;
  const res = await fetchWithRetry(url);
  const body = (await res.json()) as GeoapifyPlacesResponse;
  return (body.features ?? []).map((f) => f.properties);
}

async function fetchDetails(apiKey: string, placeId: string): Promise<{ name?: string; formatted?: string; website?: string; phone?: string } | null> {
  const url = `https://api.geoapify.com/v2/place-details?id=${placeId}&apiKey=${apiKey}`;
  const res = await fetchWithRetry(url);
  const body = (await res.json()) as GeoapifyPlaceDetailsResponse;
  const props = body.features?.[0]?.properties;
  if (!props) {
    return null;
  }
  return {
    name: props.name,
    formatted: props.formatted,
    website: props.website,
    phone: props.contact?.phone != null ? String(props.contact.phone) : undefined,
  };
}

/**
 * Discovers companies via Geoapify Places (category-based search over the
 * geocoded city's area, one search per sector→category mapping, merged/
 * deduped by place_id), then enriches each with phone/website via Place
 * Details (not returned by the search endpoint itself).
 */
export async function searchCompanies(params: CompanySearchParams): Promise<CompanySearchResult[]> {
  const apiKey = requireGeoapifyKey();
  const areaPlaceId = await geocodeCity(apiKey, params.city, params.country);

  const bySector = await Promise.all(
    params.sectors.map(async (sector) => ({
      sector,
      items: await placesSearch(apiKey, sectorToCategories(sector), areaPlaceId),
    }))
  );

  const byPlaceId = new Map<string, { item: GeoapifyPlaceItem; sectorsMatched: string[] }>();
  for (const { sector, items } of bySector) {
    for (const item of items) {
      const existing = byPlaceId.get(item.place_id);
      if (existing) {
        existing.sectorsMatched.push(sector);
      } else {
        byPlaceId.set(item.place_id, { item, sectorsMatched: [sector] });
      }
    }
  }

  const candidates = Array.from(byPlaceId.values()).slice(0, MAX_RESULTS);

  return Promise.all(
    candidates.map(async ({ item, sectorsMatched }) => {
      const details = await fetchDetails(apiKey, item.place_id);
      return {
        placeId: item.place_id,
        name: details?.name ?? item.name ?? "(sans nom)",
        address: details?.formatted ?? item.formatted ?? null,
        phone: details?.phone ?? null,
        website: details?.website ?? null,
        sectorsMatched,
      };
    })
  );
}

interface HunterEmail {
  value: string;
  confidence: number;
  first_name?: string | null;
  last_name?: string | null;
  position?: string | null;
}

interface HunterDomainSearchResponse {
  data?: {
    emails: HunterEmail[];
  };
  errors?: Array<{ details?: string }>;
}

export interface GuessEmailResult {
  email: string;
  confidence: number;
  firstName: string | null;
  lastName: string | null;
  position: string | null;
}

// How many emails Hunter.io may return per domain — surfaced as a list so
// the caller can pick among every email tied to that domain, not just the
// single best guess.
const MAX_EMAILS_PER_DOMAIN = 10;

function extractDomain(website: string): string {
  try {
    const url = website.startsWith("http") ? website : `https://${website}`;
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    throw new ValidationError("URL de site web invalide");
  }
}

/**
 * Looks up every email Hunter.io has on file for a company's domain,
 * ranked by confidence (highest first). Returns an empty array (never a
 * made-up guess) when Hunter has nothing on file — callers should let the
 * user type an email manually in that case.
 */
export async function guessEmail(website: string): Promise<GuessEmailResult[]> {
  const apiKey = requireHunterKey();
  const domain = extractDomain(website);

  const url = `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&api_key=${apiKey}&limit=${MAX_EMAILS_PER_DOMAIN}`;
  const res = await fetchWithRetry(url);
  const body = (await res.json()) as HunterDomainSearchResponse;

  if (body.errors) {
    throw new ExternalApiError(`Hunter.io a renvoyé une erreur : ${body.errors[0]?.details ?? "inconnue"}`);
  }

  const emails = body.data?.emails ?? [];
  return emails
    .slice()
    .sort((a, b) => b.confidence - a.confidence)
    .map((e) => ({
      email: e.value,
      confidence: e.confidence,
      firstName: e.first_name ?? null,
      lastName: e.last_name ?? null,
      position: e.position ?? null,
    }));
}
