import { stdout as output } from "node:process";
import type { CliEnv } from "../../env.ts";

/** Prints the resolved CLI environment in a human-readable format. */
export function printConfig(
  env: CliEnv,
  version: string,
  verbose = false,
): void {
  output.write("\x1b[1m\x1b[36mChatbot Experiments Configuration\x1b[0m\n\n");
  output.write(`\x1b[1mNODE_ENV\x1b[0m     ${env.nodeEnv}\n`);
  output.write(`\x1b[1mHOST\x1b[0m         ${env.host}\n`);
  output.write(`\x1b[1mPORT\x1b[0m         ${env.port}\n`);
  output.write(
    `\x1b[1mDATABASE_URL\x1b[0m  ${maskSensitive(env.databaseUrl)}\n`,
  );
  output.write(
    `\x1b[1mCORS_ORIGIN\x1b[0m  ${formatCorsOrigins(env.corsOrigins)}\n`,
  );

  if (verbose) {
    output.write(`\n\x1b[1mVersion\x1b[0m       ${version}\n`);
  }
}

function maskSensitive(url: string): string {
  if (!url) {
    return "(not set)";
  }

  try {
    const parsedUrl = new URL(url);

    if (!parsedUrl.password) {
      return url;
    }

    parsedUrl.password = "********";
    return parsedUrl.toString();
  } catch {
    return url.replace(/:([^:@]*)@/, ":********@");
  }
}

function formatCorsOrigins(origins: CliEnv["corsOrigins"]): string {
  return origins.map((origin) => origin.toString()).join(",");
}
