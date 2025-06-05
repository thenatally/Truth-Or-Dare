import fs from "fs/promises";
import path from "path";
import { Store } from "./surrealdb.js";

const stores = [
  new Store<{ ids: string[] }>("suggested_ids", { ids: [] }),
  new Store<{ map: Record<string, any> }>("suggestion_text_map", { map: {} }),
  new Store<{ questions: any[] }>("questions", { questions: [] }),
];

const DATA_DIR = path.join(process.cwd(), "data", "export");

async function exportStores() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  for (const store of stores) {
    // @ts-ignore
    const data = await store.getData();
    const file = path.join(DATA_DIR, `${store["name"]}.json`);
    await fs.writeFile(file, JSON.stringify(data, null, 2));
    console.log(`Exported ${store["name"]} to ${file}`);
  }
}

function merge(target: any, source: any): any {
  if (Array.isArray(target) && Array.isArray(source)) {
    // Merge arrays by union
    return Array.from(new Set([...target, ...source]));
  }
  if (typeof target === "object" && typeof source === "object") {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      if (key in result) {
        result[key] = merge(result[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }
  return source;
}

async function importStores() {
  for (const store of stores) {
    const file = path.join(DATA_DIR, `${store["name"]}.json`);
    try {
      const fileData = await fs.readFile(file, "utf-8");
      const importData = JSON.parse(fileData);
      // @ts-ignore
      const currentData = await store.getData();
      const merged = merge(currentData, importData);
      // @ts-ignore
      await store.setData(merged);
      console.log(`Imported and merged ${store["name"]} from ${file}`);
    } catch (e: any) {
      if (e.code === "ENOENT") {
        console.warn(`No export file for ${store["name"]}, skipping.`);
      } else {
        throw e;
      }
    }
  }
}

if (process.argv[2] === "export") {
  exportStores();
} else if (process.argv[2] === "import") {
  importStores();
}

export { exportStores, importStores };
