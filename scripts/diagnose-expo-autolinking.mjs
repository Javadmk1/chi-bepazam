import { spawnSync } from "node:child_process";

const result = spawnSync("npx", ["expo-modules-autolinking", "resolve", "--platform", "android", "--json"], {
  encoding: "utf8",
  env: process.env,
  maxBuffer: 20 * 1024 * 1024
});
if (result.status !== 0) {
  process.stderr.write(result.stderr || "");
  process.stderr.write(result.stdout || "");
  process.exit(result.status ?? 1);
}
let config;
try {
  config = JSON.parse(result.stdout);
} catch (error) {
  console.error("Could not parse Expo autolinking JSON:", error);
  console.error(result.stdout.slice(0, 4000));
  process.exit(1);
}
const modules = config.modules ?? [];
console.log("Expo autolinking modules:", modules.length);
const invalidPublications = [];
for (const [index, module] of modules.entries()) {
  const projects = module.projects ?? [];
  for (const [projectIndex, project] of projects.entries()) {
    if (project.publication) {
      if (!project.publication.version) {
        invalidPublications.push({ packageName: module.packageName, projectName: project.name, publication: project.publication });
      }
      console.log(JSON.stringify({
        moduleIndex: index,
        packageName: module.packageName ?? module.name ?? module.path,
        projectIndex,
        projectName: project.name,
        publication: project.publication
      }));
    }
  }
}

if (invalidPublications.length) {
  console.error("Expo Android publication metadata is missing required version fields:", JSON.stringify(invalidPublications, null, 2));
  process.exit(1);
}
console.log("Expo Android publication metadata validation passed.");
