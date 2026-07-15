import { stderr } from "node:process";

/** Runs a CLI entry point and prints user-facing errors before exiting with failure. */
export async function withCliErrorHandling(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (error: unknown) {
    if (error instanceof Error) {
      stderr.write(`\x1b[1m\x1b[31mError:\x1b[0m ${error.message}\n`);
      if (process.env.DEBUG === "1") {
        stderr.write(`\n${error.stack}\n`);
      }
    } else {
      stderr.write(`\x1b[1m\x1b[31mError:\x1b[0m An unknown error occurred\n`);
    }
    process.exit(1);
  }
}
