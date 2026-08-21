import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const webRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(webRoot, "../..");
const runtimeDir = path.resolve(webRoot, "../runtime");

const KEYS = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
  "VITE_FIRESTORE_DATABASE",
  "VITE_RUNTIME_URL",
] as const;

function runtimeDevPlugin(): Plugin {
  let child: ChildProcess | undefined;
  return {
    name: "seo-runtime-dev",
    apply: "serve",
    configureServer() {
      const venvPy = path.join(runtimeDir, ".venv", "Scripts", "python.exe");
      const venvPyNix = path.join(runtimeDir, ".venv", "bin", "python");
      const python = existsSync(venvPy) ? venvPy : existsSync(venvPyNix) ? venvPyNix : "python";
      const start = async () => {
        try {
          const res = await fetch("http://127.0.0.1:8080/api/health");
          if (res.ok) return;
        } catch {
          /* not up yet */
        }
        child = spawn(python, ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8080"], {
          cwd: runtimeDir,
          stdio: "inherit",
          windowsHide: true,
        });
        child.on("error", (err) => {
          console.warn("[runtime] no se pudo arrancar el motor:", err.message);
        });
      };
      setTimeout(() => {
        void start();
      }, 400);
    },
    closeBundle() {
      if (child && !child.killed) child.kill();
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = {
    ...loadEnv(mode, repoRoot, "VITE_"),
    ...loadEnv(mode, webRoot, "VITE_"),
  };
  const define = Object.fromEntries(
    KEYS.map((key) => [`import.meta.env.${key}`, JSON.stringify((env[key] ?? "").trim())]),
  );
  return {
    plugins: [react(), runtimeDevPlugin()],
    envDir: webRoot,
    define,
    optimizeDeps: {
      include: ["exceljs"],
    },
    server: {
      port: 5173,
      proxy: {
        "/runtime": {
          target: "http://127.0.0.1:8080",
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/runtime/, ""),
        },
      },
    },
  };
});
