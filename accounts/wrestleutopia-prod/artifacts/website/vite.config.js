import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  build: {
    outDir: "public/dist",
    emptyOutDir: false,
    rollupOptions: {
      input: {
        auth: "src/auth-esm.js",
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
