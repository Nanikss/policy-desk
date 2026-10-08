export const API_URL = (import.meta as any).env?.VITE_API_URL ?? "http://localhost:4000/graphql";

export interface Transaction {
  id: string;
  type: string;
  effectiveDate: string;
  premium: number;
  total: number;
  note: string;
}

export interface Policy {
  id: string;
  insuredName: string;
  state: string;
  effectiveDate: string;
  expirationDate: string;
  annualPremium: number;
  status: "QUOTED" | "IN_FORCE" | "CANCELLED";
  writtenPremium: number;
  totalBilled: number;
  transactions: Transaction[];
}

export const POLICY_FIELDS = `
  id insuredName state effectiveDate expirationDate annualPremium status writtenPremium totalBilled
  transactions { id type effectiveDate premium total note }
`;

export async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json();
  if (body.errors?.length) throw new Error(body.errors.map((e: { message: string }) => e.message).join("; "));
  return body.data as T;
}

export function money(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}
