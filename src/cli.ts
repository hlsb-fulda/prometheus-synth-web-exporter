#!/usr/bin/env node

import {
  argument,
  command,
  constant,
  keyValue,
  map,
  message,
  multiple,
  object,
  option,
  or,
  string,
} from "@optique/core";
import { defineProgram } from "@optique/core/program";
import { run } from "@optique/run";

import server from "./server.js";
import test from "./test.js";
import * as process from "node:process";

const serveCommand = command(
  "serve",
  object({
    mode: constant("server"),
    config: argument(string({ metavar: "CONFIG" })),
  }),
);

const testCommand = command(
  "test",
  object({
    mode: constant("test"),
    script: argument(string({ metavar: "SCRIPT" })),
    settings: map(multiple(option("-s", "--settings", keyValue())), (pairs) =>
      Object.fromEntries(pairs),
    ),
  }),
);

const parser = or(serveCommand, testCommand);
const program = defineProgram({
  parser,
  metadata: {
    name: "prometheus-synth-web-exporter",
    version: "1.0.0",
    description: message`Synthetic web monitoring for Prometheus`,
  },
});

const args = run(program);

switch (args.mode) {
  case "server":
    await server(args.config);
    break;

  case "test":
    process.exit((await test(args.script, args.settings)) ? 0 : 1);
    break;
}
