import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { createHash } from "node:crypto";
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

// Compute 8-char content hash for a file
function fileHash(fullPath) {
  const buf = fs.readFileSync(fullPath);
  return createHash("sha256").update(buf).digest("hex").slice(0, 8);
}

// Build a hashed /js/ URL for a source under public/js/
// Example: hashSrc("wrestler_public.js") -> "/js/wrestler_public-1a2b3c4d.js"
function hashSrc(relFromJsRoot) {
  const full = r(`public/js/${relFromJsRoot}`);
  const ext = path.extname(full);                  // ".js"
  const base = path.basename(full, ext);           // "wrestler_public"
  const h = fileHash(full);                        // "1a2b3c4d"
  return `/js/${base}-${h}${ext}`;
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
              <script type="module" src="${hashSrc("main.js")}"></script>
              <script type="module" src="${hashSrc("home-redirect.js")}"></script>
              <script type="module" src="${hashSrc("home-free-offer-hide.js")}"></script>
              <script type="module" src="${hashSrc("home-tryouts-locked.js")}"></script>
              <script type="module" src="${hashSrc("home-auth-cta.js")}"></script>
            `
          },

          "profile.html": {
            title: "WrestleUtopia – My Profile",
            headExtra: `
              <script type="module" src="${hashSrc("profile_me.js")}"></script>
              <script type="module" src="${hashSrc("profile-preview-modal.js")}"></script>
            `
          },

          "talent.html": {
            headExtra: `
              <script type="module" src="${hashSrc("talent-lock.js")}"></script>
              <script type="module" src="${hashSrc("talent-modal.js")}"></script>
              <script type="module" src="${hashSrc("home-auth-cta.js")}"></script>
            `
          },

          "dashboard_wrestler.html": {
            title: "WrestleUtopia – Wrestler Dashboard",
            headExtra: `
              <script type="module" src="${hashSrc("dashboard_wrestler.js")}"></script>
              <script type="module" src="${hashSrc("wrestler-guard-and-progress.js")}"></script>
            `
          },

          "dashboard_promoter.html": {
            title: "WrestleUtopia – Promoter Dashboard",
            headExtra: `
              <script type="module" src="${hashSrc("dashboard_promoter_mytryouts.js")}"></script>
              <script type="module" src="${hashSrc("dashboard_promoter_apps.js")}"></script>
              <script type="module" src="${hashSrc("promoter-guard.js")}"></script>
              <script type="module" src="${hashSrc("promoter-apps-modal.js")}"></script>
            `
          },

          "w/index.html": {
            title: "WrestleUtopia – Wrestler",
            headExtra: `<script type="module" src="${hashSrc("wrestler_public.js")}"></script>`
          },

          "p/index.html": {
            title: "Promotion – WrestleUtopia",
            headExtra: `<script type="module" src="${hashSrc("promo_public.js")}"></script>`
          },

          "promoter/index.html": {
            title: "WrestleUtopia – My Promotion",
            headExtra: `<script type="module" src="${hashSrc("promo_me.js")}"></script>`
          }
        };

        const pageOverride =
          overrides[relClean] ??
          overrides[last2] ??
          overrides[file] ??
          null;

        const base = {
          title: "WrestleUtopia – Indie Wrestling Talent & Tryouts",
          description: "Profiles • Tryouts • Bookings for indie wrestling",
          ogTitle: "WrestleUtopia",
          ogDescription: "Profiles • Tryouts • Bookings for indie wrestling",
          ogImage: "/assets/logo.svg",
          // core as hashed raw copy
          headExtra: `<script type="module" src="${hashSrc("core.js")}"></script>`
        };

        return { ...base, ...(pageOverride ?? {}) };
      }
    }),

    // Copy only what you need at runtime:
    // - partials/ (for your include.js loader)
    // - manifest.webmanifest
    // - public/js/**/* (hashed filenames, preserving folders)
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

      // ✅ Treat absolute /js/... URLs as external so Rollup/Vite doesn't try to resolve them
      external: (id) => id.startsWith("/js/"),

      output: {
        // Leave Vite’s own outputs alone; your copied /js/* files are independent
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: (assetInfo) => {
          const name = assetInfo.name || "";
          const ext = name.split(".").pop()?.toLowerCase();

          if (ext === "css") return "styles/[name]-[hash][extname]";

          const img = new Set(["png","jpg","jpeg","gif","webp","avif","svg"]);
          if (img.has(ext)) return "assets/[name]-[hash][extname]";

          const fonts = new Set(["woff","woff2","ttf","otf","eot"]);
          if (fonts.has(ext)) return "assets/fonts/[name]-[hash][extname]";

          const media = new Set(["mp4","webm","mp3","wav","ogg"]);
          if (media.has(ext)) return "assets/media/[name]-[hash][extname]";

          return "assets/[name]-[hash][extname]";
        }
      }
      }
    }
});
