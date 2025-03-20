import "dotenv/config";
import { InstallGlobalCommands } from "./utils.js";
console.log(process.env.DISCORD_TOKEN);

interface CommandOption {
  type: number;
  name: string;
  description: string;
  choices?: { name: string; value: string }[];
  required?: boolean;
}

interface Command {
  name: string;
  type: number;
  description: string;
  options?: CommandOption[];
  integration_types: number[];
  contexts: number[];
}

const RATING_OPTION: CommandOption = {
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

const truth: Command = {
  name: "truth",
  type: 1,
  description: "Get a random truth",
  options: [RATING_OPTION],
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const dare: Command = {
  name: "dare",
  type: 1,
  description: "Get a random dare",
  options: [RATING_OPTION],
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const wouldYouRather: Command = {
  name: "would-you-rather",
  type: 1,
  description: "Get a random Would You Rather question",
  options: [RATING_OPTION],
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const ALL_COMMANDS: Command[] = [
  //   WIKI_COMMAND,
  truth,
  dare,
  wouldYouRather,
];

InstallGlobalCommands(process.env.APP_ID!, ALL_COMMANDS);
