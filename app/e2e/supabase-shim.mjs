/**
 * A stand-in for Supabase's HTTP layer, so the real app can be driven in a real
 * browser against a real Postgres.
 *
 * Everything that decides whether this system is correct — the SQL, the row
 * level security, the triggers, the React — stays real. Only the transport is
 * replaced, because a hosted Supabase needs Docker to run locally and this
 * sandbox has no Docker daemon and no route to the internet.
 *
 * It implements the slice of PostgREST and GoTrue that the app actually calls,
 * and nothing else. Each request runs as `authenticated` with the caller's
 * claims set exactly the way PostgREST sets them, so the policies are enforced
 * here as they are in production — a request that would be refused in the real
 * system is refused here too.
 *
 *     node e2e/supabase-shim.mjs <port> <postgres-url>
 */
import { createServer } from 'node:http';
import { createHmac, randomUUID } from 'node:crypto';
import pg from 'pg';

const PORT = Number(process.argv[2] ?? 54321);
const DB_URL = process.argv[3] ?? 'postgres://postgres@/hapak?host=/tmp/pgsock&port=55432';
const JWT_SECRET = 'e2e-shim-secret';

// `pg` helpfully parses dates into JavaScript Date objects and numerics into
// strings. PostgREST does neither: it sends what JSON can carry — dates as
// strings, numerics as numbers. Without matching that, the app receives shapes
// it never sees in production and fails on things that are not wrong.
pg.types.setTypeParser(1082, (v) => v); // date
pg.types.setTypeParser(1114, (v) => v); // timestamp
pg.types.setTypeParser(1184, (v) => v); // timestamptz
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v))); // numeric
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v))); // bigint

const pool = new pg.Pool({ connectionString: DB_URL, max: 8 });

// ── tokens ─────────────────────────────────────────────────────────────────

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

function sign(payload) {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64(payload);
  const sig = createHmac('sha256', JWT_SECRET).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

function decode(token) {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  } catch {
    return null;
  }
}

/** The service key bypasses row level security, exactly as it does in Supabase. */
const SERVICE_KEY = 'e2e-service-role-key';
const ANON_KEY = 'e2e-anon-key';

// ── PostgREST's filter grammar, as far as the app uses it ──────────────────

const OPS = {
  eq: '=',
  neq: '<>',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  like: 'like',
  ilike: 'ilike',
};

/** Turns `?status=eq.active&date=gte.2026-01-01` into SQL and values. */
function whereFrom(params, values) {
  const parts = [];
  for (const [key, raw] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(key)) continue;
    const [op, ...rest] = raw.split('.');
    const arg = rest.join('.');
    const col = `"${key.replace(/"/g, '')}"`;

    if (op === 'is') {
      parts.push(`${col} is ${arg === 'null' ? 'null' : arg}`);
    } else if (op === 'in') {
      const list = arg.replace(/^\(|\)$/g, '').split(',').filter(Boolean);
      if (!list.length) parts.push('false');
      else parts.push(`${col} in (${list.map((v) => `$${values.push(v)}`).join(',')})`);
    } else if (op === 'not') {
      // not.in.(a,b) / not.is.null
      const [innerOp, ...innerRest] = rest;
      const innerArg = innerRest.join('.');
      if (innerOp === 'in') {
        const list = innerArg.replace(/^\(|\)$/g, '').split(',').filter(Boolean);
        parts.push(`${col} not in (${list.map((v) => `$${values.push(v)}`).join(',')})`);
      } else if (innerOp === 'is') {
        parts.push(`${col} is not ${innerArg}`);
      }
    } else if (OPS[op]) {
      parts.push(`${col} ${OPS[op]} $${values.push(arg)}`);
    }
  }
  return parts.length ? `where ${parts.join(' and ')}` : '';
}

function orderFrom(params) {
  const order = params.get('order');
  if (!order) return '';
  const clauses = order.split(',').map((o) => {
    const [col, ...mods] = o.split('.');
    const dir = mods.includes('desc') ? 'desc' : 'asc';
    const nulls = mods.includes('nullslast') ? ' nulls last' : '';
    return `"${col.replace(/"/g, '')}" ${dir}${nulls}`;
  });
  return `order by ${clauses.join(', ')}`;
}

// ── running a statement as the caller ──────────────────────────────────────

async function asCaller(req, fn) {
  const auth = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  const apikey = req.headers.apikey ?? '';
  const service = auth === SERVICE_KEY || apikey === SERVICE_KEY;
  const claims = service ? null : decode(auth);

  const client = await pool.connect();
  try {
    await client.query('begin');
    if (service) {
      // Supabase's service role bypasses RLS
      await client.query(`set local role postgres`);
    } else {
      await client.query(`set local role authenticated`);
      if (claims?.sub) {
        await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [claims.sub]);
        await client.query(`select set_config('request.jwt.claims', $1, true)`, [
          JSON.stringify(claims),
        ]);
      } else {
        await client.query(`set local role anon`);
      }
    }
    const out = await fn(client);
    await client.query('commit');
    return out;
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// ── the endpoints ──────────────────────────────────────────────────────────

const json = (res, code, body, extra = {}) => {
  res.writeHead(code, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-expose-headers': 'content-range',
    ...extra,
  });
  res.end(body === undefined ? '' : JSON.stringify(body));
};

/** Does `fn` return `setof`? PostgREST's response shape depends on it. */
const retset = new Map();
async function returnsSet(fn) {
  if (!retset.has(fn)) {
    const { rows } = await pool.query(
      `select bool_or(p.proretset) as s
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = $1`,
      [fn],
    );
    retset.set(fn, rows[0]?.s === true);
  }
  return retset.get(fn);
}

/**
 * The declared type of each named argument.
 *
 * PostgREST reads the request body as JSON and hands a `jsonb` argument the
 * JSON itself. `pg` does not: given a JavaScript array it writes a Postgres
 * *array* literal, so a draft object arrived at `create_trainings` as
 * `{[object Object]}` and the training was never created.
 */
const argTypes = new Map();
async function typesOf(fn) {
  if (!argTypes.has(fn)) {
    const { rows } = await pool.query(
      `select p.proargnames[i + 1] as name, t.typname as type
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        cross join lateral generate_series(0, coalesce(array_length(p.proargnames, 1), 0) - 1) i
         join pg_type t on t.oid = p.proargtypes[i]
        where n.nspname = 'public' and p.proname = $1`,
      [fn],
    );
    argTypes.set(fn, Object.fromEntries(rows.map((r) => [r.name, r.type])));
  }
  return argTypes.get(fn);
}

const fail = (res, e, req) => {
  // the log is the only place a refused statement is visible, and telling a
  // policy doing its job from a shim gap is the whole point of the exercise
  console.error(`✗ ${req?.method ?? '?'} ${req?.url ?? '?'} → ${e.message}`);
  return json(res, 400, {
    message: e.message,
    code: e.code ?? 'P0001',
    details: null,
    hint: null,
  });
};

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return null;
  try {
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  // The preflight has to name the methods and headers it permits. Without the
  // method list the browser refuses any PATCH before it is sent — which reads
  // in the app as "Failed to fetch" and looks exactly like a broken save. Real
  // Supabase answers this properly; the shim has to as well.
  if (req.method === 'OPTIONS')
    return json(res, 204, undefined, {
      'access-control-allow-methods': 'GET, HEAD, POST, PATCH, PUT, DELETE, OPTIONS',
      // echo what was asked for: a fixed list drops a header the client adds
      // later, and `*` does not cover Authorization
      'access-control-allow-headers': req.headers['access-control-request-headers'] ?? '*',
      'access-control-max-age': '86400',
    });

  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;
  const prefer = req.headers.prefer ?? '';
  // `.single()` and `.maybeSingle()` ask PostgREST for one object rather than
  // an array, through the Accept header — a client that gets an array back
  // reads `data.period_start` as undefined and the screen crashes downstream
  const wantsObject = (req.headers.accept ?? '').includes('vnd.pgrst.object');
  const shape = (rows) => (wantsObject ? (rows[0] ?? null) : rows);

  try {
    // ── GoTrue ──
    if (path === '/auth/v1/token') {
      const body = await readBody(req);
      const { rows } = await pool.query(
        `select id, raw_app_meta_data from auth.users where email = $1`,
        [body?.email ?? ''],
      );
      if (!rows.length) return json(res, 400, { error: 'invalid_grant', message: 'bad login' });
      const user = {
        id: rows[0].id,
        email: body.email,
        app_metadata: rows[0].raw_app_meta_data ?? {},
        user_metadata: {},
        aud: 'authenticated',
        role: 'authenticated',
      };
      const token = sign({
        sub: user.id,
        role: 'authenticated',
        app_metadata: user.app_metadata,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      return json(res, 200, {
        access_token: token,
        refresh_token: `r-${randomUUID()}`,
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user,
      });
    }

    if (path === '/auth/v1/user' && req.method === 'GET') {
      const claims = decode((req.headers.authorization ?? '').replace(/^Bearer\s+/i, ''));
      if (!claims) return json(res, 401, { message: 'bad token' });
      return json(res, 200, {
        id: claims.sub,
        app_metadata: claims.app_metadata ?? {},
        user_metadata: {},
        aud: 'authenticated',
        role: 'authenticated',
      });
    }

    if (path === '/auth/v1/admin/users' && req.method === 'POST') {
      const body = await readBody(req);
      const id = randomUUID();
      await pool.query(
        `insert into auth.users (id, email, raw_app_meta_data) values ($1, $2, $3)`,
        [id, body.email, body.app_metadata ?? {}],
      );
      return json(res, 200, { user: { id, email: body.email, app_metadata: body.app_metadata } });
    }

    if (path.startsWith('/auth/v1/admin/users/') && req.method === 'PUT') {
      return json(res, 200, { user: { id: path.split('/').pop() } });
    }

    if (path === '/auth/v1/logout') return json(res, 204);

    // ── PostgREST: rpc ──
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.slice('/rest/v1/rpc/'.length);
      const body = (await readBody(req)) ?? {};
      const names = Object.keys(body);
      const args = names.map((n, i) => `${n} => $${i + 1}`).join(', ');
      const types = await typesOf(fn);
      const values = names.map((n) => {
        const v = body[n];
        const isJson = types[n] === 'json' || types[n] === 'jsonb';
        return isJson && v !== null && typeof v === 'object' ? JSON.stringify(v) : v;
      });
      const out = await asCaller(req, (c) => c.query(`select * from ${fn}(${args})`, values));
      const rows = out.rows;
      // PostgREST decides array-or-scalar from the function's signature, not
      // from how many rows came back: `setof uuid` is always a JSON array, even
      // with one row, and a plain `uuid` is always a bare string. Guessing from
      // the row count turned `create_trainings` into a single string, and the
      // caller's `data[0]` then read one character of a uuid.
      const scalar = rows.length > 0 && Object.keys(rows[0]).length === 1;
      const value = (r) => Object.values(r)[0];
      if (await returnsSet(fn)) {
        return json(res, 200, scalar ? rows.map(value) : rows);
      }
      return json(res, 200, scalar ? value(rows[0]) : (rows[0] ?? null));
    }

    // ── PostgREST: tables ──
    if (path.startsWith('/rest/v1/')) {
      const table = path.slice('/rest/v1/'.length);
      const params = [...url.searchParams.entries()];
      const values = [];
      const where = whereFrom(params, values);

      // `head: true` in supabase-js is a real HEAD request that asks only for
      // the count; everything else about it is a GET
      if (req.method === 'GET' || req.method === 'HEAD') {
        const select = url.searchParams.get('select') || '*';
        const cols = select === '*' ? '*' : select.split(',').map((c) => `"${c.trim()}"`).join(', ');
        const limit = url.searchParams.get('limit');
        const sql =
          `select ${cols} from "${table}" ${where} ${orderFrom(url.searchParams)}` +
          (limit ? ` limit ${Number(limit)}` : '');
        const out = await asCaller(req, (c) => c.query(sql, values));

        if (prefer.includes('count=exact')) {
          const n = out.rowCount;
          const range = { 'content-range': `0-${Math.max(0, n - 1)}/${n}` };
          return json(res, 200, req.method === 'HEAD' ? undefined : shape(out.rows), range);
        }
        return json(res, 200, shape(out.rows));
      }

      if (req.method === 'POST') {
        const body = await readBody(req);
        const list = Array.isArray(body) ? body : [body];
        if (!list.length) return json(res, 201, []);
        const cols = [...new Set(list.flatMap((r) => Object.keys(r)))];
        const vals = [];
        const tuples = list.map(
          (r) => `(${cols.map((c) => `$${vals.push(r[c] ?? null)}`).join(', ')})`,
        );
        const onConflict = url.searchParams.get('on_conflict');
        const upsert = prefer.includes('resolution=merge-duplicates') && onConflict;
        const sql =
          `insert into "${table}" (${cols.map((c) => `"${c}"`).join(', ')}) values ${tuples.join(', ')}` +
          (upsert
            ? ` on conflict (${onConflict.split(',').map((c) => `"${c.trim()}"`).join(', ')}) do update set ` +
              cols.filter((c) => !onConflict.split(',').map((x) => x.trim()).includes(c))
                .map((c) => `"${c}" = excluded."${c}"`)
                .join(', ')
            : '') +
          (prefer.includes('return=representation') ? ' returning *' : '');
        const out = await asCaller(req, (c) => c.query(sql, vals));
        return json(res, 201, shape(out.rows ?? []));
      }

      if (req.method === 'PATCH') {
        const body = await readBody(req);
        const cols = Object.keys(body);
        const sets = cols.map((c) => `"${c}" = $${values.push(body[c])}`);
        // the filter values were pushed first, so rebuild in the right order
        const v2 = [];
        const where2 = whereFrom(params, v2);
        const setSql = cols.map((c) => `"${c}" = $${v2.push(body[c])}`).join(', ');
        const sql = `update "${table}" set ${setSql} ${where2}` +
          (prefer.includes('return=representation') ? ' returning *' : '');
        void sets;
        const out = await asCaller(req, (c) => c.query(sql, v2));
        return json(res, 200, shape(out.rows ?? []));
      }

      if (req.method === 'DELETE') {
        const sql = `delete from "${table}" ${where}` +
          (prefer.includes('return=representation') ? ' returning *' : '');
        const out = await asCaller(req, (c) => c.query(sql, values));
        return json(res, 200, shape(out.rows ?? []));
      }
    }

    // storage is not exercised by these flows
    if (path.startsWith('/storage/v1/')) return json(res, 200, []);

    console.error(`✗ 404 ${req.method} ${path}`);
    return json(res, 404, { message: `no shim route for ${req.method} ${path}` });
  } catch (e) {
    return fail(res, e, req);
  }
});

// ── realtime ───────────────────────────────────────────────────────────────
//
// The client opens a websocket the moment it signs in and retries forever if it
// is refused, which fills the console with failures that say nothing about the
// app. This answers the Phoenix handshake and the heartbeats and nothing more:
// no change is pushed, so every screen is exercised through the same fetch it
// falls back on in production when the socket drops.
const { WebSocketServer } = await import('ws');
const wss = new WebSocketServer({ server, path: '/realtime/v1/websocket' });
wss.on('connection', (socket) => {
  socket.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg.event === 'phx_join' || msg.event === 'heartbeat') {
      socket.send(
        JSON.stringify({
          topic: msg.topic,
          event: 'phx_reply',
          payload: { status: 'ok', response: {} },
          ref: msg.ref,
        }),
      );
    }
  });
});

server.listen(PORT, () => console.log(`shim listening on ${PORT} → ${DB_URL}`));
