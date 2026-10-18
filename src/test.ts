import { Sequence } from "@/engine.js";
import playwright from "playwright";
import { consola } from "consola";
import { describeError } from "@/utils.js";

export default async function main(
  script: string,
  settings: Record<string, any> = {},
): Promise<boolean> {
  consola.info(`Running script: ${script}`);

  const target = await Sequence.load("test", script, {
    timeout: 5000,
    context: settings,
  });

  const browser = await playwright.chromium.launch({ headless: false });

  const result = await target.run(browser);

  for (const step of result) {
    switch (step.status) {
      case "success":
        consola.success(
          `${step.name} (${(step.durationMs / 1000).toFixed(2)}s)`,
        );
        break;
      case "failure":
        consola.error(`${step.name}: ${describeError(step.reason)}`);
        break;
      case "skipped":
        consola.log(`- ${step.name} (skipped)`);
        break;
    }
  }

  if (result.success) {
    consola.success("Test finished successfully.");
    consola.info(`Duration: ${(result.totalDurationMs / 1000.0).toFixed(2)}s`);
  } else {
    consola.error(
      `Test failed: "${result.failedStep.name}":`,
      result.failedStep.reason,
    );
  }

  return result.success;
}
