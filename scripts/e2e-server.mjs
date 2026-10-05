// Starts the built site + API against a clean throwaway data directory for Playwright.
import { rmSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dataDir = path.join(root, ".e2e-data");
const port = process.env.E2E_PORT ?? "4190";

rmSync(dataDir, { recursive: true, force: true });
mkdirSync(dataDir, { recursive: true });

const child = spawn(process.execPath, [path.join(root, "server-dist", "server", "index.js")], {
  stdio: "inherit",
  env: { ...process.env, DATA_DIR: dataDir, PORT: port, HOST: "127.0.0.1", PUBLIC_URL: `http://127.0.0.1:${port}`, NODE_ENV: "test" },
});
const stop = () => child.kill();
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", (c) => process.exit(c ?? 0));
