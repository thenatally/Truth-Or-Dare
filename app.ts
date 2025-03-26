import "dotenv/config";
import express, { Request, Response } from "express";
import { InteractionType, InteractionResponseType } from "discord-interactions";
import { VerifyDiscordRequest } from "./utils.js";

const app = express();
const PORT = process.env.PORT || 3000;
const API_BASE_URL = "https://api.truthordarebot.xyz/v1";
const ALLOWED_MENTIONS = { parse: [] };
let tokens: Record<string, string> = {};
// Color definitions
const COLOR_MAP: any = {
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
function hslToColorInt(h: number, s: number, l: number): number {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - a * Math.max(Math.min(k(n) - 3, 9 - k(n), 1), -1);

  return (
    (Math.round(f(0) * 255) << 16) |
    (Math.round(f(8) * 255) << 8) |
    Math.round(f(4) * 255)
  );
}

// Get color based on type and rating
function getColor(type: string, rating: string | undefined): number {
  const hue = COLOR_MAP.typeHues[type] ?? 0;
  const saturation = rating ? COLOR_MAP.ratingSaturations[rating] ?? 100 : 100;
  return hslToColorInt(hue, saturation, 50);
}

app.use(
  express.json({ verify: VerifyDiscordRequest(process.env.PUBLIC_KEY!) })
);

async function removeComponents(
  messageId: string,
  channelId: string,
  botToken: string
): Promise<void> {
  const url = `https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`;
  try {
    const response = await fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ components: [] }),
    });

    if (!response.ok) {
      console.error(`Failed to remove components: ${response.statusText}`);
    }
  } catch (error) {
    console.error("Error removing components:", error);
  }
}

app.post("/interactions", async function (req: Request, res: Response) {
  const { type, data } = req.body;

  if (type === InteractionType.PING) {
    return res.send({ type: InteractionResponseType.PONG });
  }
  // console.log(tokens);
  // console.log(req.body);
  tokens[req.body.id] = req.body.token;

  if (type === InteractionType.APPLICATION_COMMAND) {
    const { name, options } = data;
    const rating = options?.find(
      (option: any) => option.name === "rating"
    )?.value;
    const apiUrl = `${API_BASE_URL}/${
      name === "truth" ? "truth" : name === "dare" ? "dare" : "wyr"
    }${rating ? `?rating=${rating}` : ""}`;

    if (undefined == COLOR_MAP.typeHues[name]) {
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: "Unknown command",
          allowed_mentions: ALLOWED_MENTIONS,
        },
      });
    }

    try {
      const response = await fetch(apiUrl);

      if (response.status === 429) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: "Rate limit exceeded. Please try again later.",
            allowed_mentions: ALLOWED_MENTIONS,
          },
        });
      }

      const result = await response.json();
      const embed = {
        title: result.question,
        color: getColor(name, rating),
        footer: {
          text: `Type: ${result.type} | Rating: ${result.rating} | ID: ${result.id}`,
        },
      };

      const components = [
        {
          type: 1, // Action row
          components: [
            {
              type: 2, // Button
              style: 1, // Primary
              label: "Truth",
              custom_id: `new_truth_${rating || "default"}`,
            },
            {
              type: 2, // Button
              style: 4, // Danger
              label: "Dare",
              custom_id: `new_dare_${rating || "default"}`,
            },
            {
              type: 2, // Button
              style: 2, // Secondary
              label: "Would You Rather",
              custom_id: `new_wyr_${rating || "default"}`,
            },
          ],
        },
      ];

      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [embed],
          components,
          allowed_mentions: ALLOWED_MENTIONS,
        },
      });
    } catch (error) {
      console.error(error);
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: "Failed to fetch data from the API.",
          allowed_mentions: ALLOWED_MENTIONS,
        },
      });
    }
  }

  if (type === InteractionType.MESSAGE_COMPONENT) {
    const [action, name, rating] = data.custom_id.split("_");

    const originalMessageInteractionId =
      req.body.message.interaction_metadata.id;

    const originalMessageInteractionToken =
      tokens[originalMessageInteractionId];
    // /webhooks/{application.id}/{interaction.token}/messages/@original
    await fetch(
      `https://discord.com/api/v10/webhooks/${process.env.APP_ID}/${originalMessageInteractionToken}/messages/@original`,
      {
        method: "PATCH",
        headers: {
          // Authorization: `Bot ${process.env.BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          components: [],
        }),
      }
    );
    delete tokens[originalMessageInteractionId];

    // console.log(`Response from Discord API: ${r.status} ${await r.text()}`);

    if (action === "new") {
      const apiUrl = `${API_BASE_URL}/${
        name === "truth" ? "truth" : name === "dare" ? "dare" : "wyr"
      }${rating !== "default" ? `?rating=${rating}` : ""}`;

      try {
        const response = await fetch(apiUrl);

        if (response.status === 429) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: "Rate limit exceeded. Please try again later.",
              allowed_mentions: ALLOWED_MENTIONS,
            },
          });
        }

        const result = await response.json();
        const embed = {
          title: result.question,
          color: getColor(name, rating !== "default" ? rating : undefined),
          footer: {
            text: `Type: ${result.type} | Rating: ${result.rating} | ID: ${result.id}`,
          },
        };

        const components = [
          {
            type: 1, // Action row
            components: [
              {
                type: 2, // Button
                style: 1, // Primary
                label: "Truth",
                custom_id: `new_truth_${rating || "default"}`,
              },
              {
                type: 2, // Button
                style: 4, // Danger
                label: "Dare",
                custom_id: `new_dare_${rating || "default"}`,
              },
              {
                type: 2, // Button
                style: 2, // Secondary
                label: "Would You Rather",
                custom_id: `new_wyr_${rating || "default"}`,
              },
            ],
          },
        ];

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            embeds: [embed],
            components,
            allowed_mentions: ALLOWED_MENTIONS,
          },
        });
      } catch (error) {
        console.error(error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: "Failed to fetch data from the API.",
            allowed_mentions: ALLOWED_MENTIONS,
          },
        });
      }
    }
  }
});
app.get("/", (req: Request, res: Response) => {
  //redirect to auth link
  res.redirect(
    `https://discord.com/oauth2/authorize?client_id=${process.env.APP_ID}`
  );
});
app.listen(PORT, () => {
  console.log("Listening on port", PORT);
});
