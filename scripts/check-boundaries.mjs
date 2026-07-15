import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();
const ignoredDirectoryNames = new Set([
  ".next",
  ".turbo",
  "dist",
  "node_modules",
]);
const sourceFileExtensions = new Set([".ts", ".tsx"]);

const rules = [
  {
    name: "llm-core-no-runtime-imports",
    root: "packages/llm-core",
    forbiddenImports: [
      {
        pattern: /^openai($|\/)/,
        rule: "packages/llm-core must not import provider SDKs; keep it provider-neutral.",
      },
      {
        pattern:
          /^@dentaltrip-ai\/(server|ai|agent-core|core|client|views|ui)($|\/)/,
        rule: "packages/llm-core must not import higher-level DentalTrip packages.",
      },
    ],
    forbiddenPatterns: [
      {
        pattern: /\bprocess\.env\b/,
        rule: "packages/llm-core must not read process.env; inject configuration at runtime boundaries.",
      },
    ],
  },
  {
    name: "ai-no-server-or-env-imports",
    root: "packages/ai",
    forbiddenImports: [
      {
        pattern: /^@dentaltrip-ai\/(server|core|client|views|ui)($|\/)/,
        rule: "packages/ai must not import server, frontend, or UI packages.",
      },
    ],
    forbiddenPatterns: [
      {
        pattern: /\bprocess\.env\b/,
        rule: "packages/ai must not read process.env; server code injects provider configuration.",
      },
    ],
  },
  {
    name: "agent-core-no-provider-or-server-imports",
    root: "packages/agent-core",
    forbiddenImports: [
      {
        pattern: /^openai($|\/)/,
        rule: "packages/agent-core must not import provider SDKs; providers belong in packages/ai.",
      },
      {
        pattern: /^@dentaltrip-ai\/(server|ai|core|client|views|ui)($|\/)/,
        rule: "packages/agent-core must not import server, provider, frontend, or UI packages.",
      },
    ],
    forbiddenPatterns: [
      {
        pattern: /\bprocess\.env\b/,
        rule: "packages/agent-core must not read process.env; inject runtime configuration.",
      },
    ],
  },
  {
    name: "agent-runtime-no-server-cli-or-frontend-imports",
    root: "packages/agent-runtime",
    forbiddenImports: [
      {
        pattern: /^@dentaltrip-ai\/(server|cli|client|views|ui)($|\/)/,
        rule: "packages/agent-runtime must not import server, CLI, frontend, or UI packages.",
      },
      {
        pattern: /^(express|commander|react|react-dom)($|\/)/,
        rule: "packages/agent-runtime must not import HTTP, CLI, or frontend libraries.",
      },
      {
        pattern: /^next($|\/)/,
        rule: "packages/agent-runtime must not import Next.js APIs.",
      },
    ],
  },
  {
    name: "core-no-framework-or-adapter-imports",
    root: "packages/core",
    forbiddenImports: [
      {
        pattern: /^@dentaltrip-ai\/(server|client|database|views|ui)($|\/)/,
        rule: "packages/core must not import app, frontend, UI, server, or database packages.",
      },
      {
        pattern:
          /^(express|drizzle-orm|mysql2|react|react-dom|@tanstack\/react-query|zustand|commander)($|\/)/,
        rule: "packages/core must not import framework, database, frontend, or CLI libraries.",
      },
      {
        pattern: /^next($|\/)/,
        rule: "packages/core must not import Next.js APIs.",
      },
      {
        pattern: /^node:process$/,
        rule: "packages/core must not import Node process APIs; inject runtime data at adapters.",
      },
    ],
    forbiddenPatterns: [
      {
        pattern: /\bprocess\.env\b/,
        rule: "packages/core must not read process.env; inject runtime data at adapters.",
      },
    ],
  },
  {
    name: "database-no-framework-or-client-imports",
    root: "packages/database",
    forbiddenImports: [
      {
        pattern: /^@dentaltrip-ai\/(server|cli|client|views|ui)($|\/)/,
        rule: "packages/database must not import server, CLI, frontend, or UI packages.",
      },
      {
        pattern: /^(express|commander|react|react-dom)($|\/)/,
        rule: "packages/database must not import HTTP, CLI, or frontend libraries.",
      },
      {
        pattern: /^next($|\/)/,
        rule: "packages/database must not import Next.js APIs.",
      },
    ],
  },

  {
    name: "server-no-cli-imports",
    root: "packages/server",
    forbiddenImports: [
      {
        pattern: /^@dentaltrip-ai\/cli($|\/)/,
        rule: "packages/server must not import the CLI package.",
      },
      {
        pattern: /^(commander|node:readline|node:readline\/promises)$/,
        rule: "packages/server must stay HTTP-only and must not import CLI or terminal libraries.",
      },
    ],
  },
  {
    name: "cli-no-server-imports",
    root: "packages/cli",
    forbiddenImports: [
      {
        pattern: /^@dentaltrip-ai\/server($|\/)/,
        rule: "packages/cli must not import the server package; use core, database, and runtime packages instead.",
      },
      {
        pattern: /^(express|cors)($|\/)/,
        rule: "packages/cli must not import HTTP server libraries.",
      },
    ],
  },
  {
    name: "views-no-platform-imports",
    root: "packages/views",
    forbiddenImports: [
      {
        pattern: /^next($|\/)/,
        rule: "packages/views must not import next/*; use app-level adapters or shared UI abstractions instead.",
      },
      {
        pattern: /^react-router-dom$/,
        rule: "packages/views must not import react-router-dom; use NavigationAdapter from @dentaltrip-ai/client/navigation instead.",
      },
    ],
  },
  {
    name: "views-no-zustand-stores",
    root: "packages/views",
    forbiddenImports: [
      {
        pattern: /^zustand($|\/)/,
        rule: "packages/views must not define Zustand stores; move store definitions to packages/client.",
      },
    ],
  },
  {
    name: "client-no-platform-imports",
    root: "packages/client",
    forbiddenImports: [
      {
        pattern: /^next($|\/)/,
        rule: "packages/client must not import next/*; inject platform behavior from apps/web instead.",
      },
      {
        pattern: /^react-dom($|\/)/,
        rule: "packages/client must not import react-dom; keep client headless and platform-neutral.",
      },
    ],
  },
  {
    name: "client-no-platform-globals",
    root: "packages/client",
    forbiddenPatterns: [
      {
        pattern: /\bprocess\.env\b/,
        rule: "packages/client must not read process.env; inject configuration from the app boundary instead.",
      },
      {
        pattern: /\blocalStorage\b/,
        rule: "packages/client must not read localStorage directly; use a StorageAdapter instead.",
      },
    ],
  },
  {
    name: "ui-no-client-imports",
    root: "packages/ui",
    forbiddenImports: [
      {
        pattern: /^@dentaltrip-ai\/client($|\/)/,
        rule: "packages/ui must not import @dentaltrip-ai/client; keep UI components free of business logic.",
      },
    ],
  },
];

const importPatterns = [
  /\bimport\s+(?:type\s+)?[\s\S]*?\s+from\s+["']([^"']+)["']/g,
  /\bimport\s+["']([^"']+)["']/g,
  /\bexport\s+(?:type\s+)?[\s\S]*?\s+from\s+["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
];

const violations = rules.flatMap(checkRule);

if (violations.length === 0) {
  console.log("Package boundary check passed.");
  process.exit(0);
}

console.error("Package boundary violations found:");
for (const violation of violations) {
  console.error(
    `${violation.file}:${violation.line} ${violation.ruleName}: ${violation.rule}`,
  );
  if (violation.detail) {
    console.error(`  Matched: ${violation.detail}`);
  }
}

process.exit(1);

function checkRule(rule) {
  const rootPath = path.join(workspaceRoot, rule.root);
  const files = collectSourceFiles(rootPath);

  return files.flatMap((filePath) => {
    const content = readFileSync(filePath, "utf8");
    const relativePath = toPosixPath(path.relative(workspaceRoot, filePath));
    const fileViolations = [];

    if (rule.forbiddenImports) {
      const imports = extractImports(content);

      for (const importedModule of imports) {
        for (const forbiddenImport of rule.forbiddenImports) {
          if (!forbiddenImport.pattern.test(importedModule.moduleName)) {
            continue;
          }

          fileViolations.push({
            file: relativePath,
            line: lineNumberAt(content, importedModule.index),
            rule: forbiddenImport.rule,
            ruleName: rule.name,
            detail: `import "${importedModule.moduleName}"`,
          });
        }
      }
    }

    if (rule.forbiddenPatterns) {
      const contentWithoutComments = stripComments(content);

      for (const forbiddenPattern of rule.forbiddenPatterns) {
        for (const match of contentWithoutComments.matchAll(
          toGlobalRegExp(forbiddenPattern.pattern),
        )) {
          fileViolations.push({
            file: relativePath,
            line: lineNumberAt(contentWithoutComments, match.index ?? 0),
            rule: forbiddenPattern.rule,
            ruleName: rule.name,
            detail: match[0],
          });
        }
      }
    }

    return fileViolations;
  });
}

function collectSourceFiles(directory) {
  const entries = readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (!ignoredDirectoryNames.has(entry.name)) {
        files.push(...collectSourceFiles(entryPath));
      }
      continue;
    }

    if (entry.isFile() && sourceFileExtensions.has(path.extname(entry.name))) {
      files.push(entryPath);
    }
  }

  return files;
}

function extractImports(content) {
  const imports = [];

  for (const pattern of importPatterns) {
    for (const match of content.matchAll(pattern)) {
      imports.push({
        index: match.index ?? 0,
        moduleName: match[1],
      });
    }
  }

  return imports.sort((a, b) => a.index - b.index);
}

function stripComments(content) {
  let result = "";
  let index = 0;
  let inBlockComment = false;

  while (index < content.length) {
    const current = content[index];
    const next = content[index + 1];

    if (inBlockComment) {
      if (current === "*" && next === "/") {
        result += "  ";
        index += 2;
        inBlockComment = false;
        continue;
      }

      result += current === "\n" ? "\n" : " ";
      index += 1;
      continue;
    }

    if (current === "/" && next === "*") {
      result += "  ";
      index += 2;
      inBlockComment = true;
      continue;
    }

    if (current === "/" && next === "/") {
      result += "  ";
      index += 2;

      while (index < content.length && content[index] !== "\n") {
        result += " ";
        index += 1;
      }
      continue;
    }

    result += current;
    index += 1;
  }

  return result;
}

function toGlobalRegExp(pattern) {
  return new RegExp(
    pattern.source,
    pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`,
  );
}

function lineNumberAt(content, index) {
  return content.slice(0, index).split("\n").length;
}

function toPosixPath(filePath) {
  return filePath.split(path.sep).join("/");
}
