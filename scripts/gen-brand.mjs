// Rasterize the brand SVGs → PNGs Next needs (apple-icon, opengraph, splat).
// Fonts are fetched at run time so nothing binary is committed except outputs.
// Run: node scripts/gen-brand.mjs
import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FONTS = {
  "PermanentMarker.ttf":
    "https://raw.githubusercontent.com/google/fonts/main/apache/permanentmarker/PermanentMarker-Regular.ttf",
  "PatrickHand.ttf":
    "https://raw.githubusercontent.com/google/fonts/main/ofl/patrickhand/PatrickHand-Regular.ttf",
  "SpecialElite.ttf":
    "https://raw.githubusercontent.com/google/fonts/main/apache/specialelite/SpecialElite-Regular.ttf",
};

const fontDir = join(tmpdir(), "who-brand-fonts");
mkdirSync(fontDir, { recursive: true });
const fontFiles = [];
for (const [name, url] of Object.entries(FONTS)) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`font ${name}: HTTP ${res.status}`);
  const p = join(fontDir, name);
  writeFileSync(p, Buffer.from(await res.arrayBuffer()));
  fontFiles.push(p);
}

function render(svgPath, outPath, width) {
  const resvg = new Resvg(readFileSync(svgPath, "utf8"), {
    fitTo: { mode: "width", value: width },
    font: { fontFiles, loadSystemFonts: false },
    background: "rgba(0,0,0,0)",
  });
  writeFileSync(outPath, resvg.render().asPng());
  console.log(`${outPath} @ ${width}px`);
}

render("public/brand/who-og.svg", "app/opengraph-image.png", 1200);
render("public/brand/who-og.svg", "app/twitter-image.png", 1200);
render("public/brand/who-apple.svg", "app/apple-icon.png", 180);
render("public/brand/who-icon-splat.svg", "public/brand/who-icon-splat-1024.png", 1024);
