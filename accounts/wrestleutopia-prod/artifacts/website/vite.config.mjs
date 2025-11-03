import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import handlebars from "vite-plugin-handlebars";
import { viteStaticCopy } from "vite-plugin-static-copy";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const r = (p) => path.resolve(__dirname, p);
const posix = (p) =>
  String(p)
    .replace(/\\/g, "/")
    .split("/")
    .reduce((acc, seg) => {
      if (!seg || seg === ".") return acc;
      if (seg === "..") acc.pop();
      else acc.push(seg);
      return acc;
    }, [])
    .join("/");

function hasNonHtmlFiles(dir) {
  if (!fs.existsSync(dir)) return false;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    for (const e of fs.readdirSync(cur, { withFileTypes: true })) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (!/\.html?$/i.test(e.name)) return true;
    }
  }
  return false;
}

function copyReportPlugin() {
  return {
    name: "copy-report",
    writeBundle() {
      const dirs = ["js", "styles", "assets", "partials", "w", "p", "promoter"];
      for (const d of dirs) {
        const p = r(`dist/${d}`);
        let count = 0;
        try {
          const walk = (dir) => {
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
              const full = path.join(dir, e.name);
              if (e.isDirectory()) walk(full);
              else count++;
            }
          };
          if (fs.existsSync(p)) walk(p);
        } catch {}
        console.log(`[copy-report] ${d.padEnd(9)} -> ${count} file(s)`);
      }
    }
  };
}

export default defineConfig({
  root: r("public"),

  optimizeDeps: {
    include: ["@countrystatecity/countries"],
  },
  assetsInclude: [
    "**/node_modules/@countrystatecity/countries/dist/data/*.json",
    "**/node_modules/@countrystatecity/countries/es2022/data/*.json",
  ],

  plugins: [
    handlebars({
      partialDirectory: r("public/partials"),
      context(pagePath) {
        const rel   = posix(pagePath.split(/\/public\//i).pop() || "");
        const last2 = rel.split("/").slice(-2).join("/");
        const file  = rel.split("/").pop();

        const overrides = {
          "index.html":              { title: "WrestleUtopia – Get booked. Find verified talent.", headExtra: `<meta name="wu-page" content="index">` },
          "profile.html":            { title: "WrestleUtopia – My Profile",                        headExtra: `<meta name="wu-page" content="profile">` },
          "talent.html":             {                                                             headExtra: `<meta name="wu-page" content="talent">` },
          "dashboard_wrestler.html": { title: "WrestleUtopia – Wrestler Dashboard",               headExtra: `<meta name="wu-page" content="dashboard_wrestler">` },
          "dashboard_promoter.html": { title: "WrestleUtopia – Promoter Dashboard",               headExtra: `<meta name="wu-page" content="dashboard_promoter">` },
          "w/index.html":            { title: "WrestleUtopia – Wrestler",                         headExtra: `<meta name="wu-page" content="w_index">` },
          "p/index.html":            { title: "Promotion – WrestleUtopia",                        headExtra: `<meta name="wu-page" content="p_index">` },
          "promoter/index.html":     { title: "WrestleUtopia – My Promotion",                     headExtra: `<meta name="wu-page" content="promoter_index">` }
        };

        const pageOverride = overrides[rel] ?? overrides[last2] ?? overrides[file] ?? null;

        const base = {
          title: "WrestleUtopia – Indie Wrestling Talent & Tryouts",
          description: "Profiles • Tryouts • Bookings for indie wrestling",
          ogTitle: "WrestleUtopia",
          ogDescription: "Profiles • Tryouts • Bookings for indie wrestling",
          ogImage: "/assets/logo.svg",
          headExtra: `
            <script type="module" src="/js/core.js"></script>
          `
        };

        return pageOverride
          ? { ...base, ...pageOverride, headExtra: `${base.headExtra}\n${pageOverride.headExtra || ""}` }
          : base;
      }
    }),

    viteStaticCopy({
      targets: [
        ...(fs.existsSync(r("public/js"))       ? [{ src: r("public/js/**/*"),       dest: "js" }]       : []),
        ...(fs.existsSync(r("public/styles"))   ? [{ src: r("public/styles/**/*"),   dest: "styles" }]   : []),
        ...(fs.existsSync(r("public/assets"))   ? [{ src: r("public/assets/**/*"),   dest: "assets" }]   : []),
        ...(fs.existsSync(r("public/partials")) ? [{ src: r("public/partials/**/*"), dest: "partials" }] : []),
        ...(fs.existsSync(r("public/manifest.webmanifest"))
          ? [{ src: r("public/manifest.webmanifest"), dest: "" }]
          : []),

        ...(hasNonHtmlFiles(r("public/w"))
          ? [{ src: r("public/w/**/*"), dest: "w", globOptions: { ignore: ["**/*.html"] } }]
          : []),
        ...(hasNonHtmlFiles(r("public/p"))
          ? [{ src: r("public/p/**/*"), dest: "p", globOptions: { ignore: ["**/*.html"] } }]
          : []),
        ...(hasNonHtmlFiles(r("public/promoter"))
          ? [{ src: r("public/promoter/**/*"), dest: "promoter", globOptions: { ignore: ["**/*.html"] } }]
          : []),
      ],
    }),

    copyReportPlugin(),
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
        promoter_index:      r("public/promoter/index.html"),
      },

      treeshake: false,

      output: {
        entryFileNames: "js/[name].js",
        chunkFileNames: "js/[name].js",
        assetFileNames(info) {
          const ext = path.extname(info.name || "").toLowerCase();
          if (ext === ".css") return "styles/[name][extname]";
          if ([".png",".jpg",".jpeg",".gif",".webp",".avif",".svg"].includes(ext)) return "assets/[name][extname]";
          if ([".woff",".woff2",".ttf",".otf",".eot"].includes(ext)) return "assets/fonts/[name][extname]";
          if ([".mp4",".webm",".mp3",".wav",".ogg"].includes(ext)) return "assets/media/[name][extname]";
          return "assets/[name][extname]";
        },
      },
    },
  },
});
