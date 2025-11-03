import {
  getCountries,
  getStatesOfCountry,
  getCitiesOfState,
} from "@countrystatecity/countries";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const OUT = "public/geo";
const CCODES = ["US", "CA", "MX"];

async function main() {
  await mkdir(OUT, { recursive: true });

  const all = await getCountries();
  const na = all
    .filter((c) => CCODES.includes(c.iso2))
    .map((c) => ({ code: c.iso2, name: c.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  await writeFile(join(OUT, "countries.v1.json"), JSON.stringify(na));

  for (const cc of CCODES) {
    const states = await getStatesOfCountry(cc);
    const regions = states
      .map((s) => ({ code: s.iso2, name: s.name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    await writeFile(join(OUT, `regions_${cc}.v1.json`), JSON.stringify(regions));
    await mkdir(join(OUT, cc), { recursive: true });

    for (const s of regions) {
      const cities = await getCitiesOfState(cc, s.code);
      const names = cities.map((c) => c.name).sort((a, b) => a.localeCompare(b));
      await writeFile(join(OUT, cc, `cities_${s.code}.v1.json`), JSON.stringify(names));
    }
  }
}

main().catch((e) => {
  console.error("[build-geo-na] failed:", e);
  process.exit(1);
});
