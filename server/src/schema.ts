import { buildSchema } from "graphql";
import * as domain from "./domain/policy";
import { PolicyRepository } from "./repository";

export const schema = buildSchema(/* GraphQL */ `
  enum PolicyStatus { QUOTED IN_FORCE CANCELLED }
  enum TransactionType { ISSUE ENDORSE CANCEL REINSTATE }
  enum CancelMethod { PRO_RATA FLAT }

  type Fees { surplusLinesTax: Int! stampingFee: Int! filingFee: Int! }

  type Transaction {
    id: ID!
    type: TransactionType!
    effectiveDate: String!
    "Premium written by this transaction, in cents (negative = refund)"
    premium: Int!
    fees: Fees!
    total: Int!
    note: String!
  }

  type Policy {
    id: ID!
    insuredName: String!
    state: String!
    effectiveDate: String!
    expirationDate: String!
    annualPremium: Int!
    status: PolicyStatus!
    writtenPremium: Int!
    totalBilled: Int!
    transactions: [Transaction!]!
  }

  type Query {
    policy(id: ID!): Policy
    policies: [Policy!]!
  }

  type Mutation {
    createQuote(insuredName: String!, state: String!, effectiveDate: String!, annualPremium: Int!): Policy!
    issue(id: ID!): Policy!
    endorse(id: ID!, newAnnualPremium: Int!, effectiveDate: String!): Policy!
    cancel(id: ID!, effectiveDate: String!, method: CancelMethod!): Policy!
    reinstate(id: ID!): Policy!
  }
`);

function view(p: domain.Policy) {
  return { ...p, writtenPremium: domain.writtenPremium(p), totalBilled: domain.totalBilled(p) };
}

export function createRoot(repo: PolicyRepository) {
  async function load(id: string) {
    const p = await repo.get(id);
    if (!p) throw new Error(`Policy ${id} not found`);
    return p;
  }
  async function apply(id: string, change: (p: domain.Policy) => domain.Policy) {
    const updated = change(await load(id));
    await repo.save(updated);
    return view(updated);
  }

  return {
    policy: async ({ id }: { id: string }) => {
      const p = await repo.get(id);
      return p && view(p);
    },
    policies: async () => (await repo.list()).map(view),
    createQuote: async (args: { insuredName: string; state: string; effectiveDate: string; annualPremium: number }) => {
      const p = domain.createQuote(args);
      await repo.save(p);
      return view(p);
    },
    issue: ({ id }: { id: string }) => apply(id, domain.issue),
    endorse: ({ id, newAnnualPremium, effectiveDate }: { id: string; newAnnualPremium: number; effectiveDate: string }) =>
      apply(id, (p) => domain.endorse(p, newAnnualPremium, effectiveDate)),
    cancel: ({ id, effectiveDate, method }: { id: string; effectiveDate: string; method: domain.CancelMethod }) =>
      apply(id, (p) => domain.cancel(p, effectiveDate, method)),
    reinstate: ({ id }: { id: string }) => apply(id, domain.reinstate),
  };
}
