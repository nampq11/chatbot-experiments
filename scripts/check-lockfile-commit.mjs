import { execFileSync, spawnSync } from "node:child_process";

const dependencyFields = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
  "overrides",
  "packageManager",
  "pnpm",
  "resolutions",
];

const stagedFiles = getStagedFiles();
const packageJsonFiles = stagedFiles.filter((file) =>
  /(^|\/)package\.json$/.test(file),
);
const configFiles = stagedFiles.filter(
  (file) => file === ".npmrc" || file === "pnpm-workspace.yaml",
);
const changedDependencyFiles = packageJsonFiles.filter(
  hasDependencyMetadataChanges,
);
const lockfileStaged = stagedFiles.includes("pnpm-lock.yaml");

if (changedDependencyFiles.length === 0 && configFiles.length === 0) {
  process.exit(0);
}

if (lockfileStaged) {
  process.exit(0);
}

console.error(
  "❌ Dependency-related manifest changes require pnpm-lock.yaml to be staged.",
);

for (const file of [...changedDependencyFiles, ...configFiles]) {
  console.error(`- ${file}`);
}

console.error("Run pnpm install and stage pnpm-lock.yaml before committing.");
process.exit(1);

function getStagedFiles() {
  const output = execFileSync(
    "git",
    ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"],
    { encoding: "utf8" },
  );

  return output.split("\0").filter(Boolean);
}

function hasDependencyMetadataChanges(file) {
  const previousPackageJson = readPackageJson(`HEAD:${file}`);
  const stagedPackageJson = readPackageJson(`:${file}`);

  return dependencyFields.some((field) => {
    return (
      serializeForComparison(previousPackageJson?.[field]) !==
      serializeForComparison(stagedPackageJson?.[field])
    );
  });
}

function readPackageJson(spec) {
  if (!gitSpecExists(spec)) {
    return null;
  }

  const content = execFileSync("git", ["show", spec], { encoding: "utf8" });
  return JSON.parse(content);
}

function gitSpecExists(spec) {
  const result = spawnSync("git", ["cat-file", "-e", spec], {
    stdio: "ignore",
  });

  if (result.status === 0) {
    return true;
  }

  if (result.status === 128) {
    return false;
  }

  console.error(`❌ Failed to check whether ${spec} exists.`);
  process.exit(result.status ?? 1);
}

function serializeForComparison(value) {
  if (value == null) {
    return "null";
  }

  return JSON.stringify(sortValue(value));
}

function sortValue(value) {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortValue(value[key])]),
    );
  }

  return value;
}
