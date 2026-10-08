import { Pool } from "pg";
import { Policy } from "./domain/policy";

export interface PolicyRepository {
  get(id: string): Promise<Policy | undefined>;
  list(): Promise<Policy[]>;
  save(policy: Policy): Promise<void>;
}

/** Default store for local development and tests. */
export class InMemoryPolicyRepository implements PolicyRepository {
  private readonly policies = new Map<string, Policy>();

  async get(id: string) {
    return this.policies.get(id);
  }

  async list() {
    return [...this.policies.values()];
  }

  async save(policy: Policy) {
    this.policies.set(policy.id, policy);
  }
}

/**
 * Postgres store. The policy aggregate is saved as one JSONB document so a
 * transaction list can never be partially written. See db/schema.sql.
 */
export class PostgresPolicyRepository implements PolicyRepository {
  constructor(private readonly pool: Pool) {}

  async get(id: string) {
    const r = await this.pool.query("SELECT doc FROM policies WHERE id = $1", [id]);
    return r.rows[0]?.doc as Policy | undefined;
  }

  async list() {
    const r = await this.pool.query("SELECT doc FROM policies ORDER BY updated_at DESC");
    return r.rows.map((row) => row.doc as Policy);
  }

  async save(policy: Policy) {
    await this.pool.query(
      `INSERT INTO policies (id, status, doc, updated_at) VALUES ($1, $2, $3, now())
       ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, doc = EXCLUDED.doc, updated_at = now()`,
      [policy.id, policy.status, JSON.stringify(policy)],
    );
  }
}
