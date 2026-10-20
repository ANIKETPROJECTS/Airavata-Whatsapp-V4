import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const apiServerDir = path.resolve(scriptDir, "..");
const tempDir = await mkdtemp(path.join(apiServerDir, ".whatsapp-onboarding-tests-"));
const testBundle = path.join(tempDir, "whatsappOnboarding.test.mjs");

try {
  const mockModules = {
    user: `
      const state = globalThis.__waOnboardingTestState ??= { user: null, credential: null };
      const getPath = (object, path) => path.split(".").reduce((value, key) => value?.[key], object);
      const setPath = (object, path, value) => {
        const keys = path.split(".");
        const last = keys.pop();
        const target = keys.reduce((value, key) => value[key] ??= {}, object);
        target[last] = value;
      };
      const query = (value) => ({ select() { return this; }, lean: async () => value });
      export const UserModel = {
        findById: (id) => query(String(state.user?._id) === String(id) ? state.user : null),
        find: () => ({ select() { return this; }, limit() { return this; }, lean: async () => state.user ? [state.user] : [] }),
        updateOne: async (_filter, update) => {
          if (!state.user) return;
          for (const [key, value] of Object.entries(update.$set ?? {})) setPath(state.user, key, value);
          for (const [key, value] of Object.entries(update.$inc ?? {})) setPath(state.user, key, (getPath(state.user, key) ?? 0) + value);
          for (const key of Object.keys(update.$unset ?? {})) {
            const keys = key.split(".");
            const last = keys.pop();
            const target = keys.reduce((value, name) => value?.[name], state.user);
            if (target) delete target[last];
          }
        },
      };
    `,
    credential: `
      const state = globalThis.__waOnboardingTestState ??= { user: null, credential: null };
      export const WhatsAppCredentialModel = {
        findOne: () => ({ select() { return this; }, lean: async () => state.credential }),
      };
    `,
    crypto: `export const decryptToken = (value) => value === "encrypted-token" ? "mock-access-token" : "";`,
    tenant: `export const runWithTenant = (_tenantId, callback) => callback();`,
    logger: `export const logger = { error() {}, warn() {}, info() {} };`,
  };
  await build({
    entryPoints: [path.join(apiServerDir, "src/lib/whatsappOnboarding.test.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: testBundle,
    external: ["mongoose", "mongodb"],
    plugins: [{
      name: "onboarding-test-mocks",
      setup(build) {
        build.onResolve({ filter: /.*/ }, (args) => {
          if (!args.importer.endsWith("whatsappOnboarding.ts")) return;
          const match = {
            "../models/User": "user",
            "../models/WhatsAppCredential": "credential",
            "./credentialCrypto": "crypto",
            "./tenantDatabase": "tenant",
            "./logger": "logger",
          }[args.path];
          return match ? { path: match, namespace: "onboarding-test" } : undefined;
        });
        build.onLoad({ filter: /.*/, namespace: "onboarding-test" }, (args) => ({
          contents: mockModules[args.path],
          loader: "js",
        }));
      },
    }],
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
