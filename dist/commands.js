import "dotenv/config";
import { InstallGlobalCommands } from "./utils.js";
console.log(process.env.DISCORD_TOKEN);
const RATING_OPTION = {
    type: 3,
    name: "rating",
    description: "Rating of the item (pg, pg13, r)",
    choices: [
        { name: "PG", value: "pg" },
        { name: "PG-13", value: "pg13" },
        { name: "R", value: "r" },
    ],
    required: false,
};
const truth = {
    name: "truth",
    type: 1,
    description: "Get a random truth",
    options: [RATING_OPTION],
    integration_types: [0, 1],
    contexts: [0, 1, 2],
};
const dare = {
    name: "dare",
    type: 1,
    description: "Get a random dare",
    options: [RATING_OPTION],
    integration_types: [0, 1],
    contexts: [0, 1, 2],
};
const wouldYouRather = {
    name: "would-you-rather",
    type: 1,
    description: "Get a random Would You Rather question",
    options: [RATING_OPTION],
    integration_types: [0, 1],
    contexts: [0, 1, 2],
};
const suggestCommand = {
    name: "suggest-command",
    type: 1,
    description: "Suggest a new question",
    options: [
        {
            type: 3,
            name: "type",
            description: "The type of the question (truth, dare, wyr)",
            choices: [
                { name: "Truth", value: "TRUTH" },
                { name: "Dare", value: "DARE" },
                { name: "Would You Rather", value: "WYR" },
            ],
            required: true,
        },
        {
            type: 3,
            name: "suggestion",
            description: "The question suggestion",
            required: true,
        },
        {
            type: 3,
            name: "rating",
            description: "The rating of the question (pg, pg13, r)",
            choices: [
                { name: "PG", value: "pg" },
                { name: "PG-13", value: "pg13" },
                { name: "R", value: "r" },
            ],
            required: true,
        },
    ],
    integration_types: [0, 1],
    contexts: [0, 1, 2],
};
const ALL_COMMANDS = [
    //   WIKI_COMMAND,
    truth,
    dare,
    wouldYouRather,
    suggestCommand,
];
InstallGlobalCommands(process.env.APP_ID, ALL_COMMANDS);
