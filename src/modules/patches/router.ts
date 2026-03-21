import { Elysia, t } from "elysia";
import { getAllPatches, getPatchBySlug } from "./service";
import { render } from "../../lib/render";

export const patchesRouter = new Elysia({ prefix: "/patches" })

    .get(
        "/",
        async ({ query, set }) => {
            const patches = await getAllPatches(query.update);
            set.headers["content-type"] = "text/html; charset=utf-8";
            return await render("pages/patches.ejs", { patches });
        },
        { query: t.Object({ update: t.Optional(t.String()) }) }
    )

    .get(
        "/:slug",
        async ({ params: { slug }, set }) => {
            const patch = await getPatchBySlug(slug);
            if (!patch) {
                set.status = 404;
                return render("pages/404.ejs", { message: `Patch "${slug}" not found` });
            }
            set.headers["content-type"] = "text/html; charset=utf-8";
            return await render("pages/patch.ejs", { patch });
        },
        { params: t.Object({ slug: t.String() }) }
    );
