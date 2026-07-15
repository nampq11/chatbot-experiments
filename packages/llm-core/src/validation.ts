import type { Static, TSchema } from "@sinclair/typebox";
import { TypeCompiler } from "@sinclair/typebox/compiler";

/** Validates unknown tool arguments against a TypeBox schema. */
export function validateToolArguments<TParameters extends TSchema>(
  schema: TParameters,
  value: unknown,
): Static<TParameters> {
  const validator = TypeCompiler.Compile(schema);
  if (validator.Check(value)) {
    return value as Static<TParameters>;
  }

  const firstError = [...validator.Errors(value)][0];
  const message = firstError
    ? `Invalid tool arguments at ${firstError.path || "/"}: ${firstError.message}`
    : "Invalid tool arguments";
  throw new Error(message);
}
