import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;

function ok(name, pass, detail = "") {
  if (pass) {
    console.log(`  ok  ${name}`);
    return;
  }
  failed += 1;
  console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function json(rel) {
  return JSON.parse(read(rel));
}

console.log("Contrato de la aplicación (no despliega nada)\n");

const pkg = json("apps/web/package.json");
const initPy = read("apps/runtime/app/__init__.py");
const versionMatch = initPy.match(/__version__\s*=\s*"([^"]+)"/);
ok("versión web = versión runtime", Boolean(versionMatch) && pkg.version === versionMatch[1], `${pkg.version} vs ${versionMatch?.[1]}`);

const es = json("apps/web/src/i18n/es.json");
const en = json("apps/web/src/i18n/en.json");
const esKeys = Object.keys(es).sort().join("\n");
const enKeys = Object.keys(en).sort().join("\n");
ok("i18n es/en mismas claves", esKeys === enKeys);

const app = read("apps/web/src/App.tsx");
for (const route of ["/admin", "/onboarding", "/orgs", "/o/:orgId", "sites/new", "team", "settings"]) {
  ok(`ruta ${route} en App.tsx`, app.includes(route));
}

const rules = read("firebase/firestore.rules");
ok("rules: isPlatformAdmin", rules.includes("function isPlatformAdmin"));
ok("rules: platformAdmins", rules.includes("match /platformAdmins/{uid}"));
ok("rules: members.access", rules.includes("access"));
ok("firestore.json usa BD webs", json("firebase.json").firestore?.database === "webs");
const firebase = read("apps/web/src/lib/firebase.ts");
ok(
  "cliente Firestore named DB",
  firebase.includes("FIRESTORE_DATABASE_ID") &&
    (firebase.includes("initializeFirestore") || firebase.includes("getFirestore")),
);

const compose = read("docker-compose.yml");
ok("compose publica 8080", compose.includes("8080:8080"));
ok("compose monta datos", compose.includes("/app/data"));

const dockerfile = read("apps/runtime/Dockerfile");
ok("Dockerfile uvicorn 8080", dockerfile.includes("uvicorn") && dockerfile.includes("8080"));
ok("runtime POST crawls", read("apps/runtime/app/main.py").includes("/api/sites/{site_id}/crawls"));
ok("runtime SQLite snapshots", read("apps/runtime/app/db.py").includes("CREATE TABLE IF NOT EXISTS snapshots"));
ok("web proxy runtime", read("apps/web/vite.config.ts").includes('"/runtime"'));

const requiredFiles = [
  "docs/INSTALACION.md",
  "docs/VERSIONES_GITHUB.md",
  "firebase/firestore.rules",
  "firebase/firestore.indexes.json",
  "apps/web/src/pages/AdminOrgsPage.tsx",
  "apps/runtime/app/main.py",
  "deploy/cliente/docker-compose.yml",
];
for (const f of requiredFiles) {
  ok(`existe ${f}`, existsSync(join(root, f)));
}

const forbidden = [".env", ".env.local", "apps/web/.env.local", "apps/runtime/.env"];
let trackedEnv = [];
try {
  const out = execFileSync("git", ["ls-files", ...forbidden], { cwd: root, encoding: "utf8" }).trim();
  trackedEnv = out ? out.split(/\r?\n/) : [];
} catch {
  trackedEnv = [];
}
ok("no se versionan .env con secretos", trackedEnv.length === 0, trackedEnv.join(", "));

function walk(dir, acc = []) {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    if (name.name === "node_modules" || name.name === ".git" || name.name === "dist" || name.name === ".venv") continue;
    const p = join(dir, name.name);
    if (name.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

const secretLike = [];
for (const file of walk(root)) {
  if (!/\.(ts|tsx|py|md|yml|json|example)$/.test(file)) continue;
  if (file.endsWith(".example") || file.includes("node_modules")) continue;
  const text = readFileSync(file, "utf8");
  if (/BEGIN (RSA |OPENSSH )?PRIVATE KEY/.test(text) || /AIzaSy[A-Za-z0-9_-]{20,}/.test(text)) {
    secretLike.push(file);
  }
}
ok("no hay claves privadas ni API keys reales en el árbol", secretLike.length === 0, secretLike.join(", "));

if (failed) {
  console.error(`\n${failed} chequeo(s) fallaron. No publiques hasta corregir.`);
  process.exit(1);
}
console.log("\nContrato OK.");
