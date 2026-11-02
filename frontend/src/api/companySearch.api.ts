import { client } from "./client";

export interface CompanySearchInput {
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

export interface GuessEmailResult {
  email: string;
  confidence: number;
  firstName: string | null;
  lastName: string | null;
  position: string | null;
}

export async function search(input: CompanySearchInput): Promise<CompanySearchResult[]> {
  const { data } = await client.post<CompanySearchResult[]>("/company-search/search", input);
  return data;
}

// Every email Hunter.io has on file for the company's domain, ranked by
// confidence (highest first) — empty array if it has nothing on file.
export async function guessEmail(website: string): Promise<GuessEmailResult[]> {
  const { data } = await client.post<GuessEmailResult[]>("/company-search/guess-email", { website });
  return data;
}
