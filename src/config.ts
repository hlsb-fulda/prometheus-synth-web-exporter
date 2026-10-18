import * as path from "path";
import * as fs from "fs";
import { z } from "zod";
import parseDuration from "parse-duration";

const duration = z
  .string()
  .refine((value) => (parseDuration(value, "s") ?? 0) > 0, {
    message: 'must be a positive duration such as "30s" or "5min"',
  });

const TargetSchema = z.strictObject({
  name: z.string().min(1),
  script: z.string().min(1),
  interval: duration,
  settings: z.record(z.string(), z.unknown()).optional(),
});

const ConfigSchema = z.strictObject({
  port: z.number().int().min(1).max(65535),
  host: z.string().min(1).optional(),
  targets: z.array(TargetSchema),
});

export type TargetConfig = z.infer<typeof TargetSchema>;
export type Config = z.infer<typeof ConfigSchema>;

export async function load(p: string = "./config.json"): Promise<Config> {
  const configPath = path.resolve(p);

  let raw: unknown;
  try {
    raw = JSON.parse(await fs.promises.readFile(configPath, "utf8"));
  } catch (err) {
    throw new Error(`Cannot read config ${configPath}`, {
      cause: err,
    });
  }

  const result = ConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(
      `Invalid config ${configPath}: ${z.prettifyError(result.error)}`,
    );
  }

  // Resolve scripts relative to the config file rather than the working
  // directory, so the daemon behaves the same wherever it is started from.
  const baseDir = path.dirname(configPath);

  return {
    ...result.data,
    targets: result.data.targets.map((target) => ({
      ...target,
      script: path.resolve(baseDir, target.script),
    })),
  };
}
