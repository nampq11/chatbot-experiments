import { readFileSync } from "node:fs";

const commitMessageFile = process.argv[2];

if (!commitMessageFile) {
  console.error("❌ Missing commit message file path.");
  process.exit(1);
}

const subject = readFileSync(commitMessageFile, "utf8")
  .split("\n")
  .map((line) => line.trim())
  .find((line) => line.length > 0);

if (!subject) {
  console.error("❌ Commit message cannot be empty.");
  process.exit(1);
}

if (isAllowedSpecialCommit(subject) || isConventionalCommit(subject)) {
  process.exit(0);
}

console.error(
  "❌ Commit message must use the repository's conventional format.",
);
console.error("Allowed examples:");
console.error("  feat(chat): add session delete confirmation");
console.error("  fix(server-agent): handle empty stream frames");
console.error("  refactor(core-store): simplify identity selectors");
console.error("  docs: update setup instructions");
console.error("  test(web-chat): cover first-message layout");
console.error("  chore(ci): cache Playwright browsers");
console.error("  ci(web): publish preview artifacts");
process.exit(1);

function isAllowedSpecialCommit(subjectLine) {
  return (
    /^(Merge|Revert ")/.test(subjectLine) ||
    /^(fixup|squash)! /.test(subjectLine)
  );
}

function isConventionalCommit(subjectLine) {
  return /^(docs(?:\([a-z0-9][a-z0-9-]*\))?|(?:feat|fix|refactor|test|chore|ci)\([a-z0-9][a-z0-9-]*\))!?: .+/.test(
    subjectLine,
  );
}
