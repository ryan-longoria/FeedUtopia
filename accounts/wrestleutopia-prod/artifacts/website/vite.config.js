import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',                 // project root
  build: {
    outDir: 'public/dist', // emit built files where your site can serve them
    emptyOutDir: false,      // don't wipe the rest of public/
    rollupOptions: {
      input: {
        auth: 'src/auth-esm.js' // our single entry
      },
      output: {
        entryFileNames: '[name].js',       // -> public/assets/auth.js
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      }
    }
  }
});
