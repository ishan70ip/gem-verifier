// Supabase-backed implementation of the same collection API as ./store.js.
// Selected when DB_MODE=supabase (see ./models.js). Routes, middleware and
// the seed script import from ./models.js and work unchanged against either
// backend: file mode for zero-setup demos, Supabase for production.
// Requires SUPABASE_URL + SUPABASE_SERVICE_KEY (service key: bypasses RLS;
// never expose it to the frontend).
let clientPromise = null;

async function getClient() {
  if (!clientPromise) {
    clientPromise = (async () => {
      const { createClient } = await import("@supabase/supabase-js");
      const url = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_KEY;
      if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set for DB_MODE=supabase");
      return createClient(url, key, { auth: { persistSession: false } });
    })();
  }
  return clientPromise;
}

// Strip functions/undefined so rows are clean JSON for Postgres.
const cleanRow = (value) => JSON.parse(JSON.stringify(value));

function applyFilter(query, table, filter = {}) {
  let q = query;
  for (const [key, cond] of Object.entries(filter)) {
    if (cond !== null && typeof cond === "object" && !Array.isArray(cond)) {
      if ("$in" in cond) q = q.in(key, cond.$in);
      else if ("$ne" in cond) q = q.neq(key, cond.$ne);
      else if ("$gte" in cond) q = q.gte(key, cond.$gte);
      else if ("$lte" in cond) q = q.lte(key, cond.$lte);
      else throw new Error(`Unsupported filter operator on ${table}.${key}`);
    } else if (cond === undefined) {
      q = q.is(key, null);
    } else {
      q = q.eq(key, cond);
    }
  }
  return q;
}

function applySort(query, spec = {}) {
  let q = query;
  for (const [key, dir] of Object.entries(spec)) {
    q = q.order(key, { ascending: dir !== -1 });
  }
  return q;
}

function wrap(table, row) {
  if (!row) return null;
  const data = { ...row };
  return {
    ...data,
    toObject() {
      const { toObject, save, updateOne, ...rest } = this;
      return cleanRow(rest);
    },
    async save() {
      const supabase = await getClient();
      const { toObject, save, updateOne, _id, ...fields } = this;
      const payload = { ...cleanRow(fields), updatedAt: new Date().toISOString() };
      const { data: updated, error } = await supabase.from(table).update(payload).eq("_id", _id).select().single();
      if (error) throw error;
      Object.assign(this, updated);
      return this;
    },
    async updateOne(update) {
      const supabase = await getClient();
      const set = update?.$set || update || {};
      const { error } = await supabase
        .from(table)
        .update({ ...cleanRow(set), updatedAt: new Date().toISOString() })
        .eq("_id", data._id);
      if (error) throw error;
    },
  };
}

class ListQuery {
  constructor(table, filter) {
    this.table = table;
    this.filter = filter;
    this._sort = null;
    this._limit = null;
  }
  sort(spec) { this._sort = spec; return this; }
  limit(n) { this._limit = n; return this; }
  lean() { return this; }
  async _run() {
    const supabase = await getClient();
    let q = applyFilter(supabase.from(this.table).select("*"), this.table, this.filter);
    if (this._sort) q = applySort(q, this._sort);
    if (this._limit != null) q = q.limit(this._limit);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }
  then(resolve, reject) { return this._run().then(resolve, reject); }
  catch(reject) { return this._run().catch(reject); }
}

class SingleQuery {
  constructor(table, filter) {
    this.table = table;
    this.filter = filter;
    this._lean = false;
    this._sort = null;
  }
  sort(spec) { this._sort = spec; return this; }
  lean() { this._lean = true; return this; }
  async _run() {
    const supabase = await getClient();
    let q = applyFilter(supabase.from(this.table).select("*"), this.table, this.filter);
    if (this._sort) q = applySort(q, this._sort);
    const { data, error } = await q.limit(1).maybeSingle();
    if (error) throw error;
    return this._lean ? data : wrap(this.table, data);
  }
  then(resolve, reject) { return this._run().then(resolve, reject); }
  catch(reject) { return this._run().catch(reject); }
}

class UpdateQuery {
  constructor(run) { this._run = run; this._lean = false; }
  lean() { this._lean = true; return this; }
  sort() { return this; }
  async _exec() {
    const doc = await this._run();
    if (!doc) return null;
    if (this._lean) return cleanRow(doc.toObject ? doc.toObject() : doc);
    return doc;
  }
  then(resolve, reject) { return this._exec().then(resolve, reject); }
  catch(reject) { return this._exec().catch(reject); }
}

function applyUpdatePayload(update) {
  const set = update?.$set || update || {};
  return { ...cleanRow(set), updatedAt: new Date().toISOString() };
}

function createCollection(table) {
  return {
    async syncIndexes() {},
    find(filter = {}) { return new ListQuery(table, filter); },
    findOne(filter = {}) { return new SingleQuery(table, filter); },
    findById(id) { return new SingleQuery(table, { _id: id }); },
    async exists(filter = {}) {
      const supabase = await getClient();
      const q = applyFilter(supabase.from(table).select("_id", { count: "exact", head: true }), table, filter);
      const { count, error } = await q;
      if (error) throw error;
      return (count || 0) > 0;
    },
    async countDocuments(filter = {}) {
      const supabase = await getClient();
      const q = applyFilter(supabase.from(table).select("_id", { count: "exact", head: true }), table, filter);
      const { count, error } = await q;
      if (error) throw error;
      return count || 0;
    },
    async create(payload) {
      const supabase = await getClient();
      const { randomUUID } = await import("node:crypto");
      const now = new Date().toISOString();
      const row = { _id: payload._id || randomUUID(), ...cleanRow(payload) };
      if (!row.createdAt) row.createdAt = now;
      if (!row.updatedAt) row.updatedAt = now;
      const { data, error } = await supabase.from(table).insert(row).select().single();
      if (error) throw error;
      return wrap(table, data);
    },
    async insertMany(rows) {
      const supabase = await getClient();
      const { randomUUID } = await import("node:crypto");
      const now = new Date().toISOString();
      const payload = rows.map((r) => ({
        _id: r._id || randomUUID(),
        ...cleanRow(r),
        createdAt: r.createdAt || now,
        updatedAt: r.updatedAt || now,
      }));
      const { data, error } = await supabase.from(table).insert(payload).select();
      if (error) throw error;
      return (data || []).map((d) => wrap(table, d));
    },
    async deleteMany(filter = {}) {
      const supabase = await getClient();
      const q = applyFilter(supabase.from(table).delete(), table, filter);
      const { error, count } = await q;
      if (error) throw error;
      return { deletedCount: count || 0 };
    },
    findByIdAndUpdate(id, update) {
      return new UpdateQuery(async () => {
        const supabase = await getClient();
        const { data, error } = await supabase.from(table).update(applyUpdatePayload(update)).eq("_id", id).select().maybeSingle();
        if (error) throw error;
        return wrap(table, data);
      });
    },
    findOneAndUpdate(filter, update, options = {}) {
      return new UpdateQuery(async () => {
        const supabase = await getClient();
        const existing = await applyFilter(supabase.from(table).select("*"), table, filter).limit(1).maybeSingle().then((r) => {
          if (r.error) throw r.error;
          return r.data;
        });
        if (!existing && options.upsert) {
          const { randomUUID } = await import("node:crypto");
          const now = new Date().toISOString();
          const row = { _id: randomUUID(), ...cleanRow(filter), ...cleanRow(update?.$set || {}), ...cleanRow(update?.$setOnInsert || {}), createdAt: now, updatedAt: now };
          const { data, error } = await supabase.from(table).insert(row).select().single();
          if (error) throw error;
          return wrap(table, data);
        }
        if (!existing) return null;
        if (!options.upsert) {
          const set = update?.$set || update;
          if (set && Object.keys(set).length) {
            const { data, error } = await supabase.from(table).update(applyUpdatePayload(update)).eq("_id", existing._id).select().single();
            if (error) throw error;
            return wrap(table, data);
          }
        }
        return wrap(table, existing);
      });
    },
  };
}

export const User = createCollection("users");
export const Vendor = createCollection("vendors");
export const Tender = createCollection("tenders");
export const Requirement = createCollection("tender_requirements");
export const Bid = createCollection("bids");
export const ComplianceResult = createCollection("compliance_results");
export const Evaluation = createCollection("evaluations");
export const Award = createCollection("contract_awards");
export const Rejection = createCollection("rejections");
export const AuditLog = createCollection("audit_logs");
export const Document = createCollection("documents");

export async function connectDatabase() {
  const supabase = await getClient();
  const { error } = await supabase.from("users").select("_id", { count: "exact", head: true });
  if (error) throw new Error(`Supabase connection failed: ${error.message}. Run backend/supabase/schema.sql first.`);
  return { mode: "supabase" };
}

export async function resetDatabase() {
  const supabase = await getClient();
  for (const table of ["documents", "audit_logs", "contract_awards", "compliance_results", "evaluations", "bids", "tender_requirements", "tenders", "vendors", "users"]) {
    const { error } = await supabase.from(table).delete().neq("_id", "00000000-0000-0000-0000-000000000000");
    if (error) throw error;
  }
}
