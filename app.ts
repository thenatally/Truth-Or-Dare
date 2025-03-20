import "dotenv/config";
import express, { Request, Response } from "express";
import { InteractionType, InteractionResponseType } from "discord-interactions";
import { VerifyDiscordRequest } from "./utils.js";

const app = express();
const PORT = process.env.PORT || 3000;
const API_BASE_URL = "https://api.truthordarebot.xyz/v1";
const ALLOWED_MENTIONS = { parse: [] };

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

app.post("/interactions", async function (req: Request, res: Response) {
  const { type, data } = req.body;

  if (type === InteractionType.PING) {
    return res.send({ type: InteractionResponseType.PONG });
  }

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
      const result = await response.json();
      const embed = {
        title: result.question,
        color: getColor(name, rating),
        footer: {
          text: `Type: ${result.type} | Rating: ${result.rating} | ID: ${result.id}`,
        },
      };

      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { embeds: [embed], allowed_mentions: ALLOWED_MENTIONS },
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
});

app.listen(PORT, () => {
  console.log("Listening on port", PORT);
});
