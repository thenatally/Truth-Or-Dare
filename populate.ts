import "dotenv/config";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

const API_BASE_URL = "https://api.truthordarebot.xyz/v1";
const SUGGESTION_CHANNEL_ID = process.env.SUGGESTION_CHANNEL_ID;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

if (!SUGGESTION_CHANNEL_ID || !DISCORD_TOKEN) {
  console.error("Missing required environment variables.");
  process.exit(1);
}

const dbPromise = open({
  filename: "./data.db",
  driver: sqlite3.Database,
});

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchQuestions(type: string) {
  const response = await fetch(`${API_BASE_URL}/${type.toLowerCase()}`);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${type} questions: ${response.statusText}`
    );
  }
  return response.json();
}

async function sendSuggestion(question: string, type: string, rating: string) {
  const body = {
    embeds: [
      {
        title: "New Question Suggestion",
        description: question,
        fields: [
          { name: "Type", value: type, inline: true },
          { name: "Rating", value: rating, inline: true },
        ],
        color: type === "TRUTH" ? 120 : type === "DARE" ? 0 : 210, // Green, Red, Blue
      },
    ],
    content: `Automated suggestion for ${type.toLowerCase()}`,
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 3,
            label: "Accept",
            custom_id: `accept_${type}_${question}_${rating}`,
          },
          {
            type: 2,
            style: 4,
            label: "Deny",
            custom_id: `deny_${type}_${question}_${rating}`,
          },
        ],
      },
    ],
  };

  await fetch(
    `https://discord.com/api/v10/channels/${SUGGESTION_CHANNEL_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bot ${DISCORD_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );
}

async function initializeDatabase() {
  const db = await dbPromise;
  await db.run(`
    CREATE TABLE IF NOT EXISTS suggested_ids (
      id TEXT PRIMARY KEY
    )
  `);
}

async function isAlreadySuggested(id: string) {
  const db = await dbPromise;
  const result = await db.get("SELECT 1 FROM suggested_ids WHERE id = ?", [id]);
  return !!result;
}

async function markAsSuggested(id: string) {
  const db = await dbPromise;
  await db.run("INSERT INTO suggested_ids (id) VALUES (?)", [id]);
}

async function populateSuggestions() {
  const db = await dbPromise;
  await initializeDatabase(); // Ensure the table exists

  for (const type of ["TRUTH", "DARE", "WOULD-YOU-RATHER"]) {
    for (let i = 0; i < 100; i++) {
      // Loop 100 times for each mode
      const question = await fetchQuestions(type); // Fetch a single question

      const alreadySuggested = await isAlreadySuggested(question.id);

      if (!alreadySuggested) {
        await sendSuggestion(question.question, type, question.rating);
        await markAsSuggested(question.id);
        console.log(`Suggested: ${question.question} (${type})`);
      } else {
        console.log(`Skipped duplicate: ${question.question} (${type})`);
      }

      await delay(1000); // 1 second delay between requests
    }
  }
}

populateSuggestions()
  .then(() => {
    console.log("Finished populating suggestions.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error populating suggestions:", error);
    process.exit(1);
  });
