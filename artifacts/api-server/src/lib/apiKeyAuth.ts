export interface ApiKeyCandidate {
  _id: unknown;
  keyHash: string;
}

export interface AutoGammaAuthenticationDependencies {
  findOwnerByPhoneNumberId(phoneNumberId: string): Promise<{ id: string } | null>;
  runWithTenant<T>(userId: string, callback: () => Promise<T>): Promise<T>;
  findActiveApiKeyCandidates(userId: string, keyPrefix: string): Promise<ApiKeyCandidate[]>;
  compareApiKey(rawKey: string, hash: string): Promise<boolean>;
  markApiKeyUsed(userId: string, keyId: unknown): Promise<void>;
  getCredentialPhoneNumberId(userId: string): Promise<string>;
}

export type AutoGammaAuthenticationResult =
  | { kind: "authorized"; userId: string }
  | { kind: "unauthorized" }
  | { kind: "mapping_conflict" };

export function extractAiravataApiKey(authorization: string | undefined): string | null {
  if (!authorization) return null;
  const match = /^Bearer\s+(aira_[a-f0-9]{40})$/i.exec(authorization);
  return match?.[1] ?? null;
}

export async function findMatchingApiKey<T extends ApiKeyCandidate>(
  rawKey: string,
  candidates: T[],
  compare: (rawKey: string, hash: string) => Promise<boolean>,
): Promise<T | null> {
  for (const candidate of candidates) {
    if (await compare(rawKey, candidate.keyHash)) return candidate;
  }
  return null;
}

export async function authenticateAutoGammaRequest(
  phoneNumberId: string,
  authorization: string | undefined,
  dependencies: AutoGammaAuthenticationDependencies,
): Promise<AutoGammaAuthenticationResult> {
  const rawKey = extractAiravataApiKey(authorization);
  if (!rawKey) return { kind: "unauthorized" };

  const owner = await dependencies.findOwnerByPhoneNumberId(phoneNumberId);
  if (!owner) return { kind: "unauthorized" };

  return dependencies.runWithTenant(owner.id, async () => {
    const candidates = await dependencies.findActiveApiKeyCandidates(
      owner.id,
      rawKey.slice(0, 12),
    );
    const matchingKey = await findMatchingApiKey(
      rawKey,
      candidates,
      dependencies.compareApiKey,
    );
    if (!matchingKey) return { kind: "unauthorized" };

    let credentialPhoneNumberId: string;
    try {
      credentialPhoneNumberId =
        await dependencies.getCredentialPhoneNumberId(owner.id);
    } catch {
      return { kind: "mapping_conflict" };
    }
    if (credentialPhoneNumberId !== phoneNumberId) {
      return { kind: "mapping_conflict" };
    }

    await dependencies.markApiKeyUsed(owner.id, matchingKey._id);
    return { kind: "authorized", userId: owner.id };
  });
}