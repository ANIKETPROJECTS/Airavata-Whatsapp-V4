import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const apiServerDir = path.resolve(scriptDir, "..");
const tempDir = await mkdtemp(path.join(os.tmpdir(), "airavata-inbound-media-tests-"));
const testBundle = path.join(tempDir, "inboundMedia.test.mjs");

try {
  await build({
    entryPoints: [path.join(apiServerDir, "src/lib/inboundMedia.test.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: testBundle,
    logLevel: "silent",
  });

  const result = spawnSync(process.execPath, ["--test", testBundle], {
    cwd: apiServerDir,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
