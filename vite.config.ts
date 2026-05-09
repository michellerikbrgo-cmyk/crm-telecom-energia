import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

const plugins = [react(), tailwindcss()];

export default defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          /** React 19 + Radix: chunk separado "radix" quebra inicialização (`Activity`). Manter Radix junto ao React. */
          if (
            /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id) ||
            /[\\/]node_modules[\\/]@radix-ui[\\/]/.test(id) ||
            /[\\/]node_modules[\\/]@floating-ui[\\/]/.test(id)
          ) {
            return "react-vendor";
          }
          if (id.includes("recharts")) return "recharts";
          if (id.includes("@tanstack/react-query")) return "tanstack-query";
          if (id.includes("@trpc")) return "trpc";
          if (id.includes("lucide-react")) return "lucide";
        },
      },
    },
  },
  server: {
    host: true,
    allowedHosts: ["localhost", "127.0.0.1"],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
