# prometheus-synth-web-exporter

What a mouthful of a project name.
Synthetic web monitoring allows testing interactions with websites beyond a simple page load check.

This [Prometheus exporter](https://prometheus.io/docs/instrumenting/exporters/) combines the power of synthetic web monitoring with the [Prometheus metrics](https://prometheus.io/docs/instrumenting/writing_exporters/) standard.
You can define test sequences for a website which are executed inside a browser using the [playwright](https://playwright.dev/) framework.
These test sequences are executed regularly and the test results are exported as metrics.

## How to use

The exporter is a [Node.js](https://nodejs.org/) application (Node 22 or newer) that runs as a daemon scheduling the tests and exporting the metrics endpoint.
In addition, there is a command that runs a single test sequence immediately and reports the results back.

### Installation

```shell
pnpm install
pnpm exec playwright install chromium   # not needed with the Nix dev shell
pnpm run build
```

With Nix, `nix develop` provides Node, pnpm and the browsers.
The Playwright version in `package.json` is pinned exactly because it has to match the browsers provided by nixpkgs; the dev shell warns when they differ.

### Creating and testing a script

Create a `.js` file to define the test sequence.
The file defines each step to execute using the provided `step` function.
The function accepts two parameters: the step name and an async function to be executed for the step.
This step function has a single parameter which represents the playwright page.
Step names must be unique within a script, because they are used as metric labels.

Example:

```js
step("load", async (page) => {
  // Use the injected playwright page for tests
  await page.goto("https://myapp.test/");
});

step("interact", async (page) => {
  // The page state is kept between steps
  const login = page.locator("a.btn[href*='/login']");
  await login.click();
});

// ... define more steps here
```

The following globals are available inside a script:

- `step(name, fn)`: defines a step.
- `expect`: [playwright's `expect`](https://playwright.dev/docs/test-assertions), e.g. `await expect(page.locator("body")).toContainText("Welcome")`.
- every key of the target's `settings` (see below).
  Settings must not use the names of the other globals.

Scripts run in a Node [`vm`](https://nodejs.org/api/vm.html) context, which is **not a security sandbox**: only run scripts you trust.

After defining the sequence file, you can test the sequence by executing

```shell
node dist/cli.js test [--headless] [-s key=value ...] <script-path>
```

This will spawn a browser and execute the sequence.
Use `-s` or `--settings` to provide settings.
Every step is printed with its status and duration, and the command exits with status 1 when the sequence fails.

### Running the metrics daemon

To run the daemon, a config file must be created:

```json
{
  "port": 13345,
  "targets": [
    {
      "name": "test1",
      "script": "./scripts/test1.js",
      "interval": "5min"
    }
  ]
}
```

A target will give the sequence a name and an interval at which it is executed.
You can define more targets with different scripts and settings.

To start the daemon, run the following command:

```shell
node dist/cli.js serve <config-path>
```

The daemon exits cleanly on `SIGINT`/`SIGTERM`.
It exits with an error if the shared browser dies, so run it under a supervisor (systemd, Docker, ...) that restarts it.
The config file is validated on startup; problems are reported with their location.

### Configuration reference

| Key        | Where  | Description                                             |
| ---------- | ------ | ------------------------------------------------------- |
| `port`     | root   | Port of the metrics endpoint (required).                |
| `host`     | root   | Address to bind to. Default: all interfaces.            |
| `name`     | target | Unique name; used as the `target` label.                |
| `script`   | target | Path to the script, relative to the config file.        |
| `interval` | target | Time between runs, e.g. `30s`, `5min`.                  |
| `settings` | target | Values injected into the script as globals (see below). |

### Target settings

To configure and re-use scripts, a target can define settings as a JSON dict.
The values of this dict are injected in the context used to execute the sequence script.
Use `${NAME}` to read a value from an environment variable, so secrets do not have to be stored in the config file.
Referencing an unset variable is an error.

```json
{
  "port": 13345,
  "targets": [
    {
      "name": "test1",
      "script": "./scripts/test1.js",
      "interval": "5min",
      "settings": {
        "username": "testuser",
        "password": "password"
      }
    },
    {
      "name": "test2",
      "script": "./scripts/test2.js",
      "interval": "30min"
    }
  ]
}
```

### Endpoints

- `/metrics`: Prometheus metrics.

### Metrics

| Metric                                              | Labels                     | Description                                                                              |
| --------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------- |
| `synth_web_probe_target_success`                    | `target`                   | `1` if the last run succeeded, `0` if a step failed or the run crashed.                  |
| `synth_web_probe_target_duration_seconds`           | `target`                   | Duration of the last run (until the failure, if it failed).                              |
| `synth_web_probe_target_step_count`                 | `target`                   | Number of steps in the script.                                                           |
| `synth_web_probe_target_last_run_timestamp_seconds` | `target`                   | Unix time at which the target last finished a run.                                       |
| `synth_web_probe_target_interval_seconds`           | `target`                   | Configured interval.                                                                     |
| `synth_web_probe_step_status`                       | `target`, `step`, `status` | One series per `success`/`failure`/`skipped`; `1` for the step's status in the last run. |
| `synth_web_probe_step_duration_seconds`             | `target`, `step`           | Duration of the step in the last run. Absent for skipped steps.                          |

The default Node.js process metrics are exported as well.

Example scrape config and alerts:

```yaml
scrape_configs:
  - job_name: synth-web
    static_configs:
      - targets: ["localhost:13345"]

groups:
  - name: synth-web
    rules:
      - alert: SynthWebProbeFailing
        expr: synth_web_probe_target_success == 0
        for: 10m
      - alert: SynthWebProbeStale
        expr: time() - synth_web_probe_target_last_run_timestamp_seconds > 3 * synth_web_probe_target_interval_seconds
```

## Development

```shell
pnpm run typecheck
pnpm run format
```
