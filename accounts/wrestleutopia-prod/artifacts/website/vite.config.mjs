import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import handlebars from "vite-plugin-handlebars";
import { viteStaticCopy } from "vite-plugin-static-copy";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const r = (p) => path.resolve(__dirname, p);

// POSIX-normalize (collapse ".." / ".")
const norm = (p) =>
  p
    .replace(/\\/g, "/")
    .split("/")
    .reduce((acc, seg) => {
      if (!seg || seg === ".") return acc;
      if (seg === "..") acc.pop();
      else acc.push(seg);
      return acc;
    }, [])
    .join("/");

export default defineConfig({
  root: r("public"),

  /* ───────────────────────── plugins ───────────────────────── */
  plugins: [
    handlebars({
      partialDirectory: r("public/partials"),

      context(pagePath) {
        const rel   = norm(pagePath.split(/\/public\//i).pop() || "");
        const last2 = rel.split("/").slice(-2).join("/");
        const file  = rel.split("/").pop();

        /* ───────── page-specific overrides ───────── */
        const overrides = {
          "index.html": {
            title: "WrestleUtopia – Get booked. Find verified talent.",
            description:
              "Profiles, tryouts, and applications in one place. Built for indie wrestling.",
            canonical: "https://www.wrestleutopia.com/",
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

        /* decide which override applies */
        const pageOverride =
          overrides[rel] ?? overrides[last2] ?? overrides[file] ?? null;

        /* ───────── base applied to every page ───────── */
        const base = {
          title: "WrestleUtopia – Indie Wrestling Talent & Tryouts",
          description: "Profiles • Tryouts • Bookings for indie wrestling",
          ogTitle: "WrestleUtopia",
          ogDescription: "Profiles • Tryouts • Bookings for indie wrestling",
          ogImage: "/assets/logo.svg",
          headExtra: `
            <!-- defines window.WU_API before page bundle executes -->
            <script type="module" src="/js/config.js"></script>
          `
        };

        /* merge, appending headExtra */
        return pageOverride
          ? {
              ...base,
              ...pageOverride,
              headExtra: `${base.headExtra}\n${pageOverride.headExtra || ""}`
            }
          : base;
      }
    }),

    /* ───────── copy static folders verbatim ───────── */
    viteStaticCopy({
      targets: [
        ...(fs.existsSync(r("public/js"))       ? [{ src: r("public/js/**/*"),       dest: "js" }]       : []),
        ...(fs.existsSync(r("public/styles"))   ? [{ src: r("public/styles/**/*"),   dest: "styles" }]   : []),
        ...(fs.existsSync(r("public/assets"))   ? [{ src: r("public/assets/**/*"),   dest: "assets" }]   : []),
        ...(fs.existsSync(r("public/partials")) ? [{ src: r("public/partials/**/*"), dest: "partials" }] : []),
        ...(fs.existsSync(r("public/w"))        ? [{ src: r("public/w/**/*"),        dest: "w" }]        : []),
        ...(fs.existsSync(r("public/p"))        ? [{ src: r("public/p/**/*"),        dest: "p" }]        : []),
        ...(fs.existsSync(r("public/promoter")) ? [{ src: r("public/promoter/**/*"), dest: "promoter" }] : []),
        ...(fs.existsSync(r("public/manifest.webmanifest"))
          ? [{ src: r("public/manifest.webmanifest"), dest: "" }]
          : [])
      ]
    })
  ],

  /* ───────────────────────── build ───────────────────────── */
  build: {
    outDir: r("dist"),
    emptyOutDir: true,
    assetsInlineLimit: 0,
    cssCodeSplit: true,
    sourcemap: false,
    minify: false,

    rollupOptions: {
      /* each HTML file = entry (one bundle per page) */
      input: {
        index:               r("public/index.html"),
        privacy:             r("public/privacy.html"),
        terms:               r("public/terms.html"),
        tryouts:             r("public/tryouts.html"),
        profile:             r("public/profile.html"),
        talent:              r("public/talent.html"),
        dashboard_wrestler:  r("public/dashboard_wrestler.html"),
        dashboard_promoter:  r("public/dashboard_promoter.html"),
        w_index:             r("public/w/index.html"),
        p_index:             r("public/p/index.html"),
        promoter_index:      r("public/promoter/index.html")
      },

      output: {
        /* disable shared chunks */
        manualChunks: undefined,

        entryFileNames: "js/[name].js",

        assetFileNames(info) {
          const n = (info.name || "").toLowerCase();
          if (n.endsWith(".css")) return "styles/[name][extname]";
          const img = [".png",".jpg",".jpeg",".gif",".webp",".avif",".svg"];
          if (img.some(e => n.endsWith(e))) return "assets/[name][extname]";
          const fts = [".woff",".woff2",".ttf",".otf",".eot"];
          if (fts.some(e => n.endsWith(e))) return "assets/fonts/[name][extname]";
          const med = [".mp4",".webm",".mp3",".wav",".ogg"];
          if (med.some(e => n.endsWith(e))) return "assets/media/[name][extname]";
          return "assets/[name][extname]";
        }
      }
    }
  }
});
