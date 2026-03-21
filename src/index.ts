import "dotenv/config";
import { Elysia } from "elysia";
import { updateRouter }  from "./modules/updates/router";
import { patchesRouter } from "./modules/patches/router";
import { searchRouter }  from "./modules/search/router";
import { adminRouter }   from "./modules/admin/router";
import { render }        from "./lib/render";

const app = new Elysia()
  .use(updateRouter)
  .use(patchesRouter)
  .use(searchRouter)
  .use(adminRouter)

  // ── 404 ───────────────────────────────────────────────────────────────────
  .get("/*", async ({ set }) => {
    set.status = 404;
    return new Response(
      await render("pages/error.ejs", { statusCode: 404 }),
      { status: 404, headers: { "content-type": "text/html; charset=utf-8" } }
    );
  })

  // ── Error handler ─────────────────────────────────────────────────────────
  .onError(async ({ code, error, set }) => {
    const statusCode = code === "NOT_FOUND" ? 404 : 500;
    set.status = statusCode;

    const errorMessage =
      statusCode === 500 && process.env.NODE_ENV === "development"
        ? (error as Error).message
        : undefined;

    return new Response(
      await render("pages/error.ejs", { statusCode, errorMessage }),
      { status: statusCode, headers: { "content-type": "text/html; charset=utf-8" } }
    );
  })

  .listen(process.env.APP_PORT!);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);