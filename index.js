function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

async function body(request) {
  try { return await request.json(); }
  catch { return {}; }
}

function dbMissing(env) {
  return !env.DB;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (path.startsWith("/api/")) {
      if (dbMissing(env)) {
        return json({ error: "D1 数据库尚未绑定。请在 Cloudflare Worker 的 Settings → Bindings 中添加 D1，变量名填 DB。" }, 503);
      }

      try {
        // Expenses
        if (path === "/api/expenses" && method === "GET") {
          const { results } = await env.DB.prepare(
            "SELECT id, payer, amount, category, date, note, created_at FROM expenses ORDER BY id DESC"
          ).all();
          return json(results || []);
        }
        if (path === "/api/expenses" && method === "POST") {
          const x = await body(request);
          if (!["王", "欧"].includes(x.payer) || !(Number(x.amount) > 0)) {
            return json({ error: "付款人或金额不正确" }, 400);
          }
          const r = await env.DB.prepare(
            "INSERT INTO expenses (payer, amount, category, date, note) VALUES (?, ?, ?, ?, ?)"
          ).bind(x.payer, Number(x.amount), x.category || "其他", x.date || "", x.note || "").run();
          return json({ ok: true, id: r.meta.last_row_id }, 201);
        }
        if (/^\/api\/expenses\/\d+$/.test(path) && method === "DELETE") {
          const id = Number(path.split("/").pop());
          await env.DB.prepare("DELETE FROM expenses WHERE id = ?").bind(id).run();
          return json({ ok: true });
        }

        // Toilet tips
        if (path === "/api/toilets" && method === "GET") {
          const { results } = await env.DB.prepare(
            "SELECT id, place, rating, note, created_at FROM toilet_tips ORDER BY id DESC"
          ).all();
          return json(results || []);
        }
        if (path === "/api/toilets" && method === "POST") {
          const x = await body(request);
          if (!x.place && !x.note) return json({ error: "至少填写地点或攻略内容" }, 400);
          const rating = ["good", "normal", "danger"].includes(x.rating) ? x.rating : "normal";
          const r = await env.DB.prepare(
            "INSERT INTO toilet_tips (place, rating, note) VALUES (?, ?, ?)"
          ).bind(x.place || "未命名地点", rating, x.note || "").run();
          return json({ ok: true, id: r.meta.last_row_id }, 201);
        }
        if (/^\/api\/toilets\/\d+$/.test(path) && method === "DELETE") {
          const id = Number(path.split("/").pop());
          await env.DB.prepare("DELETE FROM toilet_tips WHERE id = ?").bind(id).run();
          return json({ ok: true });
        }

        // Notes
        if (path === "/api/notes" && method === "GET") {
          const { results } = await env.DB.prepare(
            "SELECT id, title, type, body, created_at, updated_at FROM notes ORDER BY id DESC"
          ).all();
          return json(results || []);
        }
        if (path === "/api/notes" && method === "POST") {
          const x = await body(request);
          if (!x.title && !x.body) return json({ error: "至少填写标题或内容" }, 400);
          const r = await env.DB.prepare(
            "INSERT INTO notes (title, type, body) VALUES (?, ?, ?)"
          ).bind(x.title || "未命名", x.type || "备注", x.body || "").run();
          return json({ ok: true, id: r.meta.last_row_id }, 201);
        }
        if (/^\/api\/notes\/\d+$/.test(path) && method === "DELETE") {
          const id = Number(path.split("/").pop());
          await env.DB.prepare("DELETE FROM notes WHERE id = ?").bind(id).run();
          return json({ ok: true });
        }

        return json({ error: "API 不存在" }, 404);
      } catch (e) {
        return json({ error: e?.message || "数据库请求失败" }, 500);
      }
    }

    return env.ASSETS.fetch(request);
  }
};
