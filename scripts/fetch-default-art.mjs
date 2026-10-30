// Downloads the five default land printings (W-62, I-40). Run by a developer, never at build or runtime.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULTS = {
  Plains: "4ef17ed4-a9b5-4b8e-b4cb-2ecb7e5898c3",
  Island: "23635e40-d040-40b7-8b98-90ed362aa028",
  Swamp: "13505c15-14e0-4200-82bd-fb9bce949e68",
  Mountain: "1edc5050-69bd-416d-b04c-7f82de2a1901",
  Forest: "d232fcc2-12f6-401a-b1aa-ddff11cb9378",
};
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "web", "public", "art", "default");
const contact = process.env.CONTACT_EMAIL ?? "you@example.com";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, accept) {
  await sleep(120);
  const res = await fetch(url, { headers: { "User-Agent": `BasicLandGame/0.1 (${contact})`, Accept: accept } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res;
}

await mkdir(out, { recursive: true });
const manifest = {};
for (const [land, id] of Object.entries(DEFAULTS)) {
  const card = await (await get(`https://api.scryfall.com/cards/${id}`, "application/json")).json();
  for (const v of ["art_crop", "normal"]) {
    const buf = Buffer.from(await (await get(card.image_uris[v], "image/jpeg,image/*;q=0.9")).arrayBuffer());
    await writeFile(join(out, `${land}.${v}.jpg`), buf);
  }
  manifest[land] = { id, set: card.set, setName: card.set_name, collectorNumber: card.collector_number, artist: card.artist };
  console.log(land, card.set, card.collector_number, card.artist);
}
await writeFile(join(out, "default-art.json"), JSON.stringify(manifest, null, 2) + "\n");
