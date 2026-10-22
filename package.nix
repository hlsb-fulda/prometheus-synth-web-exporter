{
  lib,
  stdenv,
  nodejs,
  pnpm,
  pnpmConfigHook,
  fetchPnpmDeps,
  makeWrapper,
  playwright-driver,
}:

let
  packageJson = lib.importJSON ./package.json;

in
stdenv.mkDerivation (finalAttrs: {
  pname = "prometheus-synth-web-exporter";
  inherit (packageJson) version;

  src = lib.fileset.toSource {
    root = ./.;
    fileset = lib.fileset.unions [
      ./src
      ./package.json
      ./pnpm-lock.yaml
      ./pnpm-workspace.yaml
      ./tsconfig.json
    ];
  };

  nativeBuildInputs = [
    nodejs
    pnpm
    pnpmConfigHook
    makeWrapper
  ];

  pnpmDeps = fetchPnpmDeps {
    inherit (finalAttrs) pname version src;
    inherit pnpm;
    fetcherVersion = 4;
    hash = "sha256-I44d2vHKQ2J1ddvPKs1FnQ+cYQb0hcEGjPyKNs1y0aM=";
  };

  buildPhase = ''
    runHook preBuild

    pnpm run build

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    pnpm deploy --filter . --prod --offline --ignore-scripts $out/lib/${finalAttrs.pname}

    makeWrapper ${lib.getExe nodejs} $out/bin/${finalAttrs.pname} \
      --add-flags $out/lib/${finalAttrs.pname}/dist/cli.js \
      --set PLAYWRIGHT_BROWSERS_PATH ${playwright-driver.browsers} \
      --set PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD 1 \
      --set PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS 1

    runHook postInstall
  '';

  meta = {
    description = "Prometheus exporter for synthetic web monitoring with Playwright";
    homepage = "https://github.com/hlsb/prometheus-synth-web-exporter";
    license = lib.licenses.mit;
    mainProgram = finalAttrs.pname;
    platforms = lib.platforms.linux;
  };
})
