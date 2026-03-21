import { Elysia, t } from "elysia";
import { getAllUpdates, getUpdateBySlug } from "./service";
import { render } from "../../lib/render";

export const updateRouter = new Elysia({ prefix: "/updates" })

    .get("/", async ({ set }) => {
        const updates = await getAllUpdates();
        set.headers["content-type"] = "text/html; charset=utf-8";
        return await render("pages/updates.ejs", { updates });
    })

    .get(
        "/:slug",
        async ({ params: { slug }, set }) => {
            const update = await getUpdateBySlug(slug);
            if (!update) {
                set.status = 404;
                return render("pages/404.ejs", { message: `Update "${slug}" not found` });
            };
            set.headers["content-type"] = "text/html; charset=utf-8";
            return await render("pages/patches.ejs", { update, patches: update.patches });
        },
        { params: t.Object({ slug: t.String() }) }
    );
