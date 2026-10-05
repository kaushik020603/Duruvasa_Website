// One command for local development: type-checks/compiles the API once, then runs
//   - the API server (restarts on change)   http://127.0.0.1:4180
//   - the TypeScript watcher for the API
//   - the Vite dev server (proxies /api)     http://localhost:5173   (admin: /admin/)
import { spawn, spawnSync } from "node:child_process";

const isWin = process.platform === "win32";
const npx = isWin ? "npx.cmd" : "npx";
const env = { ...process.env, PUBLIC_URL: process.env.PUBLIC_URL ?? "http://localhost:5173" };

const first = spawnSync(npx, ["tsc", "-p", "server"], { stdio: "inherit", shell: isWin });
if (first.status !== 0) process.exit(first.status ?? 1);

const procs = [
  spawn(npx, ["tsc", "-p", "server", "--watch", "--preserveWatchOutput"], { stdio: "inherit", shell: isWin }),
  spawn(process.execPath, ["--watch", "server-dist/server/index.js"], { stdio: "inherit", env }),
  spawn(npx, ["vite"], { stdio: "inherit", shell: isWin, env }),
];

const stop = () => { for (const p of procs) p.kill(); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
procs.forEach((p) => p.on("exit", (c) => { if (c) stop(); }));
