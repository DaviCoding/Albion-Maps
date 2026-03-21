import { Elysia } from "elysia";
import { updateRouter } from "./modules/updates/router";
import { patchesRouter } from "./modules/patches/router";
import { searchRouter } from "./modules/search/router";
import { adminRouter } from "./modules/admin/router";

const app = new Elysia()
  .use(updateRouter)
  .use(patchesRouter)
  .use(searchRouter)
  .use(adminRouter)
  .listen(process.env.APP_PORT!);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);