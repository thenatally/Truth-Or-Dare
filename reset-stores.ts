import { Store } from "./surrealdb.js";

async function resetStores() {
  const stores = [
    new Store<{ ids: string[] }>("suggested_ids", { ids: [] }),
    new Store<{ map: Record<string, string> }>("suggestion_text_map", { map: {} }),
    new Store<{ questions: any[] }>("questions", { questions: [] }),
  ];

  for (const store of stores) {
    //@ts-ignore
    await store.setData(store.defaultV);
    console.log(`Reset store: ${store.constructor.name}`);
  }
  console.log("All stores reset.");
}

resetStores().catch((err) => {
  console.error("Error resetting stores:", err);
  process.exit(1);
});
