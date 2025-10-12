import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import handlebars from "vite-plugin-handlebars";
import { viteStaticCopy } from "vite-plugin-static-copy";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const r = (p) => path.resolve(__dirname, p);

function normalizePosix(p) {
  return String(p)
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .reduce((out, seg) => (seg === ".." ? out.slice(0, -1) : [...out, seg]), [])
    .join("/");
}

export default defineConfig({
  root: r("public"),

  plugins: [
    handlebars({
      partialDirectory: r("public/partials"),
      context(pagePath) {
        /* ------------ find the current html ---------- */
        const norm     = String(pagePath).replace(/\\/g, "/");
        const relPart  = norm.includes("/public/") ? norm.split(/\/public\//i).pop() : norm;
        const relClean = normalizePosix(relPart.replace(/^(\.\.\/)+/, ""));
        const file     = relClean.split("/").at(-1);
        const last2    = relClean.split("/").slice(-2).join("/");

        /* ------------ per-page overrides ------------- */
        const overrides = {
          "index.html": {
            title:       "WrestleUtopia – Get booked. Find verified talent.",
            description: "Profiles, tryouts, and applications in one place. Built for indie wrestling.",
            canonical:   "https://www.wrestleutopia.com/",
            headExtra: `
              <script type="module" src="/js/main.js"></script>
              <script type="module" src="/js/home-redirect.js"></script>
              <script type="module" src="/js/home-free-offer-hide.js"></script>
              <script type="module" src="/js/home-tryouts-locked.js"></script>
              <script type="module" src="/js/home-auth-cta.js"></script>
            `
          },

          "profile.html": {
            title: "WrestleUtopia – My Profile",
            headExtra: `
              <script type="module" src="/js/profile_me.js"></script>
              <script type="module" src="/js/profile-preview-modal.js"></script>
            `
          },

          "talent.html": {
            headExtra: `
              <script type="module" src="/js/talent-lock.js"></script>
              <script type="module" src="/js/talent-modal.js"></script>
              <script type="module" src="/js/home-auth-cta.js"></script>
            `
          },

          "dashboard_wrestler.html": {
            title: "WrestleUtopia – Wrestler Dashboard",
            headExtra: `
              <script type="module" src="/js/dashboard_wrestler.js"></script>
              <script type="module" src="/js/wrestler-guard-and-progress.js"></script>
            `
          },

          "dashboard_promoter.html": {
            title: "WrestleUtopia – Promoter Dashboard",
            headExtra: `
              <script type="module" src="/js/dashboard_promoter_mytryouts.js"></script>
              <script type="module" src="/js/dashboard_promoter_apps.js"></script>
              <script type="module" src="/js/promoter-guard.js"></script>
              <script type="module" src="/js/promoter-apps-modal.js"></script>
            `
          },

          "w/index.html": {
            title: "WrestleUtopia – Wrestler",
            headExtra: `<script type="module" src="/js/wrestler_public.js"></script>`
          },

          "p/index.html": {
            title: "Promotion – WrestleUtopia",
            headExtra: `<script type="module" src="/js/promo_public.js"></script>`
          },

          "promoter/index.html": {
            title: "WrestleUtopia – My Promotion",
            headExtra: `<script type="module" src="/js/promo_me.js"></script>`
          }
        };

        const pageOverride =
          overrides[relClean] ?? overrides[last2] ?? overrides[file] ?? null;

        /* ------------ base head for EVERY page -------- */
        const base = {
          title:       "WrestleUtopia – Indie Wrestling Talent & Tryouts",
          description: "Profiles • Tryouts • Bookings for indie wrestling",
          ogTitle:     "WrestleUtopia",
          ogDescription: "Profiles • Tryouts • Bookings for indie wrestling",
          ogImage:     "/assets/logo.svg",

          /*  Inline config FIRST, then core */
          headExtra: `
            <script>
              window.WU_API        = "https://go2gft4394.execute-api.us-east-2.amazonaws.com";
              window.WU_MEDIA_BASE = "https://d178p8k1vmj1zs.cloudfront.net";
            </script>
            <script type="module" src="/js/core.js"></script>
          `
        };

        /* ---------- merge without losing base scripts ----- */
        if (!pageOverride) return base;

        const merged      = { ...base, ...pageOverride };
        merged.headExtra  = `${base.headExtra}\n${pageOverride.headExtra || ""}`;
        return merged;
      }
    }),

    /* Copy static assets exactly once */
    viteStaticCopy({
      targets: [
        ...(fs.existsSync(r("public/js"))       ? [{ src: r("public/js/**/*"),       dest: "js"       }] : []),
        ...(fs.existsSync(r("public/styles"))   ? [{ src: r("public/styles/**/*"),   dest: "styles"   }] : []),
        ...(fs.existsSync(r("public/assets"))   ? [{ src: r("public/assets/**/*"),   dest: "assets"   }] : []),
        ...(fs.existsSync(r("public/partials")) ? [{ src: r("public/partials/**/*"), dest: "partials" }] : []),
        ...(fs.existsSync(r("public/w"))        ? [{ src: r("public/w/**/*"),        dest: "w"        }] : []),
        ...(fs.existsSync(r("public/p"))        ? [{ src: r("public/p/**/*"),        dest: "p"        }] : []),
        ...(fs.existsSync(r("public/promoter")) ? [{ src: r("public/promoter/**/*"), dest: "promoter" }] : []),
      ]
    })
  ],

  build: {
    outDir: r("dist"),
    emptyOutDir: true,
    assetsInlineLimit: 0,
    cssCodeSplit: true,
    minify: false,

    rollupOptions: {
      input: {
        index:                r("public/index.html"),
        privacy:              r("public/privacy.html"),
        terms:                r("public/terms.html"),
        tryouts:              r("public/tryouts.html"),
        profile:              r("public/profile.html"),
        talent:               r("public/talent.html"),
        dashboard_wrestler:   r("public/dashboard_wrestler.html"),
        dashboard_promoter:   r("public/dashboard_promoter.html"),
        w_index:              r("public/w/index.html"),
        p_index:              r("public/p/index.html"),
        promoter_index:       r("public/promoter/index.html")
      },
      output: {
        entryFileNames: "js/[name].js",
        chunkFileNames: "js/chunks/[name].js",
        assetFileNames: (asset) => {
          const n = (asset.name || "").toLowerCase();
          if (n.endsWith(".css"))                     return "styles/[name][extname]";
          if (/\.(png|jpe?g|gif|webp|avif|svg)$/.test(n)) return "assets/[name][extname]";
          if (/\.(woff2?|ttf|otf|eot)$/.test(n))          return "assets/fonts/[name][extname]";
          if (/\.(mp4|webm|mp3|wav|ogg)$/.test(n))        return "assets/media/[name][extname]";
          return "assets/[name][extname]";
        }
      }
    }
  }
});
