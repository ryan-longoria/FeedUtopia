import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { createHash } from "node:crypto";
import handlebars from "vite-plugin-handlebars";
import { viteStaticCopy } from "vite-plugin-static-copy";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const r = (p) => path.resolve(__dirname, p);

// --- helpers ---
function normalizePosix(p) {
  const parts = [];
  for (const seg of p.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") { parts.pop(); continue; }
    parts.push(seg);
  }
  return parts.join("/");
}

function fileHash(fullPath) {
  const buf = fs.readFileSync(fullPath);
  return createHash("sha256").update(buf).digest("hex").slice(0, 8);
}

function hashJs(relFromJsRoot) {
  const full = r(`public/js/${relFromJsRoot}`);
  const ext = path.extname(full);
  const base = path.basename(full, ext);
  const h = fileHash(full);
  return `/js/${base}-${h}${ext}`;
}

function resolvePageKey(pagePathLikeVite) {
  // Vite passes paths like "/w/index.html"
  const norm = String(pagePathLikeVite).replace(/\\/g, "/");
  const afterPublic = norm.includes("/public/") ? norm.split(/\/public\//i).pop() : norm;
  const relClean = normalizePosix(afterPublic.replace(/^(\.\.\/)+/g, ""));
  const segs = relClean.split("/");
  const last2 = segs.slice(-2).join("/");
  const file = segs[segs.length - 1];
  return { relClean, last2, file };
}

function getOverrides() {
  return {
    "index.html": {
      title: "WrestleUtopia – Get booked. Find verified talent.",
      description:
        "Profiles, tryouts, and applications in one place. Built for indie wrestling.",
      canonical: "https://www.wrestleutopia.com/",
      headExtra: `
        <script type="module" src="${hashJs("main.js")}"></script>
        <script type="module" src="${hashJs("home-redirect.js")}"></script>
        <script type="module" src="${hashJs("home-free-offer-hide.js")}"></script>
        <script type="module" src="${hashJs("home-tryouts-locked.js")}"></script>
        <script type="module" src="${hashJs("home-auth-cta.js")}"></script>
      `
    },

    "profile.html": {
      title: "WrestleUtopia – My Profile",
      headExtra: `
        <script type="module" src="${hashJs("profile_me.js")}"></script>
        <script type="module" src="${hashJs("profile-preview-modal.js")}"></script>
      `
    },

    "talent.html": {
      headExtra: `
        <script type="module" src="${hashJs("talent-lock.js")}"></script>
        <script type="module" src="${hashJs("talent-modal.js")}"></script>
        <script type="module" src="${hashJs("home-auth-cta.js")}"></script>
      `
    },

    "dashboard_wrestler.html": {
      title: "WrestleUtopia – Wrestler Dashboard",
      headExtra: `
        <script type="module" src="${hashJs("dashboard_wrestler.js")}"></script>
        <script type="module" src="${hashJs("wrestler-guard-and-progress.js")}"></script>
      `
    },

    "dashboard_promoter.html": {
      title: "WrestleUtopia – Promoter Dashboard",
      headExtra: `
        <script type="module" src="${hashJs("dashboard_promoter_mytryouts.js")}"></script>
        <script type="module" src="${hashJs("dashboard_promoter_apps.js")}"></script>
        <script type="module" src="${hashJs("promoter-guard.js")}"></script>
        <script type="module" src="${hashJs("promoter-apps-modal.js")}"></script>
      `
    },

    "w/index.html": {
      title: "WrestleUtopia – Wrestler",
      headExtra: `<script type="module" src="${hashJs("wrestler_public.js")}"></script>`
    },

    "p/index.html": {
      title: "Promotion – WrestleUtopia",
      headExtra: `<script type="module" src="${hashJs("promo_public.js")}"></script>`
    },

    "promoter/index.html": {
      title: "WrestleUtopia – My Promotion",
      headExtra: `<script type="module" src="${hashJs("promo_me.js")}"></script>`
    }
  };
}

function computePageOverride(pagePathLikeVite) {
  const { relClean, last2, file } = resolvePageKey(pagePathLikeVite);
  const overrides = getOverrides();
  return overrides[relClean] ?? overrides[last2] ?? overrides[file] ?? null;
}

// Fallback injector: if template forgot {{{headExtra}}}, inject before </head>
function injectHeadExtraPlugin() {
  return {
    name: "inject-head-extra-fallback",
    transformIndexHtml(html, ctx) {
      const pageOverride = computePageOverride(ctx.path);
      const baseHeadExtra = `<script type="module" src="${hashJs("core.js")}"></script>`;
      const computed = (pageOverride?.headExtra || "") + "\n" + baseHeadExtra;

      // If the HTML already contains a marker (your template used {{{headExtra}}}), skip.
      if (html.includes("{{{headExtra}}}") || html.includes("<!-- HEAD_EXTRA -->")) {
        return html;
      }

      // Otherwise inject right before </head>
      return html.replace(
        /<\/head>/i,
        `\n  <!-- injected:headExtra -->\n  ${computed}\n</head>`
      );
    }
  };
}

export default defineConfig({
  root: r("public"),

  plugins: [
    handlebars({
      partialDirectory: r("public/partials"),
      context(pagePath) {
        const { relClean, last2, file } = resolvePageKey(pagePath);

        const pageOverride = computePageOverride(pagePath);

        const base = {
          title: "WrestleUtopia – Indie Wrestling Talent & Tryouts",
          description: "Profiles • Tryouts • Bookings for indie wrestling",
          ogTitle: "WrestleUtopia",
          ogDescription: "Profiles • Tryouts • Bookings for indie wrestling",
          ogImage: "/assets/logo.svg",
          // also expose base core script to templates
          headExtra: `<script type="module" src="${hashJs("core.js")}"></script>`
        };

        return { ...base, ...(pageOverride ?? {}) };
      }
    }),

    // copy only what's truly static at runtime
    viteStaticCopy({
      targets: [
        { src: r("public/partials"), dest: "" },
        { src: r("manifest.webmanifest"), dest: "" },
        {
          src: r("public/js/**/*"),
          dest: "js",
          flatten: false,
          rename: (fileName, fileExt, fullPath) => {
            const base = path.basename(fullPath, fileExt ? `.${fileExt}` : "");
            const extWithDot = fileExt ? `.${fileExt}` : "";
            const h = fileHash(fullPath);
            return `${base}-${h}${extWithDot}`;
          }
        }
      ]
    }),

    // Ensure headExtra shows up even if the template missed it
    injectHeadExtraPlugin()
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

      // Treat absolute /js/... as external (we copy + hash those)
      external: (id) => id.startsWith("/js/"),

      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]"
      }
    }
  }
});
