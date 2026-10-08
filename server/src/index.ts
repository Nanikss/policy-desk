import express from "express";
import { createHandler } from "graphql-http/lib/use/express";
import { Pool } from "pg";
import { InMemoryPolicyRepository, PolicyRepository, PostgresPolicyRepository } from "./repository";
import { createRoot, schema } from "./schema";

const repo: PolicyRepository = process.env.DATABASE_URL
  ? new PostgresPolicyRepository(new Pool({ connectionString: process.env.DATABASE_URL }))
  : new InMemoryPolicyRepository();

const app = express();

// Allow the Vite dev client to call the API.
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", process.env.CORS_ORIGIN ?? "http://localhost:5173");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.all("/graphql", createHandler({ schema, rootValue: createRoot(repo) }));
app.get("/health", (_req, res) => res.json({ ok: true, store: process.env.DATABASE_URL ? "postgres" : "memory" }));

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => console.log(`policy-desk API on http://localhost:${port}/graphql`));
