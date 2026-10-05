// Writes public/img/oem/{fortinet,paloalto}.svg from the Simple Icons vector data (CC0 icon data; the marks remain
// their owners' trademarks) and crops the official Zscaler SVG (downloaded from zscaler.com) to its cloud symbol.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const si = require("simple-icons");
const out = new URL("../public/img/oem/", import.meta.url);

const glyph = (icon) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img" aria-label="${icon.title}"><title>${icon.title}</title><path fill="#${icon.hex}" d="${icon.path}"/></svg>\n`;

writeFileSync(new URL("fortinet.svg", out), glyph(si.siFortinet));
writeFileSync(new URL("paloalto.svg", out), glyph(si.siPaloaltonetworks));

// Zscaler: keep only the Z-cloud symbol (left part of the full lockup).
const z = readFileSync(new URL("zscaler.svg", out), "utf8");
writeFileSync(new URL("zscaler-symbol.svg", out), z.replace('viewBox="0 0 252 54"', 'viewBox="0 0 86 54" role="img" aria-label="Zscaler"'));
console.log("oem logos written");
