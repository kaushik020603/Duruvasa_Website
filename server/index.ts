import { createApp } from "./app.js";
import { bootstrapAdmin } from "./auth.js";
import { config } from "./config.js";
import { seedIfEmpty } from "./content.js";
import { scheduleBackups } from "./admin.js";
import "./db.js";

seedIfEmpty();
bootstrapAdmin();
scheduleBackups();

const app = createApp();
const server = app.listen(config.port, config.host, () => {
  console.log(`\n  DuRuVaSa server listening on http://${config.host}:${config.port}`);
  console.log(`  Data directory: ${config.dataDir}`);
  console.log(`  Admin panel:    ${config.publicUrl}/admin/\n`);
});

const stop = () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 5000).unref(); };
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
