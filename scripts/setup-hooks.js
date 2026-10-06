import { execSync } from "node:child_process";

try {
  execSync("git rev-parse --is-inside-work-tree", { stdio: "ignore" });
} catch {
  process.exit(0);
}
execSync("git config core.hooksPath .githooks", { stdio: "inherit" });
