import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import handlebars from "vite-plugin-handlebars";
import { viteStaticCopy } from "vite-plugin-static-copy";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const r = (p) => path.resolve(__dirname, p);

// Collapse "a/b/../c" -> "a/c" on POSIX-like strings
function normalizePosix(p) {
  const parts = [];
  for (const seg of p.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") { parts.pop(); continue; }
    parts.push(seg);
  }
  return parts.join("/");
}

export default defineConfig({
  root: r("public"),

  plugins: [
    handlebars({
      partialDirectory: r("public/partials"),
      context(pagePath) {
        const norm = String(pagePath).replace(/\\/g, "/");
        const afterPublic = norm.includes("/public/")
          ? norm.split(/\/public\//i).pop()
          : norm;
        const relClean = normalizePosix(afterPublic.replace(/^(\.\.\/)+/g, ""));
        const segs = relClean.split("/");
        const last2 = segs.slice(-2).join("/");
        const file = segs[segs.length - 1];

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

        // ✅ Resolve the OVERRIDE OBJECT, not a string key
        const pageOverride =
          overrides[relClean] ??
          overrides[last2] ??
          overrides[file] ??
          null;

        // Debug
        console.log("\n[handlebars-debug]");
        console.log("pagePath: ", pagePath);
        console.log("relClean: ", relClean, " last2:", last2, " file:", file);
        console.log("Resolved override exists:", Boolean(pageOverride));
        console.log("--------------------------");

        const base = {
          title: "WrestleUtopia – Indie Wrestling Talent & Tryouts",
          description: "Profiles • Tryouts • Bookings for indie wrestling",
          ogTitle: "WrestleUtopia",
          ogDescription: "Profiles • Tryouts • Bookings for indie wrestling",
          ogImage: "/assets/logo.svg",
          headExtra: `<script type="module" src="/js/core.js"></script>`
        };

        // ⬇️ Spread the object directly
        return { ...base, ...(pageOverride ?? {}) };
      }
    }),

    viteStaticCopy({
      targets: [
        { src: r("public/partials"), dest: "" },
        { src: r("manifest.webmanifest"), dest: "" },
        { src: r("public/assets/*"), dest: "assets" },
        { src: r("public/styles/*"), dest: "styles" },
        { src: r("public/js/**/*"), dest: "js" }
      ]
    })
  ],

  build: {
    outDir: r("dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: r("public/index.html"),
        privacy: r("public/privacy.html"),
        terms: r("public/terms.html"),
        tryouts: r("public/tryouts.html"),
        profile: r("public/profile.html"),
        talent: r("public/talent.html"),
        dashboard_wrestler: r("public/dashboard_wrestler.html"),
        dashboard_promoter: r("public/dashboard_promoter.html"),
        w_index: r("public/w/index.html"),
        p_index: r("public/p/index.html"),
        promoter_index: r("public/promoter/index.html")
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]"
      }
    }
  }
});
