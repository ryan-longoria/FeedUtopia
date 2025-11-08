// vite.config.mjs
import { defineConfig } from "file:///mnt/host/c/Users/rlong/Desktop/sm_auto/socialmedia_automation/accounts/wrestleutopia-prod/artifacts/website/node_modules/vite/dist/node/index.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import handlebars from "file:///mnt/host/c/Users/rlong/Desktop/sm_auto/socialmedia_automation/accounts/wrestleutopia-prod/artifacts/website/node_modules/vite-plugin-handlebars/dist/index.js";
import { viteStaticCopy } from "file:///mnt/host/c/Users/rlong/Desktop/sm_auto/socialmedia_automation/accounts/wrestleutopia-prod/artifacts/website/node_modules/vite-plugin-static-copy/dist/index.js";
var __vite_injected_original_import_meta_url = "file:///mnt/host/c/Users/rlong/Desktop/sm_auto/socialmedia_automation/accounts/wrestleutopia-prod/artifacts/website/vite.config.mjs";
var __dirname = path.dirname(fileURLToPath(__vite_injected_original_import_meta_url));
var r = (p) => path.resolve(__dirname, p);
var posix = (p) => String(p).replace(/\\/g, "/").split("/").reduce((acc, seg) => {
  if (!seg || seg === ".") return acc;
  if (seg === "..") acc.pop();
  else acc.push(seg);
  return acc;
}, []).join("/");
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
        } catch {
        }
        console.log(`[copy-report] ${d.padEnd(9)} -> ${count} file(s)`);
      }
    }
  };
}
var vite_config_default = defineConfig({
  root: r("public"),
  optimizeDeps: {
    include: ["@countrystatecity/countries"]
  },
  assetsInclude: [
    "**/node_modules/@countrystatecity/countries/dist/data/*.json",
    "**/node_modules/@countrystatecity/countries/es2022/data/*.json"
  ],
  plugins: [
    handlebars({
      partialDirectory: r("public/partials"),
      context(pagePath) {
        const rel = posix(pagePath.split(/\/public\//i).pop() || "");
        const last2 = rel.split("/").slice(-2).join("/");
        const file = rel.split("/").pop();
        const overrides = {
          "index.html": { title: "WrestleUtopia \u2013 Get booked. Find verified talent.", headExtra: `<meta name="wu-page" content="index">` },
          "profile.html": { title: "WrestleUtopia \u2013 My Profile", headExtra: `<meta name="wu-page" content="profile">` },
          "talent.html": { headExtra: `<meta name="wu-page" content="talent">` },
          "dashboard_wrestler.html": { title: "WrestleUtopia \u2013 Wrestler Dashboard", headExtra: `<meta name="wu-page" content="dashboard_wrestler">` },
          "dashboard_promoter.html": { title: "WrestleUtopia \u2013 Promoter Dashboard", headExtra: `<meta name="wu-page" content="dashboard_promoter">` },
          "w/index.html": { title: "WrestleUtopia \u2013 Wrestler", headExtra: `<meta name="wu-page" content="w_index">` },
          "p/index.html": { title: "Promotion \u2013 WrestleUtopia", headExtra: `<meta name="wu-page" content="p_index">` },
          "promoter/index.html": { title: "WrestleUtopia \u2013 My Promotion", headExtra: `<meta name="wu-page" content="promoter_index">` }
        };
        const pageOverride = overrides[rel] ?? overrides[last2] ?? overrides[file] ?? null;
        const base = {
          title: "WrestleUtopia \u2013 Indie Wrestling Talent & Tryouts",
          description: "Profiles \u2022 Tryouts \u2022 Bookings for indie wrestling",
          ogTitle: "WrestleUtopia",
          ogDescription: "Profiles \u2022 Tryouts \u2022 Bookings for indie wrestling",
          ogImage: "/assets/logo.svg",
          headExtra: `
            <script type="module" src="/js/core.js"></script>
          `
        };
        return pageOverride ? { ...base, ...pageOverride, headExtra: `${base.headExtra}
${pageOverride.headExtra || ""}` } : base;
      }
    }),
    viteStaticCopy({
      targets: [
        ...fs.existsSync(r("public/geo")) ? [{ src: r("public/geo/**/*"), dest: "geo" }] : [],
        ...fs.existsSync(r("public/js")) ? [{ src: r("public/js/**/*"), dest: "js" }] : [],
        ...fs.existsSync(r("public/styles")) ? [{ src: r("public/styles/**/*"), dest: "styles" }] : [],
        ...fs.existsSync(r("public/assets")) ? [{ src: r("public/assets/**/*"), dest: "assets" }] : [],
        ...fs.existsSync(r("public/partials")) ? [{ src: r("public/partials/**/*"), dest: "partials" }] : [],
        ...fs.existsSync(r("public/manifest.webmanifest")) ? [{ src: r("public/manifest.webmanifest"), dest: "" }] : [],
        ...hasNonHtmlFiles(r("public/w")) ? [{ src: r("public/w/**/*"), dest: "w", globOptions: { ignore: ["**/*.html"] } }] : [],
        ...hasNonHtmlFiles(r("public/p")) ? [{ src: r("public/p/**/*"), dest: "p", globOptions: { ignore: ["**/*.html"] } }] : [],
        ...hasNonHtmlFiles(r("public/promoter")) ? [{ src: r("public/promoter/**/*"), dest: "promoter", globOptions: { ignore: ["**/*.html"] } }] : []
      ]
    }),
    copyReportPlugin()
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
      treeshake: false,
      output: {
        entryFileNames: "js/[name].js",
        chunkFileNames: "js/[name].js",
        assetFileNames(info) {
          const ext = path.extname(info.name || "").toLowerCase();
          if (ext === ".css") return "styles/[name][extname]";
          if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg"].includes(ext)) return "assets/[name][extname]";
          if ([".woff", ".woff2", ".ttf", ".otf", ".eot"].includes(ext)) return "assets/fonts/[name][extname]";
          if ([".mp4", ".webm", ".mp3", ".wav", ".ogg"].includes(ext)) return "assets/media/[name][extname]";
          return "assets/[name][extname]";
        }
      }
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcubWpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZGlybmFtZSA9IFwiL21udC9ob3N0L2MvVXNlcnMvcmxvbmcvRGVza3RvcC9zbV9hdXRvL3NvY2lhbG1lZGlhX2F1dG9tYXRpb24vYWNjb3VudHMvd3Jlc3RsZXV0b3BpYS1wcm9kL2FydGlmYWN0cy93ZWJzaXRlXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvbW50L2hvc3QvYy9Vc2Vycy9ybG9uZy9EZXNrdG9wL3NtX2F1dG8vc29jaWFsbWVkaWFfYXV0b21hdGlvbi9hY2NvdW50cy93cmVzdGxldXRvcGlhLXByb2QvYXJ0aWZhY3RzL3dlYnNpdGUvdml0ZS5jb25maWcubWpzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9tbnQvaG9zdC9jL1VzZXJzL3Jsb25nL0Rlc2t0b3Avc21fYXV0by9zb2NpYWxtZWRpYV9hdXRvbWF0aW9uL2FjY291bnRzL3dyZXN0bGV1dG9waWEtcHJvZC9hcnRpZmFjdHMvd2Vic2l0ZS92aXRlLmNvbmZpZy5tanNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tIFwidml0ZVwiO1xuaW1wb3J0IHBhdGggZnJvbSBcIm5vZGU6cGF0aFwiO1xuaW1wb3J0IHsgZmlsZVVSTFRvUGF0aCB9IGZyb20gXCJub2RlOnVybFwiO1xuaW1wb3J0IGZzIGZyb20gXCJub2RlOmZzXCI7XG5pbXBvcnQgaGFuZGxlYmFycyBmcm9tIFwidml0ZS1wbHVnaW4taGFuZGxlYmFyc1wiO1xuaW1wb3J0IHsgdml0ZVN0YXRpY0NvcHkgfSBmcm9tIFwidml0ZS1wbHVnaW4tc3RhdGljLWNvcHlcIjtcblxuY29uc3QgX19kaXJuYW1lID0gcGF0aC5kaXJuYW1lKGZpbGVVUkxUb1BhdGgoaW1wb3J0Lm1ldGEudXJsKSk7XG5jb25zdCByID0gKHApID0+IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsIHApO1xuY29uc3QgcG9zaXggPSAocCkgPT5cbiAgU3RyaW5nKHApXG4gICAgLnJlcGxhY2UoL1xcXFwvZywgXCIvXCIpXG4gICAgLnNwbGl0KFwiL1wiKVxuICAgIC5yZWR1Y2UoKGFjYywgc2VnKSA9PiB7XG4gICAgICBpZiAoIXNlZyB8fCBzZWcgPT09IFwiLlwiKSByZXR1cm4gYWNjO1xuICAgICAgaWYgKHNlZyA9PT0gXCIuLlwiKSBhY2MucG9wKCk7XG4gICAgICBlbHNlIGFjYy5wdXNoKHNlZyk7XG4gICAgICByZXR1cm4gYWNjO1xuICAgIH0sIFtdKVxuICAgIC5qb2luKFwiL1wiKTtcblxuZnVuY3Rpb24gaGFzTm9uSHRtbEZpbGVzKGRpcikge1xuICBpZiAoIWZzLmV4aXN0c1N5bmMoZGlyKSkgcmV0dXJuIGZhbHNlO1xuICBjb25zdCBzdGFjayA9IFtkaXJdO1xuICB3aGlsZSAoc3RhY2subGVuZ3RoKSB7XG4gICAgY29uc3QgY3VyID0gc3RhY2sucG9wKCk7XG4gICAgZm9yIChjb25zdCBlIG9mIGZzLnJlYWRkaXJTeW5jKGN1ciwgeyB3aXRoRmlsZVR5cGVzOiB0cnVlIH0pKSB7XG4gICAgICBjb25zdCBmdWxsID0gcGF0aC5qb2luKGN1ciwgZS5uYW1lKTtcbiAgICAgIGlmIChlLmlzRGlyZWN0b3J5KCkpIHN0YWNrLnB1c2goZnVsbCk7XG4gICAgICBlbHNlIGlmICghL1xcLmh0bWw/JC9pLnRlc3QoZS5uYW1lKSkgcmV0dXJuIHRydWU7XG4gICAgfVxuICB9XG4gIHJldHVybiBmYWxzZTtcbn1cblxuZnVuY3Rpb24gY29weVJlcG9ydFBsdWdpbigpIHtcbiAgcmV0dXJuIHtcbiAgICBuYW1lOiBcImNvcHktcmVwb3J0XCIsXG4gICAgd3JpdGVCdW5kbGUoKSB7XG4gICAgICBjb25zdCBkaXJzID0gW1wianNcIiwgXCJzdHlsZXNcIiwgXCJhc3NldHNcIiwgXCJwYXJ0aWFsc1wiLCBcIndcIiwgXCJwXCIsIFwicHJvbW90ZXJcIl07XG4gICAgICBmb3IgKGNvbnN0IGQgb2YgZGlycykge1xuICAgICAgICBjb25zdCBwID0gcihgZGlzdC8ke2R9YCk7XG4gICAgICAgIGxldCBjb3VudCA9IDA7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3Qgd2FsayA9IChkaXIpID0+IHtcbiAgICAgICAgICAgIGZvciAoY29uc3QgZSBvZiBmcy5yZWFkZGlyU3luYyhkaXIsIHsgd2l0aEZpbGVUeXBlczogdHJ1ZSB9KSkge1xuICAgICAgICAgICAgICBjb25zdCBmdWxsID0gcGF0aC5qb2luKGRpciwgZS5uYW1lKTtcbiAgICAgICAgICAgICAgaWYgKGUuaXNEaXJlY3RvcnkoKSkgd2FsayhmdWxsKTtcbiAgICAgICAgICAgICAgZWxzZSBjb3VudCsrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH07XG4gICAgICAgICAgaWYgKGZzLmV4aXN0c1N5bmMocCkpIHdhbGsocCk7XG4gICAgICAgIH0gY2F0Y2gge31cbiAgICAgICAgY29uc29sZS5sb2coYFtjb3B5LXJlcG9ydF0gJHtkLnBhZEVuZCg5KX0gLT4gJHtjb3VudH0gZmlsZShzKWApO1xuICAgICAgfVxuICAgIH1cbiAgfTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgcm9vdDogcihcInB1YmxpY1wiKSxcblxuICBvcHRpbWl6ZURlcHM6IHtcbiAgICBpbmNsdWRlOiBbXCJAY291bnRyeXN0YXRlY2l0eS9jb3VudHJpZXNcIl0sXG4gIH0sXG4gIGFzc2V0c0luY2x1ZGU6IFtcbiAgICBcIioqL25vZGVfbW9kdWxlcy9AY291bnRyeXN0YXRlY2l0eS9jb3VudHJpZXMvZGlzdC9kYXRhLyouanNvblwiLFxuICAgIFwiKiovbm9kZV9tb2R1bGVzL0Bjb3VudHJ5c3RhdGVjaXR5L2NvdW50cmllcy9lczIwMjIvZGF0YS8qLmpzb25cIixcbiAgXSxcblxuICBwbHVnaW5zOiBbXG4gICAgaGFuZGxlYmFycyh7XG4gICAgICBwYXJ0aWFsRGlyZWN0b3J5OiByKFwicHVibGljL3BhcnRpYWxzXCIpLFxuICAgICAgY29udGV4dChwYWdlUGF0aCkge1xuICAgICAgICBjb25zdCByZWwgICA9IHBvc2l4KHBhZ2VQYXRoLnNwbGl0KC9cXC9wdWJsaWNcXC8vaSkucG9wKCkgfHwgXCJcIik7XG4gICAgICAgIGNvbnN0IGxhc3QyID0gcmVsLnNwbGl0KFwiL1wiKS5zbGljZSgtMikuam9pbihcIi9cIik7XG4gICAgICAgIGNvbnN0IGZpbGUgID0gcmVsLnNwbGl0KFwiL1wiKS5wb3AoKTtcblxuICAgICAgICBjb25zdCBvdmVycmlkZXMgPSB7XG4gICAgICAgICAgXCJpbmRleC5odG1sXCI6ICAgICAgICAgICAgICB7IHRpdGxlOiBcIldyZXN0bGVVdG9waWEgXHUyMDEzIEdldCBib29rZWQuIEZpbmQgdmVyaWZpZWQgdGFsZW50LlwiLCBoZWFkRXh0cmE6IGA8bWV0YSBuYW1lPVwid3UtcGFnZVwiIGNvbnRlbnQ9XCJpbmRleFwiPmAgfSxcbiAgICAgICAgICBcInByb2ZpbGUuaHRtbFwiOiAgICAgICAgICAgIHsgdGl0bGU6IFwiV3Jlc3RsZVV0b3BpYSBcdTIwMTMgTXkgUHJvZmlsZVwiLCAgICAgICAgICAgICAgICAgICAgICAgIGhlYWRFeHRyYTogYDxtZXRhIG5hbWU9XCJ3dS1wYWdlXCIgY29udGVudD1cInByb2ZpbGVcIj5gIH0sXG4gICAgICAgICAgXCJ0YWxlbnQuaHRtbFwiOiAgICAgICAgICAgICB7ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGhlYWRFeHRyYTogYDxtZXRhIG5hbWU9XCJ3dS1wYWdlXCIgY29udGVudD1cInRhbGVudFwiPmAgfSxcbiAgICAgICAgICBcImRhc2hib2FyZF93cmVzdGxlci5odG1sXCI6IHsgdGl0bGU6IFwiV3Jlc3RsZVV0b3BpYSBcdTIwMTMgV3Jlc3RsZXIgRGFzaGJvYXJkXCIsICAgICAgICAgICAgICAgaGVhZEV4dHJhOiBgPG1ldGEgbmFtZT1cInd1LXBhZ2VcIiBjb250ZW50PVwiZGFzaGJvYXJkX3dyZXN0bGVyXCI+YCB9LFxuICAgICAgICAgIFwiZGFzaGJvYXJkX3Byb21vdGVyLmh0bWxcIjogeyB0aXRsZTogXCJXcmVzdGxlVXRvcGlhIFx1MjAxMyBQcm9tb3RlciBEYXNoYm9hcmRcIiwgICAgICAgICAgICAgICBoZWFkRXh0cmE6IGA8bWV0YSBuYW1lPVwid3UtcGFnZVwiIGNvbnRlbnQ9XCJkYXNoYm9hcmRfcHJvbW90ZXJcIj5gIH0sXG4gICAgICAgICAgXCJ3L2luZGV4Lmh0bWxcIjogICAgICAgICAgICB7IHRpdGxlOiBcIldyZXN0bGVVdG9waWEgXHUyMDEzIFdyZXN0bGVyXCIsICAgICAgICAgICAgICAgICAgICAgICAgIGhlYWRFeHRyYTogYDxtZXRhIG5hbWU9XCJ3dS1wYWdlXCIgY29udGVudD1cIndfaW5kZXhcIj5gIH0sXG4gICAgICAgICAgXCJwL2luZGV4Lmh0bWxcIjogICAgICAgICAgICB7IHRpdGxlOiBcIlByb21vdGlvbiBcdTIwMTMgV3Jlc3RsZVV0b3BpYVwiLCAgICAgICAgICAgICAgICAgICAgICAgIGhlYWRFeHRyYTogYDxtZXRhIG5hbWU9XCJ3dS1wYWdlXCIgY29udGVudD1cInBfaW5kZXhcIj5gIH0sXG4gICAgICAgICAgXCJwcm9tb3Rlci9pbmRleC5odG1sXCI6ICAgICB7IHRpdGxlOiBcIldyZXN0bGVVdG9waWEgXHUyMDEzIE15IFByb21vdGlvblwiLCAgICAgICAgICAgICAgICAgICAgIGhlYWRFeHRyYTogYDxtZXRhIG5hbWU9XCJ3dS1wYWdlXCIgY29udGVudD1cInByb21vdGVyX2luZGV4XCI+YCB9XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3QgcGFnZU92ZXJyaWRlID0gb3ZlcnJpZGVzW3JlbF0gPz8gb3ZlcnJpZGVzW2xhc3QyXSA/PyBvdmVycmlkZXNbZmlsZV0gPz8gbnVsbDtcblxuICAgICAgICBjb25zdCBiYXNlID0ge1xuICAgICAgICAgIHRpdGxlOiBcIldyZXN0bGVVdG9waWEgXHUyMDEzIEluZGllIFdyZXN0bGluZyBUYWxlbnQgJiBUcnlvdXRzXCIsXG4gICAgICAgICAgZGVzY3JpcHRpb246IFwiUHJvZmlsZXMgXHUyMDIyIFRyeW91dHMgXHUyMDIyIEJvb2tpbmdzIGZvciBpbmRpZSB3cmVzdGxpbmdcIixcbiAgICAgICAgICBvZ1RpdGxlOiBcIldyZXN0bGVVdG9waWFcIixcbiAgICAgICAgICBvZ0Rlc2NyaXB0aW9uOiBcIlByb2ZpbGVzIFx1MjAyMiBUcnlvdXRzIFx1MjAyMiBCb29raW5ncyBmb3IgaW5kaWUgd3Jlc3RsaW5nXCIsXG4gICAgICAgICAgb2dJbWFnZTogXCIvYXNzZXRzL2xvZ28uc3ZnXCIsXG4gICAgICAgICAgaGVhZEV4dHJhOiBgXG4gICAgICAgICAgICA8c2NyaXB0IHR5cGU9XCJtb2R1bGVcIiBzcmM9XCIvanMvY29yZS5qc1wiPjwvc2NyaXB0PlxuICAgICAgICAgIGBcbiAgICAgICAgfTtcblxuICAgICAgICByZXR1cm4gcGFnZU92ZXJyaWRlXG4gICAgICAgICAgPyB7IC4uLmJhc2UsIC4uLnBhZ2VPdmVycmlkZSwgaGVhZEV4dHJhOiBgJHtiYXNlLmhlYWRFeHRyYX1cXG4ke3BhZ2VPdmVycmlkZS5oZWFkRXh0cmEgfHwgXCJcIn1gIH1cbiAgICAgICAgICA6IGJhc2U7XG4gICAgICB9XG4gICAgfSksXG5cbiAgICB2aXRlU3RhdGljQ29weSh7XG4gICAgICB0YXJnZXRzOiBbXG4gICAgICAgIC4uLihmcy5leGlzdHNTeW5jKHIoXCJwdWJsaWMvZ2VvXCIpKVxuICAgICAgICAgID8gW3sgc3JjOiByKFwicHVibGljL2dlby8qKi8qXCIpLCBkZXN0OiBcImdlb1wiIH1dXG4gICAgICAgICAgOiBbXSksXG4gICAgICAgICAgXG4gICAgICAgIC4uLihmcy5leGlzdHNTeW5jKHIoXCJwdWJsaWMvanNcIikpICAgICAgID8gW3sgc3JjOiByKFwicHVibGljL2pzLyoqLypcIiksICAgICAgIGRlc3Q6IFwianNcIiB9XSAgICAgICA6IFtdKSxcbiAgICAgICAgLi4uKGZzLmV4aXN0c1N5bmMocihcInB1YmxpYy9zdHlsZXNcIikpICAgPyBbeyBzcmM6IHIoXCJwdWJsaWMvc3R5bGVzLyoqLypcIiksICAgZGVzdDogXCJzdHlsZXNcIiB9XSAgIDogW10pLFxuICAgICAgICAuLi4oZnMuZXhpc3RzU3luYyhyKFwicHVibGljL2Fzc2V0c1wiKSkgICA/IFt7IHNyYzogcihcInB1YmxpYy9hc3NldHMvKiovKlwiKSwgICBkZXN0OiBcImFzc2V0c1wiIH1dICAgOiBbXSksXG4gICAgICAgIC4uLihmcy5leGlzdHNTeW5jKHIoXCJwdWJsaWMvcGFydGlhbHNcIikpID8gW3sgc3JjOiByKFwicHVibGljL3BhcnRpYWxzLyoqLypcIiksIGRlc3Q6IFwicGFydGlhbHNcIiB9XSA6IFtdKSxcbiAgICAgICAgLi4uKGZzLmV4aXN0c1N5bmMocihcInB1YmxpYy9tYW5pZmVzdC53ZWJtYW5pZmVzdFwiKSlcbiAgICAgICAgICA/IFt7IHNyYzogcihcInB1YmxpYy9tYW5pZmVzdC53ZWJtYW5pZmVzdFwiKSwgZGVzdDogXCJcIiB9XVxuICAgICAgICAgIDogW10pLFxuXG4gICAgICAgIC4uLihoYXNOb25IdG1sRmlsZXMocihcInB1YmxpYy93XCIpKVxuICAgICAgICAgID8gW3sgc3JjOiByKFwicHVibGljL3cvKiovKlwiKSwgZGVzdDogXCJ3XCIsIGdsb2JPcHRpb25zOiB7IGlnbm9yZTogW1wiKiovKi5odG1sXCJdIH0gfV1cbiAgICAgICAgICA6IFtdKSxcbiAgICAgICAgLi4uKGhhc05vbkh0bWxGaWxlcyhyKFwicHVibGljL3BcIikpXG4gICAgICAgICAgPyBbeyBzcmM6IHIoXCJwdWJsaWMvcC8qKi8qXCIpLCBkZXN0OiBcInBcIiwgZ2xvYk9wdGlvbnM6IHsgaWdub3JlOiBbXCIqKi8qLmh0bWxcIl0gfSB9XVxuICAgICAgICAgIDogW10pLFxuICAgICAgICAuLi4oaGFzTm9uSHRtbEZpbGVzKHIoXCJwdWJsaWMvcHJvbW90ZXJcIikpXG4gICAgICAgICAgPyBbeyBzcmM6IHIoXCJwdWJsaWMvcHJvbW90ZXIvKiovKlwiKSwgZGVzdDogXCJwcm9tb3RlclwiLCBnbG9iT3B0aW9uczogeyBpZ25vcmU6IFtcIioqLyouaHRtbFwiXSB9IH1dXG4gICAgICAgICAgOiBbXSksXG4gICAgICBdLFxuICAgIH0pLFxuXG4gICAgY29weVJlcG9ydFBsdWdpbigpLFxuICBdLFxuXG4gIGJ1aWxkOiB7XG4gICAgb3V0RGlyOiByKFwiZGlzdFwiKSxcbiAgICBlbXB0eU91dERpcjogdHJ1ZSxcbiAgICBhc3NldHNJbmxpbmVMaW1pdDogMCxcbiAgICBjc3NDb2RlU3BsaXQ6IHRydWUsXG4gICAgc291cmNlbWFwOiBmYWxzZSxcbiAgICBtaW5pZnk6IGZhbHNlLFxuXG4gICAgcm9sbHVwT3B0aW9uczoge1xuICAgICAgaW5wdXQ6IHtcbiAgICAgICAgaW5kZXg6ICAgICAgICAgICAgICAgcihcInB1YmxpYy9pbmRleC5odG1sXCIpLFxuICAgICAgICBwcml2YWN5OiAgICAgICAgICAgICByKFwicHVibGljL3ByaXZhY3kuaHRtbFwiKSxcbiAgICAgICAgdGVybXM6ICAgICAgICAgICAgICAgcihcInB1YmxpYy90ZXJtcy5odG1sXCIpLFxuICAgICAgICB0cnlvdXRzOiAgICAgICAgICAgICByKFwicHVibGljL3RyeW91dHMuaHRtbFwiKSxcbiAgICAgICAgcHJvZmlsZTogICAgICAgICAgICAgcihcInB1YmxpYy9wcm9maWxlLmh0bWxcIiksXG4gICAgICAgIHRhbGVudDogICAgICAgICAgICAgIHIoXCJwdWJsaWMvdGFsZW50Lmh0bWxcIiksXG4gICAgICAgIGRhc2hib2FyZF93cmVzdGxlcjogIHIoXCJwdWJsaWMvZGFzaGJvYXJkX3dyZXN0bGVyLmh0bWxcIiksXG4gICAgICAgIGRhc2hib2FyZF9wcm9tb3RlcjogIHIoXCJwdWJsaWMvZGFzaGJvYXJkX3Byb21vdGVyLmh0bWxcIiksXG4gICAgICAgIHdfaW5kZXg6ICAgICAgICAgICAgIHIoXCJwdWJsaWMvdy9pbmRleC5odG1sXCIpLFxuICAgICAgICBwX2luZGV4OiAgICAgICAgICAgICByKFwicHVibGljL3AvaW5kZXguaHRtbFwiKSxcbiAgICAgICAgcHJvbW90ZXJfaW5kZXg6ICAgICAgcihcInB1YmxpYy9wcm9tb3Rlci9pbmRleC5odG1sXCIpLFxuICAgICAgfSxcblxuICAgICAgdHJlZXNoYWtlOiBmYWxzZSxcblxuICAgICAgb3V0cHV0OiB7XG4gICAgICAgIGVudHJ5RmlsZU5hbWVzOiBcImpzL1tuYW1lXS5qc1wiLFxuICAgICAgICBjaHVua0ZpbGVOYW1lczogXCJqcy9bbmFtZV0uanNcIixcbiAgICAgICAgYXNzZXRGaWxlTmFtZXMoaW5mbykge1xuICAgICAgICAgIGNvbnN0IGV4dCA9IHBhdGguZXh0bmFtZShpbmZvLm5hbWUgfHwgXCJcIikudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICBpZiAoZXh0ID09PSBcIi5jc3NcIikgcmV0dXJuIFwic3R5bGVzL1tuYW1lXVtleHRuYW1lXVwiO1xuICAgICAgICAgIGlmIChbXCIucG5nXCIsXCIuanBnXCIsXCIuanBlZ1wiLFwiLmdpZlwiLFwiLndlYnBcIixcIi5hdmlmXCIsXCIuc3ZnXCJdLmluY2x1ZGVzKGV4dCkpIHJldHVybiBcImFzc2V0cy9bbmFtZV1bZXh0bmFtZV1cIjtcbiAgICAgICAgICBpZiAoW1wiLndvZmZcIixcIi53b2ZmMlwiLFwiLnR0ZlwiLFwiLm90ZlwiLFwiLmVvdFwiXS5pbmNsdWRlcyhleHQpKSByZXR1cm4gXCJhc3NldHMvZm9udHMvW25hbWVdW2V4dG5hbWVdXCI7XG4gICAgICAgICAgaWYgKFtcIi5tcDRcIixcIi53ZWJtXCIsXCIubXAzXCIsXCIud2F2XCIsXCIub2dnXCJdLmluY2x1ZGVzKGV4dCkpIHJldHVybiBcImFzc2V0cy9tZWRpYS9bbmFtZV1bZXh0bmFtZV1cIjtcbiAgICAgICAgICByZXR1cm4gXCJhc3NldHMvW25hbWVdW2V4dG5hbWVdXCI7XG4gICAgICAgIH0s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
