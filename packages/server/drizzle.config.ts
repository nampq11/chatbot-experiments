const config = {
  schema: "../database/src/schema/index.ts",
  out: "./migrations",
  dialect: "mysql",
} as const;

export default config;
