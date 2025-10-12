import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import handlebars from "vite-plugin-handlebars";
import { viteStaticCopy } from "vite-plugin-static-copy";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const r = (p) => path.resolve(__dirname, p);

const posix = (p) =>
  p.replace(/\\/g, "/").split("/").reduce((acc, seg) => {
    if (!seg || seg === ".") return acc;
    if (seg === "..") acc.pop(); else acc.push(seg);
    return acc;
  }, []).join("/");

export default defineConfig({
  root: r("public"),
  plugins: [
    handlebars({
      partialDirectory: r("public/partials"),
      context(pagePath) {
        const rel   = posix(pagePath.split(/\/public\//i).pop() || "");
        const last2 = rel.split("/").slice(-2).join("/");
        const file  = rel.split("/").pop();

        // page id helper
        const pageId = (id) => `<meta name="wu-page" content="${id}">`;

        const overrides = {
          "index.html": {
            title: "WrestleUtopia – Get booked. Find verified talent.",
            description:
              "Profiles, tryouts, and applications in one place. Built for indie wrestling.",
            canonical: "https://www.wrestleutopia.com/",
            headExtra: `${pageId("index")}`
          },
          "privacy.html":   { headExtra: `${pageId("privacy")}` },
          "terms.html":     { headExtra: `${pageId("terms")}` },
          "tryouts.html":   { headExtra: `${pageId("tryouts")}` },
          "profile.html":   { title: "WrestleUtopia – My Profile", headExtra: `${pageId("profile")}` },
          "talent.html":    { headExtra: `${pageId("talent")}` },

          "dashboard_wrestler.html": {
            title: "WrestleUtopia – Wrestler Dashboard",
            headExtra: `${pageId("dashboard_wrestler")}`
          },

          "dashboard_promoter.html": {
            title: "WrestleUtopia – Promoter Dashboard",
            headExtra: `${pageId("dashboard_promoter")}`
          },

          "w/index.html": {
            title: "WrestleUtopia – Wrestler",
            headExtra: `${pageId("w_index")}`
          },

          "p/index.html": {
            title: "Promotion – WrestleUtopia",
            headExtra: `${pageId("p_index")}`
          },

          "promoter/index.html": {
            title: "WrestleUtopia – My Promotion",
            headExtra: `${pageId("promoter_index")}`
          }
        };

        const pageOverride =
          overrides[rel] ?? overrides[last2] ?? overrides[file] ?? null;

        const base = {
          title: "WrestleUtopia – Indie Wrestling Talent & Tryouts",
          description: "Profiles • Tryouts • Bookings for indie wrestling",
          ogTitle: "WrestleUtopia",
          ogDescription: "Profiles • Tryouts • Bookings for indie wrestling",
          ogImage: "/assets/logo.svg",
          headExtra: "" // no scripts here; core.js is hardcoded in head.hbs
        };

        return pageOverride
          ? { ...base, ...pageOverride,
              headExtra: `${base.headExtra}\n${pageOverride.headExtra || ""}` }
          : base;
      }
    }),

    // copy static folders verbatim
    viteStaticCopy({
      // ✅ copy before Rollup writes HTML so built HTML wins
      hook: 'buildStart',
      targets: [
        ...(fs.existsSync(r("public/js"))       ? [{ src: r("public/js/**/*"),       dest: "js" }]       : []),
        ...(fs.existsSync(r("public/styles"))   ? [{ src: r("public/styles/**/*"),   dest: "styles" }]   : []),
        ...(fs.existsSync(r("public/assets"))   ? [{ src: r("public/assets/**/*"),   dest: "assets" }]   : []),
        ...(fs.existsSync(r("public/partials")) ? [{ src: r("public/partials/**/*"), dest: "partials" }] : []),

        // ✅ exclude HTML so processed files aren't overwritten
        ...(fs.existsSync(r("public/w")) ? [{
          src: r("public/w/**/*"),
          dest: "w",
          globOptions: { ignore: ["**/*.html"] }
        }] : []),

        ...(fs.existsSync(r("public/p")) ? [{
          src: r("public/p/**/*"),
          dest: "p",
          globOptions: { ignore: ["**/*.html"] }
        }] : []),

        ...(fs.existsSync(r("public/promoter")) ? [{
          src: r("public/promoter/**/*"),
          dest: "promoter",
          globOptions: { ignore: ["**/*.html"] }
        }] : []),

        ...(fs.existsSync(r("public/manifest.webmanifest"))
          ? [{ src: r("public/manifest.webmanifest"), dest: "" }]
          : [])
      ]
    })
  ],

  build: {
    outDir: r("dist"),
    emptyOutDir: true,
    assetsInlineLimit: 0,
    cssCodeSplit: true,
    sourcemap: false,
    minify: false,
    rollupOptions: {
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
        manualChunks: undefined,
        entryFileNames: "js/[name].js",
        chunkFileNames: "js/[name].js",
        assetFileNames(info) {
          const ext = path.extname(info.name || "").toLowerCase();
          if (ext === ".css") return "styles/[name][extname]";
          if ([".png",".jpg",".jpeg",".gif",".webp",".avif",".svg"].includes(ext))
            return "assets/[name][extname]";
          if ([".woff",".woff2",".ttf",".otf",".eot"].includes(ext))
            return "assets/fonts/[name][extname]";
          if ([".mp4",".webm",".mp3",".wav",".ogg"].includes(ext))
            return "assets/media/[name][extname]";
          return "assets/[name][extname]";
        }
      }
    }
  }
});
