// SPDX-License-Identifier: AGPL-3.0-only
// Marketplace catalog, interest requests and manually provisioned service access.
// This module does not process payments or change any gameplay balance or feature.
import { randomUUID } from 'node:crypto';

const PUBLIC_ROOT = '/api/marketplace';
const ADMIN_ROOT = '/api/admin/marketplace';
const CATEGORIES = ['hosting', 'tools', 'customization', 'extensions'];
const DELIVERIES = ['hosted_service', 'open_source_extension', 'commercial_module'];
const STATUSES = ['draft', 'coming_soon', 'available', 'archived'];
const PRICING = ['free', 'quote', 'one_time', 'monthly', 'yearly'];
const CURRENCIES = ['EUR', 'RON', 'USD'];
const PRODUCT_FIELDS = ['slug', 'name', 'summary', 'description', 'category', 'delivery', 'status', 'pricing', 'price_cents', 'currency', 'features', 'featured', 'sort_order'];
const SETTINGS_FIELDS = ['title', 'subtitle', 'contact_note', 'requests_enabled'];
const LIMIT = 500;
const REQUESTS_PER_HOUR = 5;
const REQUESTS_PER_DAY = 10;
const timestamp = () => new Date().toISOString();

const DEFAULT_SETTINGS = {
  title: 'Mai mult pentru comunitatea ta.',
  subtitle: 'Descoperă serviciile DanGG pentru organizatori și direcțiile în care construim marketplace-ul. Comunitatea open-source rămâne instalabilă independent.',
  contact_note: 'Trimite o cerere de interes. Echipa DanGG îți răspunde înainte de orice activare. Cererile nu inițiază plăți și nu cumpără jetoane de joc.',
  requests_enabled: true,
};

const SEEDS = [
  { id: 'club-hosting', slug: 'club-hosting', name: 'Găzduire pentru club', summary: 'Un spațiu administrat pentru comunitatea ta de poker social.', category: 'hosting', delivery: 'hosted_service', featured: true,
    description: 'Serviciu în pregătire pentru organizatorii care vor să își găzduiască activitatea în rețeaua oficială DanGG. Capacitatea, suportul și condițiile de operare se stabilesc individual. Cererea exprimă interesul și nu activează automat un serviciu.',
    features: ['Configurare asistată', 'Capacitate de găzduire convenită', 'Suport pentru organizator'] },
  { id: 'organizer-tools', slug: 'organizer-tools', name: 'Instrumente pentru organizatori', summary: 'Planificare și rapoarte pentru comunități care cresc.', category: 'tools', delivery: 'hosted_service', featured: true,
    description: 'Pachet planificat de instrumente pentru gestionarea evenimentelor și urmărirea activității unui club. Funcțiile și disponibilitatea vor fi confirmate înainte de activare. Nu include premii în bani sau jetoane cumpărabile.',
    features: ['Planificarea evenimentelor', 'Rapoarte pentru club', 'Configurare împreună cu echipa DanGG'] },
  { id: 'club-branding', slug: 'club-branding', name: 'Personalizare pentru club', summary: 'Identitatea comunității tale, într-o experiență DanGG coerentă.', category: 'customization', delivery: 'hosted_service', featured: false,
    description: 'Serviciu planificat pentru personalizarea identității unui club și asistență la configurare. Domeniul, elementele vizuale și lucrările necesare se stabilesc în ofertă. Disponibilitatea se confirmă individual.',
    features: ['Identitate vizuală pentru club', 'Asistență pentru domeniu propriu', 'Configurare și integrare asistate'] },
  { id: 'community-extensions', slug: 'community-extensions', name: 'Extensii comunitare', summary: 'Un loc pentru idei, extensii și contribuții compatibile cu DanGG.', category: 'extensions', delivery: 'open_source_extension', featured: false,
    description: 'Catalog în pregătire pentru extensii ale comunității. Licența și compatibilitatea fiecărei extensii vor fi precizate înainte de distribuție. Oferta se referă la evaluare, integrare sau suport; drepturile asupra codului rămân cele acordate de licența sa.',
    features: ['Propuneri de extensii', 'Evaluarea compatibilității', 'Integrare și suport la cerere'] },
];

function transaction(db, operation) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = operation(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function objectBody(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('Datele trebuie să fie un obiect.');
  if (JSON.stringify(body).length > 24_000) fail('Conținutul trimis este prea mare.', 413);
  const unknown = Object.keys(body).filter((key) => !allowed.includes(key));
  if (unknown.length) fail('Cererea conține câmpuri neacceptate.');
  return body;
}

function textField(value, name, maximum, minimum = 0) {
  if (typeof value !== 'string') fail(`${name} trebuie să fie text.`);
  const clean = value.trim();
  if (clean.length < minimum || clean.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(clean)) {
    fail(`${name} trebuie să aibă între ${minimum} și ${maximum} de caractere.`);
  }
  return clean;
}

function choice(value, allowed, label) {
  if (!allowed.includes(value)) fail(`${label} nu este valid.`);
  return value;
}

function numericId(value) {
  if (!Number.isSafeInteger(value) || value < 1) fail('Identificatorul utilizatorului nu este valid.');
  return value;
}

function pathId(raw, numeric = false) {
  let id;
  try { id = decodeURIComponent(raw); } catch { fail('Identificator invalid.'); }
  if (numeric) {
    if (!/^[1-9][0-9]{0,14}$/.test(id)) fail('Identificator invalid.');
    return numericId(Number(id));
  }
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) fail('Identificator invalid.');
  return id;
}

function normalizeProduct(body, previous = null) {
  objectBody(body, PRODUCT_FIELDS);
  const value = { summary: '', description: '', category: 'hosting', delivery: 'hosted_service', status: 'draft', pricing: 'quote', price_cents: null, currency: 'EUR', features: [], featured: false, sort_order: 0, ...previous, ...body };
  const slug = textField(value.slug, 'Adresa produsului', 80, 1);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) fail('Adresa produsului acceptă litere mici, cifre și cratime.');
  const output = {
    slug,
    name: textField(value.name, 'Numele', 120, 2),
    summary: textField(value.summary, 'Rezumatul', 240),
    description: textField(value.description, 'Descrierea', 6000),
    category: choice(value.category, CATEGORIES, 'Categoria'),
    delivery: choice(value.delivery, DELIVERIES, 'Tipul produsului'),
    status: choice(value.status, STATUSES, 'Starea'),
    pricing: choice(value.pricing, PRICING, 'Tipul prețului'),
    currency: choice(value.currency, CURRENCIES, 'Moneda'),
  };
  if (!Array.isArray(value.features) || value.features.length > 12) fail('Sunt permise cel mult 12 caracteristici.');
  output.features = value.features.map((item) => textField(item, 'Caracteristica', 160, 1));
  if (typeof value.featured !== 'boolean') fail('Promovarea produsului trebuie să fie true sau false.');
  output.featured = value.featured;
  if (!Number.isSafeInteger(value.sort_order) || Math.abs(value.sort_order) > 10000) fail('Ordinea trebuie să fie un număr întreg între -10000 și 10000.');
  output.sort_order = value.sort_order;
  if (value.price_cents !== null && (!Number.isSafeInteger(value.price_cents) || value.price_cents < 0 || value.price_cents > 100_000_000)) fail('Prețul trebuie exprimat ca număr întreg de subdiviziuni monetare.');
  if (output.pricing === 'quote') output.price_cents = null;
  else if (output.pricing === 'free') output.price_cents = 0;
  else {
    if (!Number.isSafeInteger(value.price_cents) || value.price_cents <= 0) fail('Un preț cu plată trebuie să fie mai mare decât zero.');
    output.price_cents = value.price_cents;
  }
  if (['available', 'coming_soon'].includes(output.status) && !output.summary) fail('Adaugă un rezumat înainte de publicare.');
  return output;
}

function productFrom(row) {
  if (!row) return null;
  // Explicit projection: no operator-only fields are accidentally published.
  return {
    id: row.id, slug: row.slug, name: row.name, summary: row.summary, description: row.description,
    category: row.category, delivery: row.delivery, status: row.status, pricing: row.pricing,
    price_cents: row.price_cents, currency: row.currency, features: JSON.parse(row.features_json),
    featured: !!row.featured, sort_order: row.sort_order, created_at: row.created_at, updated_at: row.updated_at,
  };
}

function requestFrom(row, admin = false) {
  if (!row) return null;
  return {
    id: row.id, product_id: row.product_id, user_id: row.user_id, product_name: row.product_name,
    ...(admin ? { user_nick: row.user_nick } : {}),
    message: row.message, status: row.status, response: row.response, created_at: row.created_at, updated_at: row.updated_at,
  };
}

function entitlementFrom(row, admin = false) {
  if (!row) return null;
  return {
    id: row.id, product_id: row.product_id, user_id: row.user_id, product_name: row.product_name,
    ...(admin ? { user_nick: row.user_nick, note: row.note } : {}),
    status: row.status, expires_at: row.expires_at, created_at: row.created_at, updated_at: row.updated_at,
  };
}

const REQUEST_SELECT = `SELECT r.*, p.name product_name, u.nick user_nick FROM marketplace_requests r JOIN marketplace_products p ON p.id = r.product_id JOIN users u ON u.id = r.user_id`;
const ENTITLEMENT_SELECT = `SELECT e.*, p.name product_name, u.nick user_nick FROM marketplace_entitlements e JOIN marketplace_products p ON p.id = e.product_id JOIN users u ON u.id = e.user_id`;

export function ensureMarketplaceSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS marketplace_products (
      id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, summary TEXT NOT NULL,
      description TEXT NOT NULL, category TEXT NOT NULL, delivery TEXT NOT NULL, status TEXT NOT NULL,
      pricing TEXT NOT NULL, price_cents INTEGER, currency TEXT NOT NULL, features_json TEXT NOT NULL,
      featured INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS marketplace_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1), title TEXT NOT NULL, subtitle TEXT NOT NULL,
      contact_note TEXT NOT NULL, requests_enabled INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS marketplace_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT, product_id TEXT NOT NULL REFERENCES marketplace_products(id),
      user_id INTEGER NOT NULL REFERENCES users(id), message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
      response TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS marketplace_request_pending ON marketplace_requests(user_id, product_id) WHERE status = 'pending';
    CREATE INDEX IF NOT EXISTS marketplace_request_user_time ON marketplace_requests(user_id, created_at);
    CREATE TABLE IF NOT EXISTS marketplace_entitlements (
      id INTEGER PRIMARY KEY AUTOINCREMENT, product_id TEXT NOT NULL REFERENCES marketplace_products(id),
      user_id INTEGER NOT NULL REFERENCES users(id), status TEXT NOT NULL DEFAULT 'active',
      expires_at TEXT, note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      UNIQUE (product_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS marketplace_entitlement_user ON marketplace_entitlements(user_id);
  `);
  transaction(db, () => {
    db.prepare('INSERT OR IGNORE INTO marketplace_settings (id,title,subtitle,contact_note,requests_enabled) VALUES (1,?,?,?,?)')
      .run(DEFAULT_SETTINGS.title, DEFAULT_SETTINGS.subtitle, DEFAULT_SETTINGS.contact_note, 1);
    const insert = db.prepare(`INSERT OR IGNORE INTO marketplace_products (id,slug,name,summary,description,category,delivery,status,pricing,price_cents,currency,features_json,featured,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'coming_soon','quote',NULL,'EUR',?,?,?,?,?)`);
    const now = timestamp();
    for (const [index, item] of SEEDS.entries()) insert.run(item.id, item.slug, item.name, item.summary, item.description, item.category, item.delivery, JSON.stringify(item.features), item.featured ? 1 : 0, index * 10, now, now);
  });
}

/** Admin routes also pass the existing /api/admin network gate in index.js. */
export function createMarketplaceRoutes({ db, json, requireUser, requireAdmin, readBody }) {
  ensureMarketplaceSchema(db);
  const settings = () => {
    const row = db.prepare('SELECT title,subtitle,contact_note,requests_enabled FROM marketplace_settings WHERE id = 1').get();
    return { title: row.title, subtitle: row.subtitle, contact_note: row.contact_note, requests_enabled: !!row.requests_enabled };
  };
  const getProduct = (id) => productFrom(db.prepare('SELECT * FROM marketplace_products WHERE id = ?').get(id));
  const getRequest = (id, admin = false) => requestFrom(db.prepare(`${REQUEST_SELECT} WHERE r.id = ?`).get(id), admin);
  const getEntitlement = (id, admin = false) => entitlementFrom(db.prepare(`${ENTITLEMENT_SELECT} WHERE e.id = ?`).get(id), admin);
  const audit = (actor, action, detail) => db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)').run(actor.login, action, JSON.stringify(detail));
  const method = (req, allowed) => { if (!allowed.includes(req.method)) fail('Metodă neacceptată.', 405); };

  return async function handleMarketplace(req, res, url) {
    const pathname = url.pathname;
    const isPublic = pathname === PUBLIC_ROOT || pathname.startsWith(`${PUBLIC_ROOT}/`);
    const isAdmin = pathname === ADMIN_ROOT || pathname.startsWith(`${ADMIN_ROOT}/`);
    if (!isPublic && !isAdmin) return false;
    try {
      const actor = isAdmin ? requireAdmin(req, res) : null;
      if (isAdmin && !actor) return true;

      if (pathname === PUBLIC_ROOT) {
        method(req, ['GET']);
        const products = db.prepare("SELECT * FROM marketplace_products WHERE status IN ('available','coming_soon') ORDER BY featured DESC, sort_order, name LIMIT 200").all().map(productFrom);
        json(res, 200, { products, settings: settings(), checkout_enabled: false });
        return true;
      }
      if (pathname === `${PUBLIC_ROOT}/me`) {
        method(req, ['GET']);
        const user = requireUser(req, res); if (!user) return true;
        json(res, 200, {
          requests: db.prepare(`${REQUEST_SELECT} WHERE r.user_id = ? ORDER BY r.created_at DESC, r.id DESC LIMIT ?`).all(user.id, LIMIT).map((row) => requestFrom(row)),
          entitlements: db.prepare(`${ENTITLEMENT_SELECT} WHERE e.user_id = ? ORDER BY e.updated_at DESC, e.id DESC LIMIT ?`).all(user.id, LIMIT).map((row) => entitlementFrom(row)),
        });
        return true;
      }
      if (pathname === `${PUBLIC_ROOT}/requests`) {
        method(req, ['POST']);
        const user = requireUser(req, res); if (!user) return true;
        if (!settings().requests_enabled) fail('Cererile sunt momentan oprite.', 403);
        const body = objectBody(await readBody(req), ['product_id', 'message']);
        const productId = textField(body.product_id, 'Produsul', 100, 1);
        const message = textField(body.message ?? '', 'Mesajul', 2000);
        const result = transaction(db, () => {
          const product = getProduct(productId);
          if (!product || !['available', 'coming_soon'].includes(product.status)) fail('Produsul nu este disponibil pentru cereri.', 404);
          const existing = db.prepare("SELECT id FROM marketplace_requests WHERE user_id = ? AND product_id = ? AND status = 'pending'").get(user.id, productId);
          if (existing) return { duplicate: true, request: getRequest(existing.id) };
          const now = Date.now();
          const hourly = db.prepare('SELECT COUNT(*) n FROM marketplace_requests WHERE user_id = ? AND created_at >= ?').get(user.id, new Date(now - 3600_000).toISOString()).n;
          const daily = db.prepare('SELECT COUNT(*) n FROM marketplace_requests WHERE user_id = ? AND created_at >= ?').get(user.id, new Date(now - 86400_000).toISOString()).n;
          if (hourly >= REQUESTS_PER_HOUR || daily >= REQUESTS_PER_DAY) fail('Ai trimis deja mai multe cereri. Te rugăm să revii mai târziu.', 429);
          const at = new Date(now).toISOString();
          const result = db.prepare("INSERT INTO marketplace_requests (product_id,user_id,message,status,response,created_at,updated_at) VALUES (?,?,?,'pending','',?,?)").run(productId, user.id, message, at, at);
          return { duplicate: false, request: getRequest(Number(result.lastInsertRowid)) };
        });
        json(res, result.duplicate ? 200 : 201, result);
        return true;
      }

      if (pathname === ADMIN_ROOT) {
        method(req, ['GET']);
        const products = db.prepare('SELECT * FROM marketplace_products ORDER BY sort_order, name LIMIT 200').all().map(productFrom);
        json(res, 200, {
          products, settings: settings(),
          requests: db.prepare(`${REQUEST_SELECT} ORDER BY (r.status = 'pending') DESC, r.created_at DESC, r.id DESC LIMIT ?`).all(LIMIT).map((row) => requestFrom(row, true)),
          entitlements: db.prepare(`${ENTITLEMENT_SELECT} ORDER BY e.updated_at DESC, e.id DESC LIMIT ?`).all(LIMIT).map((row) => entitlementFrom(row, true)),
          stats: {
            products: db.prepare('SELECT COUNT(*) n FROM marketplace_products').get().n,
            published: db.prepare("SELECT COUNT(*) n FROM marketplace_products WHERE status IN ('available','coming_soon')").get().n,
            pending: db.prepare("SELECT COUNT(*) n FROM marketplace_requests WHERE status = 'pending'").get().n,
            active_access: db.prepare("SELECT COUNT(*) n FROM marketplace_entitlements WHERE status = 'active' AND (expires_at IS NULL OR expires_at > ?)").get(timestamp()).n,
          },
        });
        return true;
      }
      const productPath = pathname.match(/^\/api\/admin\/marketplace\/products\/([^/]+)$/);
      if (pathname === `${ADMIN_ROOT}/products` || productPath) {
        method(req, productPath ? ['PATCH'] : ['POST']);
        const id = productPath ? pathId(productPath[1]) : randomUUID();
        const previous = productPath ? getProduct(id) : null;
        if (productPath && !previous) fail('Produsul nu a fost găsit.', 404);
        if (!productPath && db.prepare('SELECT COUNT(*) n FROM marketplace_products').get().n >= 200) fail('Catalogul permite cel mult 200 de produse.', 409);
        const product = normalizeProduct(await readBody(req), previous);
        const duplicate = db.prepare('SELECT id FROM marketplace_products WHERE slug = ? AND id != ?').get(product.slug, id);
        if (duplicate) fail('Această adresă este deja folosită de un produs.', 409);
        transaction(db, () => {
          const now = timestamp();
          const values = [product.slug, product.name, product.summary, product.description, product.category, product.delivery, product.status, product.pricing, product.price_cents, product.currency, JSON.stringify(product.features), product.featured ? 1 : 0, product.sort_order];
          if (previous) db.prepare('UPDATE marketplace_products SET slug=?,name=?,summary=?,description=?,category=?,delivery=?,status=?,pricing=?,price_cents=?,currency=?,features_json=?,featured=?,sort_order=?,updated_at=? WHERE id=?').run(...values, now, id);
          else db.prepare('INSERT INTO marketplace_products (slug,name,summary,description,category,delivery,status,pricing,price_cents,currency,features_json,featured,sort_order,created_at,updated_at,id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(...values, now, now, id);
          audit(actor, previous ? 'marketplace_product_update' : 'marketplace_product_create', { product_id: id, name: product.name, status: product.status });
        });
        json(res, previous ? 200 : 201, { product: getProduct(id) });
        return true;
      }
      if (pathname === `${ADMIN_ROOT}/settings`) {
        method(req, ['PATCH']);
        const body = objectBody(await readBody(req), SETTINGS_FIELDS);
        const value = { ...settings(), ...body };
        const next = {
          title: textField(value.title, 'Titlul', 140, 1),
          subtitle: textField(value.subtitle, 'Subtitlul', 1000),
          contact_note: textField(value.contact_note, 'Nota pentru cereri', 1000),
          requests_enabled: value.requests_enabled,
        };
        if (typeof next.requests_enabled !== 'boolean') fail('Activarea cererilor trebuie să fie true sau false.');
        transaction(db, () => {
          db.prepare('UPDATE marketplace_settings SET title=?,subtitle=?,contact_note=?,requests_enabled=? WHERE id=1').run(next.title, next.subtitle, next.contact_note, next.requests_enabled ? 1 : 0);
          audit(actor, 'marketplace_settings_update', { fields: Object.keys(body) });
        });
        json(res, 200, { settings: settings() });
        return true;
      }
      const requestPath = pathname.match(/^\/api\/admin\/marketplace\/requests\/([^/]+)$/);
      if (requestPath) {
        method(req, ['PATCH']);
        const id = pathId(requestPath[1], true);
        if (!getRequest(id)) fail('Cererea nu a fost găsită.', 404);
        const body = objectBody(await readBody(req), ['status', 'response']);
        const status = choice(body.status, ['pending', 'approved', 'declined'], 'Starea cererii');
        const response = textField(body.response ?? '', 'Răspunsul', 2000);
        transaction(db, () => {
          const current = getRequest(id);
          if (status === 'pending' && db.prepare("SELECT id FROM marketplace_requests WHERE product_id=? AND user_id=? AND status='pending' AND id!=?").get(current.product_id, current.user_id, id)) fail('Există deja o cerere deschisă pentru acest produs.', 409);
          db.prepare('UPDATE marketplace_requests SET status=?,response=?,updated_at=? WHERE id=?').run(status, response, timestamp(), id);
          audit(actor, 'marketplace_request_review', { request_id: id, status });
        });
        // Approval records the response only. Provisioning is an explicit, separate action.
        json(res, 200, { request: getRequest(id, true) });
        return true;
      }
      if (pathname === `${ADMIN_ROOT}/entitlements`) {
        method(req, ['POST']);
        const body = objectBody(await readBody(req), ['product_id', 'user_id', 'expires_at', 'note']);
        const productId = textField(body.product_id, 'Produsul', 100, 1);
        const userId = numericId(body.user_id);
        const product = getProduct(productId);
        if (!product || product.status !== 'available') fail('Accesul poate fi acordat numai pentru un produs disponibil.', 409);
        const target = db.prepare('SELECT id FROM users WHERE id=? AND banned=0 AND deleted_at IS NULL').get(userId);
        if (!target) fail('Utilizatorul activ nu a fost găsit.', 404);
        const note = textField(body.note ?? '', 'Nota internă', 2000);
        let expires = null;
        if (body.expires_at !== undefined && body.expires_at !== null && body.expires_at !== '') {
          const raw = textField(body.expires_at, 'Expirarea', 64, 1);
          if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(raw) || !Number.isFinite(Date.parse(raw)) || Date.parse(raw) <= Date.now()) fail('Expirarea trebuie să fie o dată viitoare cu fus orar.');
          expires = new Date(raw).toISOString();
        }
        let id;
        transaction(db, () => {
          const at = timestamp();
          db.prepare(`INSERT INTO marketplace_entitlements (product_id,user_id,status,expires_at,note,created_at,updated_at) VALUES (?,?,'active',?,?,?,?) ON CONFLICT(product_id,user_id) DO UPDATE SET status='active',expires_at=excluded.expires_at,note=excluded.note,updated_at=excluded.updated_at`).run(productId, userId, expires, note, at, at);
          id = db.prepare('SELECT id FROM marketplace_entitlements WHERE product_id=? AND user_id=?').get(productId, userId).id;
          audit(actor, 'marketplace_access_grant', { entitlement_id: id, product_id: productId, user_id: userId, expires_at: expires });
        });
        json(res, 200, { entitlement: getEntitlement(id, true) });
        return true;
      }
      const entitlementPath = pathname.match(/^\/api\/admin\/marketplace\/entitlements\/([^/]+)$/);
      if (entitlementPath) {
        method(req, ['PATCH']);
        const id = pathId(entitlementPath[1], true);
        if (!getEntitlement(id)) fail('Accesul nu a fost găsit.', 404);
        const body = objectBody(await readBody(req), ['status']);
        if (body.status !== 'revoked') fail('Această acțiune acceptă numai revocarea accesului.');
        transaction(db, () => {
          const current = getEntitlement(id);
          if (current.status !== 'revoked') {
            db.prepare("UPDATE marketplace_entitlements SET status='revoked',updated_at=? WHERE id=?").run(timestamp(), id);
            audit(actor, 'marketplace_access_revoke', { entitlement_id: id, product_id: current.product_id, user_id: current.user_id });
          }
        });
        json(res, 200, { entitlement: getEntitlement(id, true) });
        return true;
      }
      fail('Ruta marketplace nu a fost găsită.', 404);
    } catch (error) {
      if (!error.status) throw error;
      json(res, error.status, { error: error.message });
      return true;
    }
  };
}
