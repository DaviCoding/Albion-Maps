import { Elysia, t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { render } from "../../lib/render";
import { seedPatchNoteFromJson } from "./service";
import argon2 from "argon2";
import fs from "fs";
import path from "path";
import { createWriteStream } from "fs";
import archiver from "archiver";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL!;
const COOKIE_NAME = "alb_adm";
const COOKIE_TTL_S = 5 * 60;
const PATCHES_DIR = path.resolve(process.cwd(), "prisma/seed/patches");

async function getVerifiedEmail(
  jwtInstance: { verify: (token: string) => Promise<false | Record<string, unknown>> },
  token: string | undefined
): Promise<string | null> {
  if (!token) return null;
  try {
    const payload = await jwtInstance.verify(token);
    if (!payload || typeof payload.email !== "string") return null;
    return payload.email;
  } catch {
    return null;
  }
}

// ── Salva o JSON do patch em prisma/seed/patches/<slug>.json ─────────────────
function savePatchFile(patch: Record<string, unknown>): void {
  if (!fs.existsSync(PATCHES_DIR)) fs.mkdirSync(PATCHES_DIR, { recursive: true });
  const slug = patch.slug as string;
  const filePath = path.join(PATCHES_DIR, `${slug}.json`);
  fs.writeFileSync(filePath, JSON.stringify(patch, null, 2), "utf-8");
}

// ── Lê todos os JSONs da pasta patches ───────────────────────────────────────
function readAllPatches(): unknown[] {
  if (!fs.existsSync(PATCHES_DIR)) return [];
  return fs.readdirSync(PATCHES_DIR)
    .filter((f) => f.endsWith(".json") && f !== "allPatches.json")
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(PATCHES_DIR, f), "utf-8")));
}

export const adminRouter = new Elysia({ prefix: "/admin" })
  .use(jwt({ name: "jwt", secret: process.env.JWT_SECRET!, exp: "5m" }))

  // ── Login GET ──────────────────────────────────────────────────────────────
  .get("/", async ({ jwt: j, cookie, redirect }) => {
    const token = cookie[COOKIE_NAME]?.value as string | undefined;
    const email = await getVerifiedEmail(j, token);
    if (email === ADMIN_EMAIL) return redirect("/admin/insert");
    return new Response(await render("pages/admin/login.ejs", { error: null }), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  })

  // ── Login POST ─────────────────────────────────────────────────────────────
  .post(
    "/login",
    async ({ jwt: j, body, cookie, redirect }) => {
      const { email, password } = body;
      const emailOk = email === ADMIN_EMAIL;
      let passwordOk = false;
      if (emailOk) {
        try {
          const hash = Buffer.from(process.env.ADMIN_PASSWORD_HASH_B64!, "base64").toString("utf-8");
          passwordOk = await argon2.verify(hash, password);
        } catch {
          passwordOk = false;
        }
      }
      if (emailOk && passwordOk) {
        const token = await j.sign({ email });
        cookie[COOKIE_NAME]!.set({
          value: token, httpOnly: true, sameSite: "strict",
          maxAge: COOKIE_TTL_S, path: "/admin",
        });
        return redirect("/admin/insert");
      }
      return new Response(
        await render("pages/admin/login.ejs", { error: "Invalid email or password." }),
        { headers: { "content-type": "text/html; charset=utf-8" } }
      );
    },
    { body: t.Object({ email: t.String(), password: t.String() }) }
  )

  // ── Logout ─────────────────────────────────────────────────────────────────
  .get("/logout", ({ cookie, redirect }) => {
    cookie[COOKIE_NAME]!.set({ value: "", maxAge: 0, path: "/admin", httpOnly: true });
    return redirect("/admin");
  })

  // ── Insert GET ─────────────────────────────────────────────────────────────
  .get("/insert", async ({ jwt: j, cookie, redirect }) => {
    const token = cookie[COOKIE_NAME]?.value as string | undefined;
    const email = await getVerifiedEmail(j, token);
    if (email !== ADMIN_EMAIL) return redirect("/admin");
    return new Response(await render("pages/admin/insert.ejs", { result: null }), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  })

  // ── Insert POST ────────────────────────────────────────────────────────────
  .post(
    "/insert",
    async ({ jwt: j, body, cookie, redirect }) => {
      const token = cookie[COOKIE_NAME]?.value as string | undefined;
      const email = await getVerifiedEmail(j, token);
      if (email !== ADMIN_EMAIL) return redirect("/admin");

      let result: { ok: boolean; message: string; slugs: string[] };

      try {
        const parsed = JSON.parse(body.json);
        const patches = Array.isArray(parsed) ? parsed : [parsed];
        const slugs: string[] = [];

        for (const patch of patches) {
          await seedPatchNoteFromJson(patch);
          savePatchFile(patch);           // ← salva <slug>.json na pasta patches
          slugs.push(patch.slug as string);
        }

        result = {
          ok: true,
          message: `${slugs.length} patch${slugs.length !== 1 ? "es" : ""} inserted successfully.`,
          slugs,
        };
      } catch (err: unknown) {
        result = {
          ok: false,
          message: err instanceof Error ? err.message : String(err),
          slugs: [],
        };
      }

      return new Response(await render("pages/admin/insert.ejs", { result }), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    },
    { body: t.Object({ json: t.String() }) }
  )

  // ── Download — JSON único com todos os patches ─────────────────────────────
  .get("/download/json", async ({ jwt: j, cookie, redirect }) => {
    const token = cookie[COOKIE_NAME]?.value as string | undefined;
    const email = await getVerifiedEmail(j, token);
    if (email !== ADMIN_EMAIL) return redirect("/admin");

    const patches = readAllPatches();
    const json = JSON.stringify(patches, null, 2);

    return new Response(json, {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": 'attachment; filename="allPatches.json"',
      },
    });
  })

  // ── Download — ZIP com todos os .json individuais ─────────────────────────
  .get("/download/zip", async ({ jwt: j, cookie, redirect }) => {
    const token = cookie[COOKIE_NAME]?.value as string | undefined;
    const email = await getVerifiedEmail(j, token);
    if (email !== ADMIN_EMAIL) return redirect("/admin");

    if (!fs.existsSync(PATCHES_DIR)) {
      return new Response("No patches found", { status: 404 });
    }

    // Cria o zip em memória
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      const archive = archiver("zip", { zlib: { level: 6 } });
      archive.on("data", (chunk: Buffer) => chunks.push(chunk));
      archive.on("end", resolve);
      archive.on("error", reject);
      archive.directory(PATCHES_DIR, "patches");
      archive.finalize();
    });

    const buffer = Buffer.concat(chunks);

    return new Response(buffer, {
      headers: {
        "content-type": "application/zip",
        "content-disposition": 'attachment; filename="patches.zip"',
        "content-length": String(buffer.length),
      },
    });
  });