import { execSync } from "node:child_process";

const cache = new Map<string, boolean>();

export function hasCli(name: string): boolean {
  if (cache.has(name)) return cache.get(name)!;
  try {
    execSync(`which ${name}`, { stdio: "ignore" });
    cache.set(name, true);
    return true;
  } catch {
    cache.set(name, false);
    return false;
  }
}
