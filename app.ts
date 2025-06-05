import express from "express";
import dotenv from "dotenv";
import {
  InteractionResponseType,
  InteractionType,
  verifyKeyMiddleware,
} from "discord-interactions";
import { connectDB, Store } from "./surrealdb.js";

dotenv.config();
const app = express();

const PORT = parseInt(process.env.PORT || "3000");

// console.log(process.env.DISCORD_TOKEN, process.env.PUBLIC_KEY);

const COLOR_MAP = {
  typeHues: {
    truth: 120,
    dare: 0,
    "would-you-rather": 210,
  } as Record<string, number>,
  ratingSaturations: {
    pg: 50,
    pg13: 75,
    r: 100,
  } as Record<string, number>,
};

type QuestionData = {
  id: string;
  type: string;
  rating: string;
  question: string;
};

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

function storeToken(id: string, token: string) {
  tokenCache.set(id, { token, expiresAt: Date.now() + 10 * 60 * 1000 });
}

function getToken(id: string) {
  const entry = tokenCache.get(id);
  if (!entry || entry.expiresAt < Date.now()) {
    tokenCache.delete(id);
    return null;
  }
  return entry.token;
}

function buildCommandButtonsV2(rating: string) {
  return [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 2,
          label: "Truth",
          emoji: null,
          disabled: false,
          custom_id: `new_TRUTH_${rating}`,
        },
        {
          type: 2,
          style: 2,
          label: "Dare",
          emoji: null,
          disabled: false,
          custom_id: `new_DARE_${rating}`,
        },
        {
          type: 2,
          style: 2,
          label: "Would You Rather",
          emoji: null,
          disabled: false,
          custom_id: `new_WYR_${rating}`,
        },
      ],
    },
  ];
}

function buildQuestionMessage(
  type: string,
  rating: string,
  question: QuestionData,
  user?: string,
) {
  return [
    {
      type: 10,
      content: `-# ${rating} | ${question.id} | ${
        user ? user : "requested by"
      }`,
    },
    {
      type: 17,
      accent_color: getColorHex(type, rating),
      spoiler: false,
      components: [
        {
          type: 10,
          content: `${
            type.replace(/-/g, " ").toUpperCase()
          }:\n**${question.question}**`,
        },
      ],
    },
    ...buildCommandButtonsV2(rating),
  ];
}

function getColorHex(type: string, rating: string): number {
  const hue = COLOR_MAP.typeHues[type.toLowerCase()] ?? 0;
  const saturation = COLOR_MAP.ratingSaturations[rating.toLowerCase()] ?? 75;
  return parseInt(
    hslToHex(hue, saturation, 50).replace("#", ""),
    16,
  );
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))))
      .toString(16)
      .padStart(2, "0");
  return `#${f(0)}${f(8)}${f(4)}`;
}

await connectDB();

const questionsStore = new Store<{ questions: QuestionData[] }>("questions", {
  questions: [],
});

const suggestionTextStore = new Store<
  { map: Record<string, { text: string; rating: string }> }
>("suggestion_text_map", { map: {} });

async function fetchQuestion(
  type: string,
  rating: string,
): Promise<QuestionData | null> {
  const allQuestions = (await questionsStore.getData()).questions;

  const filtered = allQuestions.filter(
    (q) =>
      q.type.toLowerCase() === type.toLowerCase() &&
      q.rating.toLowerCase() === rating.toLowerCase(),
  );
  if (filtered.length === 0) return null;
  const idx = Math.floor(Math.random() * filtered.length);
  return filtered[idx];
}

function handleQuestionCommand(
  type: string,
  rating: string,
  question: QuestionData,
  user?: string,
) {
  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      components: buildQuestionMessage(type, rating, question, user),
      flags: 1 << 15,
    },
  };
}

async function storeSuggestionText(id: string, text: string, rating: string) {
  const data = await suggestionTextStore.getData();
  data.map[id] = { text, rating };
  await suggestionTextStore.setData(data);
}

app.post(
  "/interactions",
  verifyKeyMiddleware(process.env.PUBLIC_KEY!),
  async (req, res) => {
    const interaction = req.body;
    const { type, data, id, token } = interaction;

    storeToken(req.body.id, req.body.token);

    if (type === InteractionType.PING) {
      return res.send({ type: InteractionResponseType.PONG });
    }

    if (type === InteractionType.APPLICATION_COMMAND) {
      // storeToken(id, token);

      const command = data.name;
      const options = data.options || [];
      const rating = options.find((opt: any) =>
        opt.name === "rating"
      )?.value?.toString() ??
        (Math.random() < 0.5 ? "pg" : "pg13");

      if (command === "suggest") {
        const questionType = options.find((opt: any) => opt.name === "type")
          ?.value;
        const suggestionText = options.find((opt: any) =>
          opt.name === "suggestion"
        )?.value;
        const suggestionRating = options.find((opt: any) =>
          opt.name === "rating"
        )?.value || rating;

        const suggestionId = Math.random().toString(36).slice(2, 10);

        await storeSuggestionText(
          suggestionId,
          suggestionText,
          suggestionRating,
        );

        const suggestionMsg = [
          {
            type: 17,
            accent_color: getColor(questionType, suggestionRating),
            spoiler: false,
            components: [
              {
                type: 10,
                content:
                  `new ${questionType} suggestion:\n${suggestionText}\n-# ${questionType} | ${suggestionRating} | <@${
                    interaction.member?.user?.id || interaction.user?.id ||
                    "user"
                  }>`,
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
                    custom_id:
                      `accept_${questionType}_${suggestionId}_${suggestionRating}`,
                  },
                  {
                    type: 2,
                    style: 1,
                    label: "Edit",
                    emoji: null,
                    disabled: false,
                    custom_id:
                      `editmodal_${questionType}_${suggestionId}_${suggestionRating}`,
                  },
                  {
                    type: 2,
                    style: 4,
                    label: "Deny",
                    emoji: null,
                    disabled: false,
                    custom_id:
                      `deny_${questionType}_${suggestionId}_${suggestionRating}`,
                  },
                ],
              },
            ],
          },
        ];

        const channelId = process.env.SUGGESTION_CHANNEL_ID;
        await fetch(
          `https://discord.com/api/v10/channels/${channelId}/messages`,
          {
            method: "POST",
            headers: {
              Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              components: suggestionMsg,
              flags: 1 << 15,
            }),
          },
        );

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: "Your suggestion has been sent for review.",
            flags: 64,
          },
        });
      }

      if (
        command === "truth" || command === "dare" ||
        command === "would-you-rather"
      ) {
        const typeSlug = command === "would-you-rather"
          ? "would-you-rather"
          : command;
        const question = await fetchQuestion(typeSlug, rating);

        if (!question) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content:
                "Couldn't find a question for that type and rating. Try again later.",
            },
          });
        }

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            components: buildQuestionMessage(
              typeSlug,
              rating,
              question,
              interaction.member?.user?.username || interaction.user?.username,
            ),
            flags: 1 << 15,
          },
        });
      }
    }

    if (
      type === InteractionType.MESSAGE_COMPONENT ||
      type === InteractionType.MODAL_SUBMIT
    ) {
      const customId = interaction.data?.custom_id || "";
      const parts = customId.split("_");
      const action = parts[0] || "";
      const questionType = (parts[1] || "").toLowerCase();
      const suggestion = parts[2] || "";
      const rating = (parts[3] || "pg").toLowerCase();
      const originalMessageInteractionId = interaction.message?.interaction?.id;
      const originalToken = originalMessageInteractionId
        ? getToken(originalMessageInteractionId)
        : null;

      if (action === "new") {
        // Remove buttons from the previous message
        const prevMessage = interaction.message;
        const prevInteractionId = req.body.message.interaction_metadata.id;
        const prevInteractionToken = prevInteractionId
          ? getToken(prevInteractionId)
          : null;


        const updatedComponents =
          prevMessage?.components?.map((component: any) => {
            if (component.type === 1) {
              // Action Row (buttons)
              return undefined;
            }
            return component;
          }).filter(Boolean) || [];

        // Remove buttons via webhook (ephemeral or interaction-based message)
        if (prevInteractionToken) {
          try {
            await fetch(
              `https://discord.com/api/v10/webhooks/${process.env.APP_ID}/${prevInteractionToken}/messages/@original`,
              {
                method: "PATCH",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  components: updatedComponents,
                }),
              },
            );
          } catch (e) {
            console.error(
              "Failed to PATCH webhook message to remove buttons",
              e,
            );
          }
        }

        // Remove buttons via channel message (in-server message)
        if (prevMessage?.channel_id && prevMessage?.id) {
          try {
            await fetch(
              `https://discord.com/api/v10/channels/${prevMessage.channel_id}/messages/${prevMessage.id}`,
              {
                method: "PATCH",
                headers: {
                  Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  components: updatedComponents,
                }),
              },
            );
          } catch (e) {
            console.error(
              "Failed to PATCH channel message to remove buttons",
              e,
            );
          }
        }

        const typeSlug = parts[1]?.toLowerCase() === "wyr"
          ? "would-you-rather"
          : parts[1]?.toLowerCase();
        const rating = parts[2]?.toLowerCase() || "pg";
        const question = await fetchQuestion(typeSlug, rating);

        if (!question) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content:
                "Couldn't find a question for that type and rating. Try again later.",
              flags: 64,
            },
          });
        }

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            components: buildQuestionMessage(
              typeSlug,
              rating,
              question,
              interaction.member?.user?.username || interaction.user?.username,
            ),
            flags: 1 << 15,
          },
        });
      }

      if (action === "accept") {
        const data = await suggestionTextStore.getData();
        const suggestionData = data.map[suggestion] ||
          { text: suggestion, rating };

        const newQuestion = {
          id: `${Date.now()}_${Math.floor(Math.random() * 10000)}`,
          type: questionType.toUpperCase(),
          rating: suggestionData.rating,
          question: suggestionData.text,
        };
        const storeData = await questionsStore.getData();
        storeData.questions.push(newQuestion);
        await questionsStore.setData(storeData);

        return res.send({
          type: InteractionResponseType.UPDATE_MESSAGE,
          data: {
            flags: 1 << 15,
            allowed_mentions: {},
            components: [
              {
                type: 17,
                accent_color: getColorHex(questionType, suggestionData.rating),
                spoiler: false,
                components: [
                  {
                    type: 10,
                    content:
                      `accepted ${questionType} suggestion:\n${suggestionData.text}\n-# ${questionType} | ${suggestionData.rating} | accepted`,
                  },
                ],
              },
            ],
          },
        });
      }

      if (action === "editmodal") {
        const data = await suggestionTextStore.getData();
        const suggestionData = data.map[suggestion] ||
          { text: suggestion, rating };
        return res.send({
          type: InteractionResponseType.MODAL,
          data: {
            custom_id:
              `edit_${questionType}_${suggestion}_${suggestionData.rating}`,
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
                    value: suggestionData.text,
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
                    value: suggestionData.rating,
                    required: true,
                  },
                ],
              },
            ],
          },
        });
      }

      if (action === "edit") {
        const editedQuestion = (interaction.data.components[0].components.find(
          (c: any) => c.custom_id === "edited_question",
        )?.value) as string;
        const editedRating = (interaction.data.components[1].components.find(
          (c: any) => c.custom_id === "edited_rating",
        )?.value as string).toLowerCase();

        const newQuestion = {
          id: `${Date.now()}_${Math.floor(Math.random() * 10000)}`,
          type: questionType.toUpperCase(),
          rating: editedRating,
          question: editedQuestion,
        };
        const storeData = await questionsStore.getData();
        storeData.questions.push(newQuestion);
        await questionsStore.setData(storeData);
        return res.send({
          type: InteractionResponseType.UPDATE_MESSAGE,
          data: {
            allowed_mentions: {},
            components: [],
            embeds: [
              {
                title: "Suggestion Accepted",
                description: `Suggestion accepted: \"${editedQuestion}\"`,
                fields: [
                  { name: "Type", value: questionType, inline: true },
                  {
                    name: "Rating",
                    value: editedRating || "None",
                    inline: true,
                  },
                ],
                color: getColorHex(questionType, editedRating),
              },
            ],
          },
        });
      }

      if (action === "deny") {
        const data = await suggestionTextStore.getData();
        const suggestionData = data.map[suggestion] ||
          { text: suggestion, rating };

        return res.send({
          type: InteractionResponseType.UPDATE_MESSAGE,
          data: {
            flags: 1 << 15,
            allowed_mentions: {},
            components: [
              {
                type: 17,
                accent_color: getColorHex(questionType, suggestionData.rating),
                spoiler: false,
                components: [
                  {
                    type: 10,
                    content:
                      `denied ${questionType} suggestion:\n${suggestionData.text}\n-# ${questionType} | ${suggestionData.rating} | denied`,
                  },
                ],
              },
            ],
          },
        });
      }
    }

    res.send({ type: InteractionResponseType.PONG });
  },
);

app.get("/", (_, res) => {
  const scopes = ["bot", "applications.commands"].join("%20");
  const perms = "2147485696";
  res.redirect(
    `https://discord.com/oauth2/authorize?client_id=${process.env.APP_ID}&scope=${scopes}&permissions=${perms}`,
  );
});

app.listen(PORT, () => {
  console.log(`✨ Truth or Dare bot server running on port ${PORT}`);
});
function getColor(questionType: string, rating: string): number {
  const type = questionType.toLowerCase();
  const rate = rating.toLowerCase();
  const hue = COLOR_MAP.typeHues[type] ?? 0;
  const saturation = COLOR_MAP.ratingSaturations[rate] ?? 75;

  return parseInt(hslToHex(hue, saturation, 50).replace("#", ""), 16);
}
