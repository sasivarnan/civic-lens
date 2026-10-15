import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
if (!process.argv.includes("--assets-only") && !existsSync(".env")) {
  const template = await readFile(".env.example", "utf8");
  await writeFile(
    ".env",
    template
      .replace(
        "replace-with-at-least-32-random-characters",
        randomBytes(32).toString("hex"),
      )
      .replace(
        "replace-with-GK-and-32-hex-characters",
        "GK" + randomBytes(16).toString("hex"),
      )
      .replace(
        "replace-with-64-random-hex-characters",
        randomBytes(32).toString("hex"),
      ),
    { mode: 0o600 },
  );
  console.log("Created local .env with generated secrets.");
}
await import("../apps/frontend/scripts/setup-assets.mjs");
