import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const MARKDOWN_OR_YAML_FILE_PATTERN = /\.(md|yaml|yml)$/;
const WORKSPACE_CHECK_FILE_PATTERN = /\.(cjs|cts|js|json|jsx|mjs|mts|ts|tsx)$/;
const JAVASCRIPT_SOURCE_FILE_PATTERN = /\.[cm]?[jt]sx?$/;
const TEST_FILE_PATTERN = /\.(test|spec)\.[cm]?[jt]sx?$/;
const PACKAGE_MANIFEST_PATTERN = /(^|\/)package\.json$/;
const VITEST_CONFIG_PATTERN = /(^|\/)vitest\.config\.ts$/;
const TEST_FILE_SUFFIXES = ["test", "spec"];
const TEST_FILE_EXTENSIONS = [
  "ts",
  "tsx",
  "js",
  "jsx",
  "mts",
  "cts",
  "mjs",
  "cjs",
];

const FULL_WORKSPACE_CHECK_FILES = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "turbo.json",
  "biome.jsonc",
]);

const CHAT_BROWSER_SMOKE_FILES = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "playwright.config.ts",
  "e2e/chat.spec.ts",
  "apps/web/package.json",
  "packages/client/package.json",
  "packages/views/package.json",
  "packages/server/package.json",
]);

const CHAT_BROWSER_SMOKE_PREFIXES = [
  "apps/web/app/chat/",
  "packages/client/src/chat/",
  "packages/client/src/navigation/chat-routes.ts",
  "packages/client/src/navigation/chat-routes.test.ts",
  "packages/server/src/handlers/agents.ts",
  "packages/server/src/handlers/sessions.ts",
  "packages/server/src/realtime/",
  "packages/views/src/chat/",
];

const stagedFiles = getStagedFiles();

if (stagedFiles.length === 0) {
  console.log("No staged files found.");
  process.exit(0);
}

abortOnPartiallyStagedFiles(stagedFiles);

run("node", ["scripts/check-lockfile-commit.mjs"]);

const biomeFiles = stagedFiles.filter((file) => {
  return (
    file !== "pnpm-lock.yaml" &&
    existsSync(file) &&
    !MARKDOWN_OR_YAML_FILE_PATTERN.test(file)
  );
});

if (biomeFiles.length > 0) {
  console.log("Checking staged files with Biome...");
  run("pnpm", [
    "exec",
    "biome",
    "check",
    "--write",
    "--error-on-warnings",
    "--no-errors-on-unmatched",
    ...biomeFiles,
  ]);
  restageFiles(biomeFiles);
}

const prettierFiles = stagedFiles.filter((file) => {
  return (
    file !== "pnpm-lock.yaml" &&
    existsSync(file) &&
    MARKDOWN_OR_YAML_FILE_PATTERN.test(file)
  );
});

if (prettierFiles.length > 0) {
  console.log("Formatting Markdown and YAML staged files...");
  run("pnpm", ["exec", "prettier", "--write", ...prettierFiles]);
  restageFiles(prettierFiles);
}

const workspacePackages = loadWorkspacePackages();
const workspacePackageByName = new Map(
  workspacePackages.map((workspacePackage) => [
    workspacePackage.name,
    workspacePackage,
  ]),
);
const checkScope = getCheckScope(stagedFiles, workspacePackages);

if (checkScope.runFullChecks) {
  console.log("Running full workspace type checking...");
  run("pnpm", ["typecheck"]);

  console.log("Running full workspace tests...");
  run("pnpm", ["test"]);
} else {
  runScopedPackageScript({
    packageNames: checkScope.packageNames,
    scriptName: "check-types",
    label: "type checking",
    workspacePackageByName,
  });

  runScopedTests({
    files: stagedFiles,
    packageNames: checkScope.packageNames,
    workspacePackages,
    workspacePackageByName,
  });
}

if (shouldRunChatBrowserSmoke(stagedFiles)) {
  console.log("Running chat browser smoke check...");
  run("bash", ["scripts/check.sh", "--browser-smoke"]);
}

console.log("All pre-commit checks passed!");

function getStagedFiles() {
  const output = execFileSync(
    "git",
    ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"],
    { encoding: "utf8" },
  );

  return output.split("\0").filter(Boolean);
}

function restageFiles(files) {
  const existingFiles = files.filter((file) => existsSync(file));

  if (existingFiles.length === 0) {
    return;
  }

  run("git", ["add", "--", ...existingFiles]);
}

function abortOnPartiallyStagedFiles(files) {
  const partiallyStagedFiles = files.filter(hasUnstagedChanges);

  if (partiallyStagedFiles.length === 0) {
    return;
  }

  console.error(
    [
      "Pre-commit formatting refuses to run with partially staged files.",
      "Commit, stash, or unstage the working-tree changes for these files:",
      ...partiallyStagedFiles.map((file) => `  - ${file}`),
    ].join("\n"),
  );
  process.exit(1);
}

function hasUnstagedChanges(file) {
  const result = spawnSync("git", ["diff", "--quiet", "--", file], {
    stdio: "ignore",
  });

  if (result.status === 0) {
    return false;
  }

  if (result.status === 1) {
    return true;
  }

  console.error(`Failed to inspect unstaged changes for ${file}.`);
  process.exit(result.status ?? 1);
}

function getCheckScope(files, workspacePackages) {
  const packageNames = new Set();

  for (const file of files) {
    if (!shouldRunWorkspaceChecksForFile(file)) {
      continue;
    }

    if (shouldRunFullWorkspaceChecks(file)) {
      return { runFullChecks: true, packageNames: [] };
    }

    const workspacePackage = findWorkspacePackage(file, workspacePackages);

    if (!workspacePackage) {
      continue;
    }

    if (workspacePackage.name === "@chatbot-experiments/typescript-config") {
      return { runFullChecks: true, packageNames: [] };
    }

    packageNames.add(workspacePackage.name);
  }

  return {
    runFullChecks: false,
    packageNames: [...packageNames].sort(),
  };
}

function shouldRunWorkspaceChecksForFile(file) {
  if (shouldRunFullWorkspaceChecks(file)) {
    return true;
  }

  return WORKSPACE_CHECK_FILE_PATTERN.test(file);
}

function shouldRunFullWorkspaceChecks(file) {
  return FULL_WORKSPACE_CHECK_FILES.has(file);
}

function runScopedPackageScript({
  packageNames,
  scriptName,
  label,
  workspacePackageByName,
}) {
  const runnablePackageNames = packageNames.filter((packageName) => {
    const workspacePackage = workspacePackageByName.get(packageName);

    return Boolean(workspacePackage?.scripts[scriptName]);
  });

  if (runnablePackageNames.length === 0) {
    console.log(`No scoped packages need ${label}.`);
    return;
  }

  console.log(
    `Running scoped ${label} for ${runnablePackageNames.join(", ")}...`,
  );

  run("pnpm", [
    ...runnablePackageNames.flatMap((packageName) => ["--filter", packageName]),
    "run",
    scriptName,
  ]);
}

function runScopedTests({
  files,
  packageNames,
  workspacePackages,
  workspacePackageByName,
}) {
  const testRuns = getScopedTestRuns({
    files,
    packageNames,
    workspacePackages,
    workspacePackageByName,
  });

  if (testRuns.length === 0) {
    console.log("No scoped packages need tests.");
    return;
  }

  for (const testRun of testRuns) {
    runScopedTest(testRun);
  }
}

function getScopedTestRuns({
  files,
  packageNames,
  workspacePackages,
  workspacePackageByName,
}) {
  const testRuns = [];

  for (const packageName of packageNames) {
    const workspacePackage = workspacePackageByName.get(packageName);

    if (!workspacePackage?.scripts.test) {
      continue;
    }

    const packageFiles = getFilesForWorkspacePackage(
      files,
      packageName,
      workspacePackages,
    );

    if (packageFiles.some(shouldRunFullPackageTests)) {
      testRuns.push({ packageName, testFiles: [] });
      continue;
    }

    const testFiles = findTestFilesForPackageFiles(
      workspacePackage,
      packageFiles,
    );

    if (testFiles.length > 0) {
      testRuns.push({ packageName, testFiles });
    }
  }

  return testRuns;
}

function runScopedTest(testRun) {
  if (testRun.testFiles.length === 0) {
    console.log(`Running scoped tests for ${testRun.packageName}...`);
    run("pnpm", ["--filter", testRun.packageName, "run", "test"]);
    return;
  }

  console.log(
    `Running scoped tests for ${testRun.packageName}: ${testRun.testFiles.join(", ")}...`,
  );
  run("pnpm", [
    "--filter",
    testRun.packageName,
    "run",
    "test",
    ...testRun.testFiles,
  ]);
}

function getFilesForWorkspacePackage(files, packageName, workspacePackages) {
  return files.filter((file) => {
    const workspacePackage = findWorkspacePackage(file, workspacePackages);

    return workspacePackage?.name === packageName;
  });
}

function shouldRunFullPackageTests(file) {
  return (
    PACKAGE_MANIFEST_PATTERN.test(file) || VITEST_CONFIG_PATTERN.test(file)
  );
}

function findTestFilesForPackageFiles(workspacePackage, packageFiles) {
  const testFiles = new Set();

  for (const file of packageFiles) {
    if (!shouldRunWorkspaceChecksForFile(file)) {
      continue;
    }

    if (isTestFile(file)) {
      testFiles.add(toPackageRelativePath(workspacePackage, file));
      continue;
    }

    for (const testFile of findColocatedTestFiles(file)) {
      testFiles.add(toPackageRelativePath(workspacePackage, testFile));
    }
  }

  return [...testFiles].sort();
}

function isTestFile(file) {
  return TEST_FILE_PATTERN.test(file);
}

function findColocatedTestFiles(file) {
  if (!JAVASCRIPT_SOURCE_FILE_PATTERN.test(file)) {
    return [];
  }

  const parsedPath = path.posix.parse(file);
  const testFiles = TEST_FILE_SUFFIXES.flatMap((suffix) => {
    return TEST_FILE_EXTENSIONS.map((extension) => {
      return path.posix.join(
        parsedPath.dir,
        `${parsedPath.name}.${suffix}.${extension}`,
      );
    });
  });

  return testFiles.filter((testFile) => existsSync(testFile));
}

function toPackageRelativePath(workspacePackage, file) {
  return file.slice(workspacePackage.root.length + 1);
}

function findWorkspacePackage(file, workspacePackages) {
  return workspacePackages.find((workspacePackage) => {
    return (
      file === workspacePackage.root ||
      file.startsWith(`${workspacePackage.root}/`)
    );
  });
}

function loadWorkspacePackages() {
  const workspacePackageRoots = ["apps", "packages"].flatMap(
    (workspaceRoot) => {
      if (!existsSync(workspaceRoot)) {
        return [];
      }

      return readdirSync(workspaceRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.posix.join(workspaceRoot, entry.name));
    },
  );

  return workspacePackageRoots
    .map(loadWorkspacePackage)
    .filter(Boolean)
    .sort((left, right) => right.root.length - left.root.length);
}

function loadWorkspacePackage(packageRoot) {
  const packageJsonPath = path.posix.join(packageRoot, "package.json");

  if (!existsSync(packageJsonPath)) {
    return null;
  }

  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));

  return {
    name: packageJson.name,
    root: packageRoot,
    scripts: packageJson.scripts ?? {},
  };
}

function shouldRunChatBrowserSmoke(files) {
  return files.some((file) => {
    return (
      CHAT_BROWSER_SMOKE_FILES.has(file) ||
      CHAT_BROWSER_SMOKE_PREFIXES.some((prefix) => {
        return file === prefix || file.startsWith(prefix);
      })
    );
  });
}

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
