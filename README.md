# Travel-Plan-Gansu — Cloudflare 共享版

这个版本包含：
- `public/index.html`：旅行网页
- `src/index.js`：Cloudflare Worker API
- `wrangler.jsonc`：Worker + 静态资源配置
- `schema.sql`：Cloudflare D1 建表 SQL

## 接下来要做的事（不用命令行）

1. 把本项目中的文件上传到 GitHub 仓库 `iiiisoftnhard/Travel-Plan-Gansu`
2. 删除仓库根目录旧的 `index.html`（新版在 `public/index.html`）
3. Cloudflare 会自动重新部署
4. 部署后到 Worker → Settings → Bindings
5. 添加 D1 Database binding：
   - Variable name: `DB`
   - Database: 你创建的 `travel-plan-gansu-db`
6. 打开 D1 数据库 → Console
7. 把 `schema.sql` 的全部内容粘贴进去并执行
8. 回到旅行网址刷新，即可多人共享花费、厕所攻略和备注

注意：目前共享网址知道的人都可以添加/删除记录。之后可以再加旅行密码。
