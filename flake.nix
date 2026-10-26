{
  description = "Synthetic web monitoring exporter for Prometheus";

  inputs = {
    nixpkgs.url = "https://channels.nixos.org/nixos-unstable/nixexprs.tar.zst";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils, ... }: flake-utils.lib.eachDefaultSystem (system: let
    pkgs = nixpkgs.legacyPackages.${system};

  in {
    packages = {
      prometheus-synth-web-exporter = pkgs.callPackage ./package.nix { };
      default = self.packages.${system}.prometheus-synth-web-exporter;
    };

    devShells.default = pkgs.mkShell {
      buildInputs = with pkgs; [
        nodejs_26
        playwright-driver.browsers
      ];

      shellHook = ''
        export PLAYWRIGHT_BROWSERS_PATH="${pkgs.playwright-driver.browsers}"
        export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
        export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1
        '';
    };
  });
}

