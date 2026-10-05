/**
 * Break-glass tools for whoever has shell access to the server (they cannot be reached over the web).
 *   npm run admin:link              print a fresh password-setup link for the main admin
 *   npm run admin:link -- a@b.com   ...for another user
 *   npm run admin:reset-2fa -- a@b.com
 */
import { config } from "./config.js";
import { get, run } from "./db.js";
import { issueSetupToken, setupLink } from "./auth.js";
import { audit } from "./util.js";

const [cmd, emailArg] = process.argv.slice(2);
const email = (emailArg ?? config.adminEmail).toLowerCase();
const u = get<{ id: number }>("SELECT id FROM users WHERE email = ?", email);

if (!u) {
  console.error(`No user with email ${email}. Start the server once to create the first admin.`);
  process.exit(1);
}

if (cmd === "link") {
  console.log(`\n  Setup link for ${email} (valid 24 hours):\n\n    ${setupLink(email, issueSetupToken(u.id, 24))}\n`);
  run("DELETE FROM sessions WHERE user_id = ?", u.id);
  audit("cli", "user.reset-link", "users", email);
} else if (cmd === "reset-2fa") {
  run("UPDATE users SET totp_enabled = 0, totp_secret = NULL WHERE id = ?", u.id);
  audit("cli", "user.reset-2fa", "users", email);
  console.log(`Two-factor authentication turned off for ${email}.`);
} else {
  console.error("Usage: cli.js <link|reset-2fa> [email]");
  process.exit(1);
}
