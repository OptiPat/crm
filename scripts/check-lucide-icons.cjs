const fs = require("fs");
const path = require("path");
const lucide = require("lucide-react");

const re = /import\s*\{([^}]+)\}\s*from\s*["']lucide-react["']/g;
const missing = [];

function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx?)$/.test(f)) {
      const content = fs.readFileSync(p, "utf8");
      let m;
      while ((m = re.exec(content))) {
        for (const part of m[1].split(",")) {
          const icon = part.trim().split(/\s+as\s+/)[0].trim();
          if (!icon || icon === "LucideIcon" || icon === "type") continue;
          if (!lucide[icon]) missing.push({ icon, file: p });
        }
      }
    }
  }
}

walk(path.join(__dirname, "..", "src"));
if (missing.length) {
  console.error("Icônes lucide manquantes:");
  for (const { icon, file } of missing) console.error(`  - ${icon} (${file})`);
  process.exit(1);
}
console.log("Toutes les icônes lucide-react sont valides.");
