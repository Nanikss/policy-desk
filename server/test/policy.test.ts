import {
  cancel,
  createQuote,
  endorse,
  issue,
  PolicyRuleError,
  reinstate,
  totalBilled,
  unearnedPremium,
  writtenPremium,
} from "../src/domain/policy";
import { roundHalfUp } from "../src/domain/money";

// 2026-01-01 to 2027-01-01 is a 365-day term.
const base = { insuredName: "Acme Warehousing LLC", state: "CA", effectiveDate: "2026-01-01", annualPremium: 1_000_000 };

describe("money rounding", () => {
  it("rounds half away from zero for charges and refunds alike", () => {
    expect(roundHalfUp(2.5)).toBe(3);
    expect(roundHalfUp(-2.5)).toBe(-3);
  });
});

describe("issue", () => {
  it("writes full-term premium plus percentage taxes and the flat filing fee", () => {
    const p = issue(createQuote(base));
    const [txn] = p.transactions;
    expect(p.status).toBe("IN_FORCE");
    expect(txn.premium).toBe(1_000_000);
    expect(txn.fees).toEqual({ surplusLinesTax: 30_000, stampingFee: 1_800, filingFee: 2_500 });
    expect(txn.total).toBe(1_034_300);
  });

  it("rejects issuing twice", () => {
    expect(() => issue(issue(createQuote(base)))).toThrow(PolicyRuleError);
  });
});

describe("endorse", () => {
  it("charges the premium difference pro rata for the remaining term", () => {
    const p = endorse(issue(createQuote(base)), 1_200_000, "2026-07-02"); // 183 days remain
    const e = p.transactions[1];
    expect(e.premium).toBe(roundHalfUp((200_000 * 183) / 365)); // 100,274
    expect(e.fees.filingFee).toBe(0);
    expect(p.annualPremium).toBe(1_200_000);
  });

  it("returns premium on a decrease", () => {
    const p = endorse(issue(createQuote(base)), 800_000, "2026-07-02");
    expect(p.transactions[1].premium).toBeLessThan(0);
  });

  it("rejects dates outside the term", () => {
    expect(() => endorse(issue(createQuote(base)), 1_200_000, "2027-02-01")).toThrow(/outside the policy term/);
  });
});

describe("cancel", () => {
  it("flat cancel returns all premium and percentage taxes but keeps the filing fee", () => {
    const p = cancel(issue(createQuote(base)), "2026-01-01", "FLAT");
    expect(writtenPremium(p)).toBe(0);
    expect(totalBilled(p)).toBe(2_500); // only the fully earned filing fee remains
  });

  it("flat cancel is only allowed on the effective date", () => {
    expect(() => cancel(issue(createQuote(base)), "2026-03-01", "FLAT")).toThrow(/effective date/);
  });

  it("pro rata cancel returns exactly the unearned premium", () => {
    const issued = issue(createQuote(base));
    const p = cancel(issued, "2026-04-01", "PRO_RATA"); // 275 of 365 days unearned
    expect(p.transactions[1].premium).toBe(-roundHalfUp((1_000_000 * 275) / 365));
  });

  it("handles endorsements: each premium layer earns from its own effective date", () => {
    let p = issue(createQuote(base));
    p = endorse(p, 1_200_000, "2026-07-02");
    const expected = roundHalfUp((1_000_000 * 92) / 365 + (p.transactions[1].premium * 92) / 183);
    expect(unearnedPremium(p, "2026-10-01")).toBe(expected);
  });

  it("never leaves negative written premium after any cancellation", () => {
    for (const date of ["2026-01-01", "2026-02-15", "2026-06-30", "2026-12-31"]) {
      const p = cancel(endorse(issue(createQuote(base)), 1_337_000, "2026-01-01"), date, "PRO_RATA");
      expect(writtenPremium(p)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("reinstate", () => {
  it("exactly reverses the cancellation", () => {
    const issued = issue(createQuote(base));
    const p = reinstate(cancel(issued, "2026-04-01", "PRO_RATA"));
    expect(p.status).toBe("IN_FORCE");
    expect(writtenPremium(p)).toBe(writtenPremium(issued));
    expect(totalBilled(p)).toBe(totalBilled(issued));
  });
});
