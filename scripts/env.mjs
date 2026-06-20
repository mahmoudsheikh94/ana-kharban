import { existsSync, readFileSync } from "node:fs";

export function loadLocalEnv() {
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) {
      continue;
    }

    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    for (const line of lines) {
      if (!line || line.trim().startsWith("#") || !line.includes("=")) {
        continue;
      }

      const [key, ...rest] = line.split("=");
      if (!process.env[key]) {
        process.env[key] = rest.join("=");
      }
    }
  }
}
