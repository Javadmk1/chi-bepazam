import fs from "node:fs/promises";
import path from "node:path";

const packageRoot = path.join(process.cwd(), "node_modules", "expo-font");
const packageJson = JSON.parse(await fs.readFile(path.join(packageRoot, "package.json"), "utf8"));
const configPath = path.join(packageRoot, "expo-module.config.json");
const config = JSON.parse(await fs.readFile(configPath, "utf8"));

config.android ??= {};
config.android.publication = {
  id: "expo.modules.font",
  group: "host.exp.exponent",
  version: packageJson.version,
  repository: "local-maven-repo"
};

await fs.writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
console.log(`Patched expo-font Android publication metadata: ${config.android.publication.group}:${config.android.publication.id}:${config.android.publication.version}`);
