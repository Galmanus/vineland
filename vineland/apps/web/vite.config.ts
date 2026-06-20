import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { resolve } from "node:path";

// Allow Vite to resolve raw imports of the monorepo's top-level docs/ so the
// /docs route can bundle every markdown file at build time.
const DOCS_ROOT = resolve(__dirname, "../../docs");

export default defineConfig({
  plugins: [
    react(),
    // Solana SDKs (@solana/web3.js, anchor, lazorkit) reference Node globals
    // (Buffer/global/process) that the browser lacks. Without this the Solana
    // path crashes (LazorkitProvider new Connection() throws on Buffer → infinite
    // re-render → blank page). Stellar path never needed it (stellar-sdk bundles its own).
    nodePolyfills({ globals: { Buffer: true, global: true, process: true } }),
  ],
  define: {
    __BUILD_TAG__: JSON.stringify(new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)),
  },
  server: {
    port: 5173,
    fs: { allow: ["..", "../..", DOCS_ROOT] },
    // Allow dev tunnels (localtunnel/ngrok) to reach the dev server for the
    // mobile passkey e2e. Dev-only; these hosts are never used in prod builds.
    allowedHosts: [".loca.lt", ".ngrok-free.app", ".ngrok.app", ".trycloudflare.com"],
  },
});
