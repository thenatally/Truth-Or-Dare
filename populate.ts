import "dotenv/config";
import { randomUUID } from "crypto";
import { Store } from "./surrealdb.js";
import fs from "fs/promises";

const API_BASE_URL = "https://api.truthordarebot.xyz/v1";
const SUGGESTION_CHANNEL_ID = process.env.SUGGESTION_CHANNEL_ID;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

if (!SUGGESTION_CHANNEL_ID || !DISCORD_TOKEN) {
  console.error("Missing required environment variables.");
  process.exit(1);
}

const suggestedIdsStore = new Store<{ ids: string[] }>("suggested_ids", {
  ids: [],
});
const suggestionTextStore = new Store<
  { map: Record<string, { text: string; rating: string }> }
>("suggestion_text_map", { map: {} });

type Question = {
  id: string;
  question: string;
  rating: string;
};

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchQuestion(type: string): Promise<Question> {
  const response = await fetch(
    `${API_BASE_URL}/${
      type.toLowerCase() === "would-you-rather" ? "wyr" : type.toLowerCase()
    }`,
  );
  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${type} questions: ${response.statusText}`,
    );
  }
  const data = await response.json();
  return data as Question;
}

function getColorByType(type: string): number {
  return type === "TRUTH" ? 0x00cc66 : type === "DARE" ? 0xcc0033 : 0x3399ff;
}

function escapeCustomIdValue(input: string): string {
  return input.replace(/[^a-z0-9_-]/gi, "_").slice(0, 80);
}

async function sendSuggestion(question: string, type: string, rating: string) {
  const idSuffix = randomUUID().slice(0, 8);
  const data = await suggestionTextStore.getData();
  data.map[idSuffix] = { text: question, rating };
  await suggestionTextStore.setData(data);

  const suggestionMsg = [
    {
      type: 17,
      accent_color: getColorByType(type),
      spoiler: false,
      components: [
        {
          type: 10,
          content:
            `new ${type} suggestion:\n${question}\n-# ${type} | ${rating} | automated`,
        },
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 3,
              label: "Accept",
              emoji: null,
              disabled: false,
              custom_id: `accept_${type}_${idSuffix}_${rating}`,
            },
            {
              type: 2,
              style: 1,
              label: "Edit",
              emoji: null,
              disabled: false,
              custom_id: `editmodal_${type}_${idSuffix}_${rating}`,
            },
            {
              type: 2,
              style: 4,
              label: "Deny",
              emoji: null,
              disabled: false,
              custom_id: `deny_${type}_${idSuffix}_${rating}`,
            },
          ],
        },
      ],
    },
  ];

  const response = await fetch(
    `https://discord.com/api/v10/channels/${SUGGESTION_CHANNEL_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bot ${DISCORD_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        components: suggestionMsg,
        flags: 1 << 15,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to send suggestion: ${response.statusText}`);
  }
}

async function isAlreadySuggested(id: string): Promise<boolean> {
  const data = await suggestedIdsStore.getData();
  return data.ids.includes(id);
}

async function markAsSuggested(id: string) {
  await suggestedIdsStore.update((data) => {
    if (!data.ids.includes(id)) data.ids.push(id);
    return data;
  });
}

async function populateSuggestions() {
  for (const type of ["TRUTH", "DARE", "WOULD-YOU-RATHER"]) {
    for (let i = 0; i < 100; i++) {
      try {
        const q = await fetchQuestion(type);
        if (!(await isAlreadySuggested(q.id))) {
          await sendSuggestion(q.question, type, q.rating);
          await markAsSuggested(q.id);
          console.log(`Suggested: "${q.question}" (${type})`);
        } else {
          console.log(`Skipped duplicate: "${q.question}" (${type})`);
        }
        await delay(1000);
      } catch (err) {
        console.error(`Error on ${type} #${i}:`, err);
        await delay(2000);
      }
    }
  }
}

async function backgroundSuggestLoop() {
  const types = ["TRUTH", "DARE", "WOULD-YOU-RATHER"];
  while (true) {
    const type = types[Math.floor(Math.random() * types.length)];
    try {
      const q = await fetchQuestion(type);
      if (!(await isAlreadySuggested(q.id))) {
        await sendSuggestion(q.question, type, q.rating);
        await markAsSuggested(q.id);
        console.log(`[BG] Suggested: "${q.question}" (${type})`);
      } else {
        console.log(`[BG] Skipped duplicate: "${q.question}" (${type})`);
      }
    } catch (err) {
      console.error(`[BG] Error on ${type}:`, err);
    }
    await delay(60 * 60 * 1000);
  }
}



if (process.env.NODE_ENV === "production") {
  backgroundSuggestLoop().catch((error) => {
    console.error("Fatal error in background suggestion loop:", error);
  });
} else {
  populateSuggestions()
}
