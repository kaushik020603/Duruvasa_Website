import { execFileSync } from "node:child_process";
import path from "node:path";
import { expect, type Page } from "@playwright/test";

const root = path.resolve(import.meta.dirname, "..");
export const ADMIN_EMAIL = "rajesh@duruvasa.com";
export const ADMIN_PASSWORD = "E2e-Throwaway-Passphrase-42!";

/** Uses the server's own break-glass CLI to get a one-time setup link, exactly as an operator would. */
export function freshSetupLink(): string {
  const out = execFileSync(process.execPath, [path.join(root, "server-dist", "server", "cli.js"), "link"], {
    env: { ...process.env, DATA_DIR: path.join(root, ".e2e-data"), PUBLIC_URL: "http://127.0.0.1:4190" },
    encoding: "utf8",
  });
  const m = out.match(/http:\/\/\S+#\/setup\?\S+/);
  if (!m) throw new Error("No setup link in CLI output:\n" + out);
  return m[0];
}

export async function adminSetup(page: Page) {
  await page.goto(freshSetupLink());
  await page.getByLabel("New password").fill(ADMIN_PASSWORD);
  await page.getByLabel("Repeat password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Set password and sign in" }).click();
  await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible();
}

export async function adminLogin(page: Page) {
  await page.goto("/admin/");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible();
}

/** Skips the first-visit intro animation and returns console errors seen while the callback runs. */
export async function skipIntro(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem("intro", "1"));
}
