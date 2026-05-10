import { spawn } from "node:child_process";

const DEFAULT_TIMEOUT_MS = 60_000;

export function runCli(
  cmd: string,
  args: string[],
  opts: { stdin?: string; timeoutMs?: number } = {}
): Promise<string> {
  return new Promise((resolve, reject) => {
    const { stdin, timeoutMs = DEFAULT_TIMEOUT_MS } = opts;
    const proc = spawn(cmd, args, { stdio: "pipe" });
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];

    proc.stdout.on("data", (d: Buffer) => chunks.push(d));
    proc.stderr.on("data", (d: Buffer) => errChunks.push(d));

    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error(`${cmd} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(Buffer.concat(chunks).toString("utf8").trim());
      } else {
        const stderr = Buffer.concat(errChunks).toString("utf8").trim();
        reject(new Error(`${cmd} exited with code ${code}: ${stderr}`));
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    if (stdin) {
      proc.stdin.write(stdin);
      proc.stdin.end();
    }
  });
}
