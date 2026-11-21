import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { startServer } from "./test-helpers.js";

function assertNotFound(response) {
  assert.equal(response.status, 404);
  assert.deepEqual(response.data, { error: "not found" });
}

async function assertRemovedRoutes(srv, token, adminToken, id) {
  const getVerify = await srv.get("/api/verify", { token });
  assertNotFound(getVerify);

  const postVerify = await srv.post("/api/verify", {
    token,
    body: { fullName: "Test User", dob: "1990-01-01", country: "Romania", docType: "Passport", dataUrl: "data:image/png;base64,AA==" },
  });
  assertNotFound(postVerify);

  const adminList = await srv.get("/api/admin/verifications", { token: adminToken });
  assertNotFound(adminList);

  const adminDoc = await srv.get(`/api/admin/verifications/${id}/doc`, { token: adminToken });
  assertNotFound(adminDoc);

  const adminReview = await srv.post(`/api/admin/verifications/${id}`, { token: adminToken, body: { action: "approve", note: "ok" } });
  assertNotFound(adminReview);
}

test("KYC verification endpoints are removed and fresh DB has no verifications table", async () => {
  const srv = await startServer();
  try {
    const reg = await srv.post("/api/auth/register", { body: { login: "nokycplayer", nick: "NoKycPlayer", password: "password123" } });
    assert.equal(reg.status, 200);
    const token = reg.data.token;
    const adminToken = await srv.login("admin", "admin123");
    assert.ok(adminToken);

    await assertRemovedRoutes(srv, token, adminToken, 1);

    const db = new DatabaseSync(path.join(srv.dataDir, "ggpoker.db"), { readOnly: true });
    try {
      const table = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'verifications'").get();
      assert.equal(table, undefined);
    } finally {
      db.close();
    }
  } finally {
    await srv.stop();
    fs.rmSync(srv.dataDir, { recursive: true, force: true });
  }
});

test("an existing database with an ID record restarts without exposing or modifying it", async () => {
  let srv = await startServer();
  const { dataDir } = srv;
  const file = path.join(dataDir, "ggpoker.db");
  try {
    const account = { login: "legacyplayer", nick: "LegacyPlayer", password: "fixture-password" };
    const reg = await srv.post("/api/auth/register", { body: account });
    assert.equal(reg.status, 200);
    await srv.stop();
    srv = null;

    // Recreate the pre-removal schema on disk, linked to the persisted player's actual ID.
    const db = new DatabaseSync(file);
    let before;
    try {
      db.exec(`CREATE TABLE verifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL UNIQUE, full_name TEXT NOT NULL,
        dob TEXT, country TEXT, doc_type TEXT, doc_data TEXT, status TEXT NOT NULL DEFAULT 'pending',
        note TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), reviewed_at TEXT)`);
      db.prepare("INSERT INTO verifications (id,user_id,full_name,doc_type,doc_data) VALUES (?,?,?,?,?)")
        .run(37, reg.data.user.id, "Legacy Fixture", "Passport", "data:image/png;base64,bGVnYWN5");
      before = db.prepare("SELECT * FROM verifications").all();
    } finally { db.close(); }

    srv = await startServer({ dataDir });
    const token = await srv.login(account.login, account.password);
    const adminToken = await srv.login("admin", "admin123");
    assert.ok(token);
    assert.ok(adminToken);
    const me = await srv.get("/api/me", { token });
    assert.equal(me.status, 200);
    assert.equal(me.data.user.id, reg.data.user.id);
    await assertRemovedRoutes(srv, token, adminToken, before[0].id);

    const after = new DatabaseSync(file, { readOnly: true });
    try { assert.deepEqual(after.prepare("SELECT * FROM verifications").all(), before); }
    finally { after.close(); }
  } finally {
    if (srv) await srv.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
