
const encoder = new TextEncoder();

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}

function html(body, status = 200, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      ...extraHeaders,
    },
  });
}

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function getCookie(request, name) {
  const raw = request.headers.get("cookie") || "";
  const parts = raw.split(";").map(v => v.trim());
  for (const part of parts) {
    const i = part.indexOf("=");
    if (i > -1 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return null;
}

async function expectedSessionToken(env) {
  return hmacHex(env.SITE_PASSWORD, "travel-plan-gansu-auth-v1");
}

async function isAuthenticated(request, env) {
  if (!env.SITE_PASSWORD) return false;
  const token = getCookie(request, "travel_auth");
  if (!token) return false;
  const expected = await expectedSessionToken(env);
  return token === expected;
}

function loginPage(error = "") {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>甘南旅行计划 · 登录</title>
<style>
*{box-sizing:border-box}
body{
  margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
  padding:24px;background:#f6f4ef;color:#1f2a24;
  font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Helvetica Neue",Arial,sans-serif
}
.card{
  width:min(420px,100%);background:#fff;border-radius:24px;padding:28px 22px;
  box-shadow:0 12px 40px rgba(0,0,0,.08)
}
.eyebrow{font-size:13px;color:#6e7d74;letter-spacing:.08em}
h1{margin:8px 0 8px;font-size:28px}
p{margin:0 0 22px;color:#718078;line-height:1.6}
input{
  width:100%;font-size:17px;padding:14px 15px;border:1px solid #dbe2dd;
  border-radius:14px;outline:none;background:#fafbf9
}
input:focus{border-color:#52775f;background:#fff}
button{
  width:100%;margin-top:12px;padding:14px;border:0;border-radius:14px;
  background:#2f6b4f;color:#fff;font-size:16px;font-weight:700
}
.err{margin:0 0 12px;color:#b24b3d;background:#fff0ed;padding:10px 12px;border-radius:12px;font-size:13px}
.note{font-size:12px;color:#8a958f;margin-top:14px;text-align:center}
</style>
</head>
<body>
  <main class="card">
    <div class="eyebrow">2026 · 甘南旅行</div>
    <h1>输入旅行密码</h1>
    <p>仅王和欧共享使用。验证后，这台设备会保持登录状态。</p>
    ${error ? `<div class="err">${error}</div>` : ""}
    <form id="loginForm">
      <input id="password" type="password" autocomplete="current-password" placeholder="旅行密码" required autofocus>
      <button type="submit">进入旅行计划</button>
    </form>
    <div class="note">密码不会写在网页源码里。</div>
  </main>
<script>
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = document.getElementById('password').value;
  const btn = e.currentTarget.querySelector('button');
  btn.disabled = true; btn.textContent = '验证中…';
  try {
    const r = await fetch('/api/login', {
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({password})
    });
    if (r.ok) location.href = '/';
    else {
      const d = await r.json().catch(()=>({}));
      alert(d.error || '密码不正确');
      btn.disabled = false; btn.textContent = '进入旅行计划';
    }
  } catch {
    alert('网络异常，请重试');
    btn.disabled = false; btn.textContent = '进入旅行计划';
  }
});
</script>
</body>
</html>`;
}

async function initDB(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payer TEXT NOT NULL CHECK (payer IN ('王','欧')),
      amount REAL NOT NULL,
      category TEXT NOT NULL,
      date TEXT,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS toilet_tips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      place TEXT NOT NULL,
      rating TEXT NOT NULL DEFAULT 'normal',
      note TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT '备注',
      body TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 登录接口：唯一不需要登录的 API
    if (path === "/api/login" && request.method === "POST") {
      if (!env.SITE_PASSWORD) {
        return json({ error: "尚未配置 SITE_PASSWORD" }, 503);
      }
      let body = {};
      try { body = await request.json(); } catch {}
      if (body.password !== env.SITE_PASSWORD) {
        return json({ error: "密码不正确" }, 401);
      }
      const token = await expectedSessionToken(env);
      return json(
        { ok: true },
        200,
        {
          "set-cookie": `travel_auth=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`
        }
      );
    }

    if (path === "/api/logout" && request.method === "POST") {
      return json(
        { ok: true },
        200,
        {
          "set-cookie": "travel_auth=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
        }
      );
    }

    const authed = await isAuthenticated(request, env);

    // 未登录：API 返回 401，网页显示登录页
    if (!authed) {
      if (path.startsWith("/api/")) {
        return json({ error: "UNAUTHORIZED" }, 401);
      }
      return html(loginPage());
    }

    // 已登录后的 API
    if (path.startsWith("/api/")) {
      if (!env.DB) {
        return json({ error: "D1 还没有绑定，请绑定变量名 DB。" }, 503);
      }

      try {
        if (path === "/api/init" && request.method === "POST") {
          await initDB(env.DB);
          return json({ ok: true });
        }

        await initDB(env.DB);

        if (path === "/api/expenses" && request.method === "GET") {
          const { results } = await env.DB.prepare(
            "SELECT id,payer,amount,category,date,note,created_at,updated_at FROM expenses ORDER BY id DESC"
          ).all();
          return json({ items: results });
        }

        if (path === "/api/expenses" && request.method === "POST") {
          const b = await request.json();
          if (!["王", "欧"].includes(b.payer)) return json({ error: "付款人无效" }, 400);
          const amount = Number(b.amount);
          if (!Number.isFinite(amount) || amount <= 0) return json({ error: "金额无效" }, 400);

          await env.DB.prepare(
            `INSERT INTO expenses
             (payer,amount,category,date,note,created_at,updated_at)
             VALUES (?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`
          ).bind(
            b.payer,
            amount,
            b.category || "其他",
            b.date || "",
            b.note || ""
          ).run();
          return json({ ok: true }, 201);
        }

        if (path === "/api/toilets" && request.method === "GET") {
          const { results } = await env.DB.prepare(
            "SELECT id,place,rating,note,created_at,updated_at FROM toilet_tips ORDER BY id DESC"
          ).all();
          return json({ items: results });
        }

        if (path === "/api/toilets" && request.method === "POST") {
          const b = await request.json();
          await env.DB.prepare(
            `INSERT INTO toilet_tips
             (place,rating,note,created_at,updated_at)
             VALUES (?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`
          ).bind(
            b.place || "未命名地点",
            b.rating || "normal",
            b.note || ""
          ).run();
          return json({ ok: true }, 201);
        }

        if (path === "/api/notes" && request.method === "GET") {
          const { results } = await env.DB.prepare(
            "SELECT id,title,type,body,created_at,updated_at FROM notes ORDER BY updated_at DESC, id DESC"
          ).all();
          return json({ items: results });
        }

        if (path === "/api/notes" && request.method === "POST") {
          const b = await request.json();
          await env.DB.prepare(
            `INSERT INTO notes
             (title,type,body,created_at,updated_at)
             VALUES (?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`
          ).bind(
            b.title || "未命名",
            b.type || "备注",
            b.body || ""
          ).run();
          return json({ ok: true }, 201);
        }

        const m = path.match(/^\/api\/(expenses|toilets|notes)\/(\d+)$/);
        if (m && request.method === "DELETE") {
          const table = {
            expenses: "expenses",
            toilets: "toilet_tips",
            notes: "notes"
          }[m[1]];
          await env.DB.prepare(`DELETE FROM ${table} WHERE id = ?`)
            .bind(Number(m[2]))
            .run();
          return json({ ok: true });
        }

        return json({ error: "API 路径不存在" }, 404);
      } catch (err) {
        return json({ error: err?.message || String(err) }, 500);
      }
    }

    // 已登录：正常加载旅行网页
    return env.ASSETS.fetch(request);
  },
};
