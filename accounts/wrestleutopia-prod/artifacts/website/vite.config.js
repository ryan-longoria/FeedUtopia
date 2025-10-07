import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  build: {
    outDir: "public/dist",
    emptyOutDir: false,
    rollupOptions: {
      input: {
        index: "public/index.html",
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});