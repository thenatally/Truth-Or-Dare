import "dotenv/config";
import express from "express";
import { InteractionType, InteractionResponseType } from "discord-interactions";
import { VerifyDiscordRequest, initializeDatabase } from "./utils.js";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
const app = express();
const PORT = process.env.PORT || 3000;
const ALLOWED_MENTIONS = { parse: [] };
let tokens = {};
// Open SQLite database
const dbPromise = open({
    filename: "./data.db",
    driver: sqlite3.Database,
});
// Color definitions
const COLOR_MAP = {
    typeHues: {
        truth: 120, // Green
        dare: 0, // Red
        "would-you-rather": 210, // Blue
    },
    ratingSaturations: {
        pg: 50,
        pg13: 75,
        r: 100,
    },
};
// Convert HSL to integer color value for Discord embeds
function hslToColorInt(h, s, l) {
    s /= 100;
    l /= 100;
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(Math.min(k(n) - 3, 9 - k(n), 1), -1);
    return ((Math.round(f(0) * 255) << 16) |
        (Math.round(f(8) * 255) << 8) |
        Math.round(f(4) * 255));
}
// Get color based on type and rating
function getColor(type, rating) {
    const hue = COLOR_MAP.typeHues[type] ?? 0;
    const saturation = rating ? COLOR_MAP.ratingSaturations[rating] ?? 100 : 100;
    return hslToColorInt(hue, saturation, 50);
}
async function handleQuestionCommand(name, rating) {
    rating ?? (rating = Math.random() < 0.5 ? "pg" : "pg13");
    console.log(`Handling command: ${name}, Rating: ${rating}`);
    const db = await dbPromise;
    const query = `
    SELECT * FROM commands
    WHERE type = ? AND (rating = ? OR rating IS NULL)
    ORDER BY RANDOM() LIMIT 1
  `;
    const result = await db.get(query, [name.toUpperCase(), rating]);
    if (!result) {
        return {
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: "No data found for the requested command.",
                allowed_mentions: ALLOWED_MENTIONS,
            },
        };
    }
    const embed = {
        title: result.question,
        color: getColor(name, rating),
        footer: {
            text: `Type: ${result.type} | Rating: ${result.rating} | ID: ${result.id}`,
        },
    };
    const components = [
        {
            type: 1,
            components: [
                {
                    type: 2,
                    style: 1,
                    label: "Truth",
                    custom_id: `new_TRUTH_${rating || "default"}`,
                },
                {
                    type: 2,
                    style: 4,
                    label: "Dare",
                    custom_id: `new_DARE_${rating || "default"}`,
                },
                {
                    type: 2,
                    style: 2,
                    label: "Would You Rather",
                    custom_id: `new_WYR_${rating || "default"}`,
                },
            ],
        },
    ];
    return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
            embeds: [embed],
            components,
            allowed_mentions: ALLOWED_MENTIONS,
        },
    };
}
app.use(express.json({ verify: VerifyDiscordRequest(process.env.PUBLIC_KEY) }));
app.post("/interactions", async function (req, res) {
    const { type, data } = req.body;
    if (type === InteractionType.PING) {
        return res.send({ type: InteractionResponseType.PONG });
    }
    tokens[req.body.id] = req.body.token;
    if (type === InteractionType.APPLICATION_COMMAND) {
        const { name, options } = data;
        if (name === "suggest-command") {
            const questionType = options?.find((opt) => opt.name === "type")?.value;
            const suggestion = options?.find((opt) => opt.name === "suggestion")?.value;
            const rating = options?.find((opt) => opt.name === "rating")?.value;
            const channelId = process.env.SUGGESTION_CHANNEL_ID;
            if (!channelId) {
                return res.send({
                    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                    data: {
                        content: "Suggestion channel is not configured.",
                        allowed_mentions: ALLOWED_MENTIONS,
                    },
                });
            }
            // console.log(req.body);
            const userId = req.body.user?.id || req.body.member?.user?.id;
            const components = [
                {
                    type: 1,
                    components: [
                        {
                            type: 2,
                            style: 3,
                            label: "Accept",
                            custom_id: `accept_${questionType}_${suggestion}_${rating}`,
                        },
                        {
                            type: 2,
                            style: 4,
                            label: "Deny",
                            custom_id: `deny_${questionType}_${suggestion}_${rating}`,
                        },
                    ],
                },
            ];
            await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
                method: "POST",
                headers: {
                    Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    embeds: [
                        {
                            title: "New Question Suggestion",
                            description: suggestion,
                            fields: [
                                { name: "Type", value: questionType, inline: true },
                                { name: "Rating", value: rating || "None", inline: true },
                            ],
                            color: getColor(questionType, rating),
                        },
                    ],
                    components,
                    content: `suggestion from <@${userId}>`,
                }),
            });
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: "Your suggestion has been sent for review.",
                    allowed_mentions: ALLOWED_MENTIONS,
                    flags: 64, // Make the message ephemeral
                },
            });
        }
        console.log(options);
        const rating = (options?.find((opt) => opt.name === "rating")?.value ??
            Math.random() < 0.5)
            ? "pg"
            : "pg13";
        const response = await handleQuestionCommand(name, rating);
        return res.send(response);
    }
    if (type === InteractionType.MESSAGE_COMPONENT ||
        type === InteractionType.MODAL_SUBMIT) {
        const [action, questionType, suggestion, rating] = data.custom_id.split("_");
        console.log(`Action: ${action}, Type: ${questionType}, Suggestion: ${suggestion}, Rating: ${rating}`);
        if (action === "new") {
            const originalMessageInteractionId = req.body.message.interaction_metadata.id;
            const originalMessageInteractionToken = tokens[originalMessageInteractionId];
            // /webhooks/{application.id}/{interaction.token}/messages/@original
            fetch(`https://discord.com/api/v10/webhooks/${process.env.APP_ID}/${originalMessageInteractionToken}/messages/@original`, {
                method: "PATCH",
                headers: {
                    // Authorization: `Bot ${process.env.BOT_TOKEN}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    components: [],
                }),
            });
            //edit normaly just in case in server
            fetch(`https://discord.com/api/v10/channels/${req.body.channel_id}/messages/${req.body.message.id}`, {
                method: "PATCH",
                headers: {
                    Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    components: [],
                }),
            });
            const response = await handleQuestionCommand(questionType, rating === "default" ? (Math.random() < 0.5 ? "pg" : "pg13") : rating);
            return res.send(response);
        }
        if (action === "accept") {
            return res.send({
                type: InteractionResponseType.MODAL,
                data: {
                    custom_id: `edit_${questionType}_${suggestion}_${rating}`,
                    title: "Edit Suggestion",
                    components: [
                        {
                            type: 1,
                            components: [
                                {
                                    type: 4,
                                    custom_id: "edited_question",
                                    style: 1,
                                    label: "Edit Question",
                                    value: suggestion,
                                    required: true,
                                },
                            ],
                        },
                        {
                            type: 1,
                            components: [
                                {
                                    type: 4,
                                    custom_id: "edited_rating",
                                    style: 1,
                                    label: "Edit Rating",
                                    value: rating,
                                    required: true,
                                },
                            ],
                        },
                    ],
                },
            });
        }
        if (action.startsWith("edit")) {
            const editedQuestion = data.components[0].components.find((c) => c.custom_id === "edited_question")?.value;
            const editedRating = data.components[1].components
                .find((c) => c.custom_id === "edited_rating")
                ?.value.toLowerCase();
            const db = await dbPromise;
            await db.run("INSERT INTO commands (type, question, rating) VALUES (?, ?, ?)", [questionType, editedQuestion, editedRating]);
            console.log(`Inserted into commands table: Type=${questionType}, Question="${editedQuestion}", Rating=${editedRating}`);
            return res.send({
                type: InteractionResponseType.UPDATE_MESSAGE,
                data: {
                    allowed_mentions: ALLOWED_MENTIONS,
                    components: [], // Remove buttons after acceptance
                    embeds: [
                        {
                            title: "Suggestion Accepted",
                            description: `Suggestion accepted: "${editedQuestion}"\nType: ${questionType}\nRating: ${editedRating}`,
                            fields: [
                                { name: "Type", value: questionType, inline: true },
                                { name: "Rating", value: editedRating || "None", inline: true },
                            ],
                            color: getColor(questionType, editedRating),
                        },
                    ],
                },
            });
        }
        if (action === "deny") {
            return res.send({
                type: InteractionResponseType.UPDATE_MESSAGE,
                data: {
                    allowed_mentions: ALLOWED_MENTIONS,
                    components: [], // Remove buttons after denial
                    embeds: [
                        {
                            title: "Suggestion Denied",
                            description: `Suggestion denied: "${suggestion}"\nType: ${questionType}\nRating: ${rating}`,
                            fields: [
                                { name: "Type", value: questionType, inline: true },
                                { name: "Rating", value: rating || "None", inline: true },
                            ],
                            color: getColor(questionType, rating),
                        },
                    ],
                },
            });
        }
    }
});
app.get("/", (req, res) => {
    //redirect to auth link
    res.redirect(`https://discord.com/oauth2/authorize?client_id=${process.env.APP_ID}`);
});
(async () => {
    await initializeDatabase(); // Initialize the database
    app.listen(PORT, () => {
        console.log("Listening on port", PORT);
    });
})();
