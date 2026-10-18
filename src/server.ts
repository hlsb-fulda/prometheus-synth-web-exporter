import prom from "@prometheus-io/client";
import { load as loadConfig } from "@/config.js";
import { AsyncTask, SimpleIntervalJob, ToadScheduler } from "toad-scheduler";
import playwright from "playwright";
import { bail, describeError } from "@/utils.js";
import parseDuration from "parse-duration";
import { Sequence } from "@/engine.js";
import { consola } from "consola";
import express from "express";

const metrics = new prom.Registry();
prom.collectDefaultMetrics({ register: metrics });

const stepSuccess = new prom.Gauge({
  name: "synth_web_probe_step_status",
  help: "Synth web probe step status (1 = active, 0 = inactive)",
  labelNames: ["target", "step", "status"] as const,
  registers: [metrics],
});

const stepDuration = new prom.Gauge({
  name: "synth_web_probe_step_duration_seconds",
  help: "Synth web probe step duration in seconds",
  labelNames: ["target", "step"] as const,
  registers: [metrics],
});

const targetSuccess = new prom.Gauge({
  name: "synth_web_probe_target_success",
  help: "Synth web probe target success (1 = successful, 0 = failed)",
  labelNames: ["target"] as const,
  registers: [metrics],
});

const targetDuration = new prom.Gauge({
  name: "synth_web_probe_target_duration_seconds",
  help: "Synth web probe target duration in seconds",
  labelNames: ["target"] as const,
  registers: [metrics],
});

const targetStepCount = new prom.Gauge({
  name: "synth_web_probe_target_step_count",
  help: "Synth web probe target step count",
  labelNames: ["target"] as const,
  registers: [metrics],
});

const targetExecutionTime = new prom.Gauge({
  name: "synth_web_probe_target_execution_timestamp_seconds",
  help: "Synth web probe target execution time",
  labelNames: ["target"] as const,
  registers: [metrics],
});

const targetExecutionInterval = new prom.Gauge({
  name: "synth_web_probe_target_execution_interval_seconds",
  help: "Synth web probe target execution interval in seconds",
  labelNames: ["target"] as const,
  registers: [metrics],
});

export default async function main(configPath: string) {
  const config = await loadConfig(configPath);

  const scheduler = new ToadScheduler();

  const browser = await playwright.chromium.launch({ headless: true });

  // All targets share one browser. If it dies every later run would fail, so
  // exit and let the supervisor restart the daemon.
  browser.on("disconnected", () => {
    consola.fatal("Browser disconnected, exiting");
    process.exit(1);
  });

  // Create and schedule tasks
  for (const target of config.targets) {
    // Parse the interval configuration
    const intervalSeconds =
      parseDuration(target.interval, "s") ??
      bail(
        `Invalid interval format "${target.interval}" for target ${target.name}`,
      );

    const sequence = await Sequence.load(target.name, target.script, {
      timeout: 5000,
      context: target.settings ?? {},
    });

    // Create the scheduled task
    const task = new AsyncTask(
      `target-${sequence.name}`,
      async () => {
        consola.debug(`Running check ${sequence.name}`);
        const result = await sequence.run(browser);

        if (!result.success) {
          consola.warn(
            `Check ${sequence.name} failed at step "${result.failedStep.name}": ${describeError(result.failedStep.reason)}`,
          );
        }

        for (const step of result) {
          for (const status of ["success", "failure", "skipped"] as const) {
            stepSuccess
              .labels(sequence.name, step.name, status)
              .set(step.status === status ? 1 : 0);
          }

          if (step.status === "skipped") {
            stepDuration.remove(sequence.name, step.name);
          } else {
            stepDuration
              .labels(sequence.name, step.name)
              .set(step.durationMs / 1000);
          }
        }

        targetSuccess.labels(sequence.name).set(result.success ? 1 : 0);
        targetDuration.labels(sequence.name).set(result.totalDurationMs / 1000);
        targetStepCount.labels(sequence.name).set(sequence.steps.length);
        targetExecutionTime
          .labels(sequence.name)
          .set(new Date().getTime() / 1000.0);
        targetExecutionInterval.labels(sequence.name).set(intervalSeconds);
      },
      (err) => {
        consola.error(`${sequence.name} crashed:`, err);
        targetSuccess.labels(sequence.name).set(0);
      },
    );

    scheduler.addIntervalJob(
      new SimpleIntervalJob(
        {
          seconds: intervalSeconds,
          runImmediately: true,
        },
        task,
        {
          id: `job-${target.name}`,
          preventOverrun: true,
        },
      ),
    );
  }

  // Spawn and run HTTP server to server metrics
  const app = express();
  app.get("/metrics", async (_, res) => {
    try {
      res.setHeader("Content-Type", metrics.contentType);
      res.end(await metrics.metrics());
    } catch (err) {
      consola.error("Failed to render metrics:", err);

      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Internal Server Error");
    }
  });

  const server = app.listen(config.port, config.host ?? "", () => {
    consola.info(`Server listening on ${config.host ?? "*"}:${config.port}`);
  });

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, async () => {
      consola.info(`Received ${signal}, shutting down`);

      // Last resort if something hangs forever
      setTimeout(() => process.exit(1), 10_000).unref();

      scheduler.stop();

      server.close();
      server.closeAllConnections();

      browser.removeAllListeners();
      await browser.close();
    });
  }
}
