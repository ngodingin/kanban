import { createClient } from "@libsql/client";
import { applyGlobalMigrations } from "../src/database/migrate.ts";
import { createAuth } from "../src/auth/auth.ts";
import { isValid as isValidUlid } from "ulid";
const url = process.env.GLOBAL_DB_URL;
const token = process.env.GLOBAL_DB_TOKEN;
if (!url || !token) {
    console.log("SKIP: GLOBAL_DB_URL/GLOBAL_DB_TOKEN tidak ada");
    process.exit(0);
}
const client = createClient({ url, authToken: token });
let failed = false;
const fail = (label: string, e?: unknown): void => {
    failed = true;
    console.error(`FAIL ${label}${e ? `: ${String(e)}` : ""}`);
};
const now = new Date().toISOString();
const email = `auth-smoke-${now.replace(/[^0-9]/g, "")}@smoke.local`;
try {
    await applyGlobalMigrations(client);
    const auth = createAuth({
        globalClient: client,
        baseUrl: "http://localhost:3000",
        secret: "x".repeat(32),
    });
    const ctx = await auth.$context;
    const created = await ctx.internalAdapter.createUser({
        name: "Auth Smoke",
        email,
        emailVerified: false,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    });
    const id = created.id as string;
    if (!isValidUlid(id) || !/^[a-z0-9]+$/.test(id))
        fail("ulid", `id bukan ULID lowercase: ${id}`);
    else
        console.log("PASS: generateId ULID (custom advanced.generateId)");
    const rows = await client.execute("SELECT id, email, email_verified, name FROM users WHERE id = ?", [id]);
    if (rows.rows.length !== 1)
        fail("mapping", "user tidak tersimpan di Global DB users");
    else {
        const r = rows.rows[0] as unknown as {
            email: string;
            email_verified: number;
            name: string;
        };
        if (r.email !== email || r.email_verified !== 0 || r.name !== "Auth Smoke")
            fail("mapping", "field mapping salah");
        else
            console.log("PASS: adapter menulis ke tabel users dengan kolom snake_case (mapping B.2)");
    }
    try {
        await ctx.internalAdapter.createUser({
            name: "Dup",
            email,
            emailVerified: false,
            image: null,
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        fail("duplicate", "email duplikat harus ditolak");
    }
    catch {
        console.log("PASS: email duplikat ditolak (users.email UNIQUE)");
    }
    await client.execute("DELETE FROM users WHERE id = ?", [id]);
    console.log("INFO: data uji dihapus (cleanup)");
}
catch (e) {
    fail("exception", e);
}
finally {
    await client.close();
}
if (failed)
    process.exit(1);
console.log("smoke auth selesai");
