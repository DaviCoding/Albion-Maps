import { Elysia, t } from "elysia";
import { searchChanges } from "./service";
import { render } from "../../lib/render";

const EMPTY_META = {
  query: "",
  terms: [],
  total: 0,
  page: 1,
  totalPages: 0,
  perPage: 20,
  filters: { kind: "all" as const, dateFrom: undefined, dateTo: undefined, gameUpdate: undefined },
  counts: { changes: 0, sections: 0 },
};

export const searchRouter = new Elysia({ prefix: "/search" })

  .get(
    "/",
    async ({ query, set }) => {
      const q = (query.q ?? "").trim();
      const page = Math.max(1, parseInt(String(query.page ?? "1"), 10) || 1);
      const kind = (["all", "change", "section"] as const).find((k) => k === query.kind) ?? "all";
      const dateFrom = query.dateFrom || undefined;
      const dateTo = query.dateTo || undefined;
      const gameUpdate = query.gameUpdate || undefined;

      const hasInput = q || kind !== 'all' || dateFrom || dateTo || gameUpdate;

      const { results, meta } = hasInput
        ? await searchChanges(q, page, {
          kind,
          ...(dateFrom ? { dateFrom } : {}),
          ...(dateTo ? { dateTo } : {}),
          ...(gameUpdate ? { gameUpdate } : {}),
        })
        : { results: [], meta: EMPTY_META };

      set.headers["content-type"] = "text/html; charset=utf-8";
      return await render("pages/search.ejs", { results, meta, q });
    },
    {
      query: t.Object({
        q: t.Optional(t.String()),
        page: t.Optional(t.String()),
        kind: t.Optional(t.String()),
        dateFrom: t.Optional(t.String()),
        dateTo: t.Optional(t.String()),
        gameUpdate: t.Optional(t.String()),
      }),
    }
  );