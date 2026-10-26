{
  lib,
  buildNpmPackage,
  importNpmLock,
  makeWrapper,
  playwright-driver,
  playwright-test,
  pkgs,
}:

buildNpmPackage (finalAttrs:
let
  packageLock = lib.importJSON "${finalAttrs.src}/package-lock.json";

  mkArchive = name: path: pkgs.runCommand "${name}.tgz" {
    nativeBuildInputs = with pkgs; [ gnutar gzip ];
  } ''
    tar -czf "$out" -C '${path}' .
  '';

in {
  pname = "prometheus-synth-web-exporter";
  inherit (packageLock) version;

  src = lib.fileset.toSource {
    root = ./.;
    fileset = lib.fileset.unions [
      ./src
      ./package.json
      ./package-lock.json
      ./tsconfig.json
    ];
  };

  # Use the patched depenencies from the npm import below
  postPatch = ''
    cp --no-preserve=mode '${finalAttrs.npmDeps}/package.json' ./package.json
    cp --no-preserve=mode '${finalAttrs.npmDeps}/package-lock.json' ./package-lock.json
  '';

  nativeBuildInputs = [
    makeWrapper
  ];

  # We need to inject the nixpks provided browsers because we can not use the upstream
  # provided ones. As the playwright-core version determines the exact path relative to
  # PLAYWRIGHT_BROWSERS_PATH, therefore the versions of playwright-core used by nodejs
  # and provided by nixpkgs must match. This forcefully injects the versions provided
  # by nixpkgs into the npm dependency tree.
  npmDeps = importNpmLock {
    npmRoot = finalAttrs.src;

    packageSourceOverrides = {
      "node_modules/playwright" = mkArchive "playwright" "${playwright-test}/lib/node_modules/playwright";
      "node_modules/playwright-core" = mkArchive "playwright-core" "${playwright-test}/lib/node_modules/playwright-core";
    };

    packageLock = lib.recursiveUpdate packageLock {
      packages = {
        "" = {
          dependencies."playwright" = "${playwright-driver.version}";
        };

        "node_modules/playwright" = {
          version = playwright-driver.version;
          integrity = null;
          dependencies."playwright-core" = playwright-driver.version;
        };

        "node_modules/playwright-core" = {
          version = playwright-driver.version;
          integrity = null;
        };
      };
    };
  };

  #dontNpmPrune = true;

  npmConfigHook = importNpmLock.npmConfigHook;

  makeWrapperArgs = [
    "--set PLAYWRIGHT_BROWSERS_PATH ${finalAttrs.passthru.playwright-browsers}"
    "--set PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD 1"
    "--set PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS 1"
  ];

  passthru = {
    playwright-browsers = playwright-driver.selectBrowsers {
      withChromiumHeadlessShell = true;
      withChromium = true;
      withFirefox = false;
      withWebkit = false;
      withFfmpeg = false;
    };
  };

  meta = {
    description = "Prometheus exporter for synthetic web monitoring with Playwright";
    homepage = "https://github.com/hlsb/prometheus-synth-web-exporter";
    license = lib.licenses.mit;
    mainProgram = finalAttrs.pname;
    platforms = lib.platforms.linux;
  };
})
