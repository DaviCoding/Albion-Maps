import { Elysia, t } from "elysia";
import { searchChanges } from "./service";
import { render } from "../../lib/render";

export const searchRouter = new Elysia({ prefix: "/search" })

  .get(
    "/",
    async ({ query, set }) => {
      const q    = (query.q ?? "").trim();
      const page = Math.max(1, parseInt(String(query.page ?? "1"), 10) || 1);

      const { results, meta } = q
        ? await searchChanges(q, page)
        : { results: [], meta: { query: "", terms: [], total: 0, page: 1, totalPages: 0, perPage: 20 } };

      set.headers["content-type"] = "text/html; charset=utf-8";
      return await render("pages/search.ejs", { results, meta, q });
    },
    {
      query: t.Object({
        q:    t.Optional(t.String()),
        page: t.Optional(t.String()),
      }),
    }
  );