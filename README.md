# Policy Desk

[![CI](https://github.com/Nanikss/policy-desk/actions/workflows/ci.yml/badge.svg)](https://github.com/Nanikss/policy-desk/actions/workflows/ci.yml)

A small full-stack app for the lifecycle of surplus lines insurance policies: **quote → issue → mid-term endorsement → cancellation → reinstatement**, with penny-accurate premium, tax and fee calculations.

I've spent years building policy administration systems for P&C carriers. This project rebuilds the core money logic of that domain in a modern TypeScript stack.

**Stack:** TypeScript · Node.js · GraphQL · React · Postgres (JSONB) · Jest

## Why it's interesting

Insurance billing is mostly edge cases around money and time:

- **Integer cents everywhere.** Rounding is half away from zero, so refunds round the same way as charges (`Math.round(-2.5)` is `-2` in JavaScript, which is wrong for a refund).
- **Pro-rata endorsements.** A mid-term premium change charges or returns only the difference for the remaining days.
- **Layered unearned premium.** Each premium-bearing transaction earns from *its own* effective date. A cancellation after several endorsements returns the exact unearned amount, and rounding happens once at the end to avoid penny drift.
- **Taxes vs. fees.** Percentage-based surplus lines taxes and stamping fees are refunded pro rata. Flat filing fees are fully earned and never refunded.
- **Reinstatement** reverses the cancellation transaction exactly, so a cancel + reinstate round trip bills to the cent what it did before.
- **Business rules as errors.** Flat cancels only on the effective date, no endorsing a cancelled policy, dates must fall inside the term.

## Project layout

```
server/
  src/domain/      pure business logic (no I/O), fully unit tested
    money.ts       cents + rounding
    dates.ts       UTC calendar-date arithmetic
    fees.ts        per-state tax/fee schedules (sample rates)
    policy.ts      lifecycle: createQuote, issue, endorse, cancel, reinstate
  src/schema.ts    GraphQL schema + resolvers
  src/repository.ts  in-memory and Postgres (JSONB aggregate) stores
  db/schema.sql
  test/policy.test.ts
client/            React + Vite UI for the API
```

## Run it

```bash
# API (in-memory store by default; set DATABASE_URL to use Postgres)
cd server
npm install
npm test        # 12 unit tests
npm run dev     # http://localhost:4000/graphql

# UI
cd ../client
npm install
npm run dev     # http://localhost:5173
```

Example:

```graphql
mutation {
  createQuote(insuredName: "Acme LLC", state: "CA", effectiveDate: "2026-01-01", annualPremium: 1000000) { id }
}
# issue(id) -> billed $10,343.00 (premium + 3% SL tax + 0.18% stamping + $25 filing fee)
# cancel(id, effectiveDate: "2026-04-01", method: PRO_RATA) -> $2,465.75 earned premium remains
# reinstate(id) -> back to exactly $10,343.00
```

## Notes

- Tax and fee rates in `fees.ts` are illustrative samples, not a regulatory reference.
- Built with heavy use of AI coding tools. I designed the domain model and rules and reviewed and tested all of the code.
