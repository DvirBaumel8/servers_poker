# To learn more about how to use Nix to configure your environment
# see: https://developers.google.com/idx/guides/customize-idx-env
{ pkgs, ... }: {
  # Which nixpkgs channel to use.
  channel = "stable-24.11"; # or "unstable"

  # We've removed jdk, postgresql, and other packages that can be managed
  # by npm in the project's devDependencies for a cleaner, more focused environment.
  # I've also removed the @nestjs/cli package, as it's not needed for running the application.
  packages = [
    pkgs.nodejs_22
  ];

  # Sets environment variables in the workspace
  env = {};

  idx = {
    # We've removed the extensions for Java and PostgreSQL to reduce overhead.
    extensions = [
      "google.gemini-cli-vscode-ide-companion"
      "dbaeumer.vscode-eslint" # For TypeScript and JavaScript linting
    ];

    # Enable previews
    previews = {
      enable = false;
      previews = {
        web = {
          # The command to run for the web preview.
          # We've changed this from 'npm run dev' to 'npm start'. 
          # 'npm start' runs the pre-built application without a heavy file watcher,
          # significantly reducing background CPU and memory usage.
          command = ["npm" "start"];
          manager = "web";
        };
      };
    };
    
    # Workspace lifecycle hooks
    workspace = {
      # Runs when a workspace is first created
      onCreate = {
        # Install JS dependencies from NPM
        npm-install = "npm install";
        # Build the project once on creation so the preview can start
        npm-build = "npm run build";
        # Open these files when the workspace is created
        default.openFiles = [ "src/main.ts" "src/app.controller.ts" ];
      };
      
      # Runs when the workspace is (re)started
      onStart = {
        # This ensures the application is built and ready to run when you start the workspace.
        npm-build = "npm run build";
      };
    };
  };
}
