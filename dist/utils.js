import "dotenv/config";
import { verifyKey } from "discord-interactions";
import { open } from "sqlite";
import sqlite3 from "sqlite3";
export function VerifyDiscordRequest(clientKey) {
    return function (req, res, buf) {
        const signature = req.get("X-Signature-Ed25519");
        const timestamp = req.get("X-Signature-Timestamp");
        console.log(signature, timestamp, clientKey);
        const isValidRequest = verifyKey(buf, signature, timestamp, clientKey);
        if (!isValidRequest) {
            res.status(401).send("Bad request signature");
            throw new Error("Bad request signature");
        }
    };
}
export async function DiscordRequest(endpoint, options) {
    const url = "https://discord.com/api/v10/" + endpoint;
    if (options.body)
        options.body = JSON.stringify(options.body);
    const res = await fetch(url, {
        headers: {
            Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
            "Content-Type": "application/json; charset=UTF-8",
            "User-Agent": "DiscordBot (https://github.com/discord/discord-example-app, 1.0.0)",
        },
        ...options,
    });
    if (!res.ok) {
        const data = await res.json();
        console.log(res.status);
        throw new Error(JSON.stringify(data));
    }
    return res;
}
export async function InstallGlobalCommands(appId, commands) {
    const endpoint = `applications/${appId}/commands`;
    try {
        await DiscordRequest(endpoint, { method: "PUT", body: commands });
        console.log(commands);
    }
    catch (err) {
        console.error(err);
    }
}
export function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}
export async function initializeDatabase() {
    const db = await open({
        filename: "./data.db",
        driver: sqlite3.Database,
    });
    // Create the commands table if it does not exist
    await db.exec(`
    CREATE TABLE IF NOT EXISTS commands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      question TEXT NOT NULL,
      rating TEXT
    )
  `);
    return db;
}
