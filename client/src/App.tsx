import type React from "react";
import { FormEvent, useEffect, useState } from "react";
import { gql, money, Policy, POLICY_FIELDS } from "./api";

const STATES = ["CA", "NY", "TX", "FL"];

export default function App() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const data = await gql<{ policies: Policy[] }>(`{ policies { ${POLICY_FIELDS} } }`);
    setPolicies(data.policies);
  }

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    run(async () => undefined);
  }, []);

  const selected = policies.find((p) => p.id === selectedId) ?? null;

  return (
    <main style={styles.page}>
      <h1 style={{ marginBottom: 4 }}>Policy Desk</h1>
      <p style={styles.muted}>Quote, issue, endorse, cancel and reinstate surplus lines policies.</p>
      {error && <div style={styles.error}>{error}</div>}
      <div style={styles.grid}>
        <section>
          <QuoteForm
            onSubmit={(v) =>
              run(async () => {
                const d = await gql<{ createQuote: Policy }>(
                  `mutation($n:String!,$s:String!,$e:String!,$p:Int!){ createQuote(insuredName:$n,state:$s,effectiveDate:$e,annualPremium:$p){ id } }`,
                  { n: v.insuredName, s: v.state, e: v.effectiveDate, p: Math.round(v.annualPremium * 100) },
                );
                setSelectedId(d.createQuote.id);
              })
            }
          />
          <h2 style={styles.h2}>Policies</h2>
          {policies.length === 0 && <p style={styles.muted}>No policies yet. Create a quote above.</p>}
          <ul style={styles.list}>
            {policies.map((p) => (
              <li key={p.id}>
                <button style={{ ...styles.row, ...(p.id === selectedId ? styles.rowActive : {}) }} onClick={() => setSelectedId(p.id)}>
                  <strong>{p.insuredName}</strong>
                  <span>{p.state} · {p.status.replace("_", " ")}</span>
                  <span>{money(p.totalBilled)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section>{selected ? <PolicyDetail policy={selected} run={run} /> : <p style={styles.muted}>Select a policy.</p>}</section>
      </div>
    </main>
  );
}

function QuoteForm({ onSubmit }: { onSubmit: (v: { insuredName: string; state: string; effectiveDate: string; annualPremium: number }) => void }) {
  const [insuredName, setInsuredName] = useState("Acme Warehousing LLC");
  const [state, setState] = useState("CA");
  const [effectiveDate, setEffectiveDate] = useState("2026-01-01");
  const [annualPremium, setAnnualPremium] = useState(10000);

  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit({ insuredName, state, effectiveDate, annualPremium });
  }

  return (
    <form onSubmit={submit} style={styles.card}>
      <h2 style={styles.h2}>New quote</h2>
      <label style={styles.label}>Insured<input style={styles.input} value={insuredName} onChange={(e) => setInsuredName(e.target.value)} /></label>
      <label style={styles.label}>State
        <select style={styles.input} value={state} onChange={(e) => setState(e.target.value)}>
          {STATES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </label>
      <label style={styles.label}>Effective date<input style={styles.input} type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} /></label>
      <label style={styles.label}>Annual premium (USD)<input style={styles.input} type="number" min={1} step="0.01" value={annualPremium} onChange={(e) => setAnnualPremium(Number(e.target.value))} /></label>
      <button style={styles.primary} type="submit">Create quote</button>
    </form>
  );
}

function PolicyDetail({ policy, run }: { policy: Policy; run: (a: () => Promise<unknown>) => void }) {
  const [date, setDate] = useState(policy.effectiveDate);
  const [newPremium, setNewPremium] = useState(policy.annualPremium / 100);
  const mutate = (q: string, v: Record<string, unknown> = {}) => run(() => gql(q, { id: policy.id, ...v }));

  return (
    <div style={styles.card}>
      <h2 style={styles.h2}>{policy.insuredName}</h2>
      <p style={styles.muted}>
        {policy.state} · {policy.effectiveDate} to {policy.expirationDate} · {policy.status.replace("_", " ")}
      </p>
      <p>Annual premium {money(policy.annualPremium)} · Written {money(policy.writtenPremium)} · Billed {money(policy.totalBilled)}</p>

      <div style={styles.actions}>
        {policy.status === "QUOTED" && <button style={styles.primary} onClick={() => mutate(`mutation($id:ID!){ issue(id:$id){ id } }`)}>Issue</button>}
        {policy.status === "IN_FORCE" && (
          <>
            <label style={styles.label}>Effective date<input style={styles.input} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
            <label style={styles.label}>New annual premium<input style={styles.input} type="number" step="0.01" value={newPremium} onChange={(e) => setNewPremium(Number(e.target.value))} /></label>
            <button style={styles.primary} onClick={() => mutate(`mutation($id:ID!,$p:Int!,$d:String!){ endorse(id:$id,newAnnualPremium:$p,effectiveDate:$d){ id } }`, { p: Math.round(newPremium * 100), d: date })}>Endorse</button>
            <button style={styles.secondary} onClick={() => mutate(`mutation($id:ID!,$d:String!){ cancel(id:$id,effectiveDate:$d,method:PRO_RATA){ id } }`, { d: date })}>Cancel pro rata</button>
            <button style={styles.secondary} onClick={() => mutate(`mutation($id:ID!,$d:String!){ cancel(id:$id,effectiveDate:$d,method:FLAT){ id } }`, { d: policy.effectiveDate })}>Flat cancel</button>
          </>
        )}
        {policy.status === "CANCELLED" && <button style={styles.primary} onClick={() => mutate(`mutation($id:ID!){ reinstate(id:$id){ id } }`)}>Reinstate</button>}
      </div>

      <h3 style={styles.h2}>Transactions</h3>
      <table style={styles.table}>
        <thead><tr><th style={styles.th}>Type</th><th style={styles.th}>Effective</th><th style={styles.th}>Premium</th><th style={styles.th}>Total</th></tr></thead>
        <tbody>
          {policy.transactions.map((t) => (
            <tr key={t.id}>
              <td style={styles.td}>{t.type}</td>
              <td style={styles.td}>{t.effectiveDate}</td>
              <td style={styles.td}>{money(t.premium)}</td>
              <td style={styles.td}>{money(t.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { fontFamily: "system-ui, sans-serif", maxWidth: 1100, margin: "0 auto", padding: 24, color: "#1f2933" },
  muted: { color: "#616e7c" },
  error: { background: "#fde8e8", color: "#9b1c1c", padding: 12, borderRadius: 8, margin: "12px 0" },
  grid: { display: "grid", gridTemplateColumns: "minmax(280px, 1fr) 2fr", gap: 24, alignItems: "start" },
  card: { border: "1px solid #e4e7eb", borderRadius: 10, padding: 16, display: "grid", gap: 10 },
  h2: { fontSize: 18, margin: "8px 0" },
  label: { display: "grid", gap: 4, fontSize: 14 },
  input: { padding: 8, borderRadius: 6, border: "1px solid #cbd2d9", font: "inherit" },
  primary: { padding: "8px 14px", borderRadius: 6, border: 0, background: "#1d4ed8", color: "white", cursor: "pointer" },
  secondary: { padding: "8px 14px", borderRadius: 6, border: "1px solid #cbd2d9", background: "white", cursor: "pointer" },
  actions: { display: "flex", flexWrap: "wrap", gap: 10, alignItems: "end" },
  list: { listStyle: "none", padding: 0, display: "grid", gap: 6 },
  row: { width: "100%", display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8, textAlign: "left", padding: 10, borderRadius: 8, border: "1px solid #e4e7eb", background: "white", cursor: "pointer" },
  rowActive: { borderColor: "#1d4ed8", background: "#eff4ff" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 14 },
  th: { textAlign: "left", borderBottom: "1px solid #e4e7eb", padding: 6 },
  td: { borderBottom: "1px solid #f0f2f4", padding: 6 },
};
