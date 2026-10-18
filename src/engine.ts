import { type Browser, type Page } from "playwright";
import { expect } from "playwright/test";
import * as path from "path";
import * as fs from "fs";
import * as vm from "vm";

export type StepStatus = "success" | "failure" | "skipped";

export interface BaseStepResult {
  readonly name: string;
  readonly status: StepStatus;
}

export interface SuccessfulStepResult extends BaseStepResult {
  readonly status: "success";
  readonly durationMs: number;
}

export interface FailedStepResult extends BaseStepResult {
  readonly status: "failure";
  readonly reason: unknown;
  readonly durationMs: number;
}

export interface SkippedStepResult extends BaseStepResult {
  readonly status: "skipped";
}

export type StepResult =
  SuccessfulStepResult | FailedStepResult | SkippedStepResult;

export interface BaseSequenceResult extends Iterable<StepResult> {
  readonly name: string;
  readonly success: boolean;
  readonly totalDurationMs: number;

  allSteps(): Generator<StepResult, void, undefined>;
}

export class SuccessfulSequenceResult implements BaseSequenceResult {
  public readonly success = true;

  public constructor(
    public readonly name: string,
    public readonly totalDurationMs: number,
    public readonly steps: readonly SuccessfulStepResult[],
  ) {}

  *allSteps(): Generator<SuccessfulStepResult, void, undefined> {
    yield* this.steps;
  }

  [Symbol.iterator](): IterableIterator<StepResult> {
    return this.allSteps();
  }
}

export class FailedSequenceResult implements BaseSequenceResult {
  readonly success = false;

  public constructor(
    public readonly name: string,
    public readonly totalDurationMs: number,
    public readonly successfulSteps: readonly SuccessfulStepResult[],
    public readonly failedStep: FailedStepResult,
    public readonly skippedSteps: readonly SkippedStepResult[],
  ) {}

  *allSteps(): Generator<StepResult, void, undefined> {
    yield* this.successfulSteps;
    yield this.failedStep;
    yield* this.skippedSteps;
  }

  [Symbol.iterator](): IterableIterator<StepResult> {
    return this.allSteps();
  }
}

export type SequenceResult = SuccessfulSequenceResult | FailedSequenceResult;

export class Step {
  constructor(
    public readonly name: string,
    private readonly fn: (page: Page) => Promise<void>,
  ) {}

  async run(page: Page): Promise<SuccessfulStepResult | FailedStepResult> {
    const startTime = performance.now();

    try {
      await this.fn(page);
    } catch (err: unknown) {
      return {
        name: this.name,
        durationMs: performance.now() - startTime,
        status: "failure",
        reason: err,
      };
    }

    return {
      name: this.name,
      status: "success",
      durationMs: performance.now() - startTime,
    };
  }
}

export interface SequenceOptions {
  timeout?: number;
  context?: Record<string, unknown>;
}

export class Sequence {
  private constructor(
    public readonly name: string,
    public readonly steps: readonly Step[],
  ) {}

  public static async load(
    name: string,
    scriptPath: string,
    options: SequenceOptions = {},
  ): Promise<Sequence> {
    // Create a container and execute the test script to collect the steps
    // Note: This is no real sandboxing. Scripts must be trusted
    const scriptPathAbs = path.resolve(scriptPath);
    const scriptCode = await fs.promises.readFile(scriptPathAbs, "utf8");
    const script = new vm.Script(scriptCode, { filename: scriptPathAbs });

    const steps: Step[] = [];
    const context = vm.createContext({
      console,
      expect,
      step: (name: string, fn: (page: Page) => Promise<void>) => {
        // Ensure step name is unique
        if (steps.some((existing) => existing.name === name)) {
          throw new Error(`Duplicate step name "${name}"`);
        }

        // Overwrite function name with step name
        Object.defineProperty(fn, "name", {
          value: name,
          configurable: true,
        });

        steps.push(new Step(name, fn));
      },

      ...options.context,
    });
    script.runInContext(context, {
      timeout: options.timeout,
    });

    return new Sequence(name, Object.freeze(steps));
  }

  public async run(browser: Browser): Promise<SequenceResult> {
    const browserContext = await browser.newContext();
    const page = await browserContext.newPage();

    const startTime = performance.now();

    try {
      const successfulSteps: SuccessfulStepResult[] = [];

      for (const [i, step] of this.steps.entries()) {
        const result = await step.run(page);

        if (result.status === "failure") {
          const skippedSteps: SkippedStepResult[] = this.steps
            .slice(i + 1)
            .map((skipped) => ({
              name: skipped.name,
              status: "skipped",
            }));

          return new FailedSequenceResult(
            this.name,
            performance.now() - startTime,
            successfulSteps,
            result,
            skippedSteps,
          );
        }

        successfulSteps.push(result);
      }

      return new SuccessfulSequenceResult(
        this.name,
        performance.now() - startTime,
        successfulSteps,
      );
    } finally {
      await browserContext.close();
    }
  }
}
