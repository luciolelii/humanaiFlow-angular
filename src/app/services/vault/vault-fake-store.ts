import { VaultSecret, VaultSecretCreateRequest, VaultSecretUpdateRequest } from '@models/assistant';

/**
 * In-memory vault shared by the fake call services, so a credential created from
 * the assistant panel shows up in the execution credential picker, exactly as it
 * does against the real backend.
 */
class VaultFakeStore {
  private sequence = 0;
  private readonly secrets: VaultSecret[] = [
    {
      id: 'vault-secret-testprovider-1',
      label: 'testProvider - team key',
      provider: 'testProvider',
      description: 'Shared key for the demo workspace',
      active: true,
      maskedPreview: 'sk-...4f2a'
    },
    {
      id: 'vault-secret-testprovider-2',
      label: 'testProvider - personal key',
      provider: 'testProvider',
      active: true,
      maskedPreview: 'sk-...91cd'
    },
    {
      id: 'vault-secret-testprovider-3',
      label: 'testProvider - revoked key',
      provider: 'testProvider',
      description: 'Disabled, never offered to an execution',
      active: false,
      maskedPreview: 'sk-...0007'
    },
    {
      id: 'vault-secret-gemini-1',
      label: 'Gemini - default key',
      provider: 'Gemini',
      active: true,
      maskedPreview: 'AI...b31'
    }
  ];

  list(): VaultSecret[] {
    return this.secrets.map((secret) => ({ ...secret }));
  }

  /** Mirrors the server-side filter of the credential listing: owner, active, provider. */
  listActiveByProvider(provider: string): VaultSecret[] {
    const wanted = provider.trim().toLowerCase();
    return this.secrets
      .filter((secret) => secret.active && secret.provider.trim().toLowerCase() === wanted)
      .map((secret) => ({ ...secret }));
  }

  create(request: VaultSecretCreateRequest): VaultSecret {
    const created: VaultSecret = {
      id: `vault-secret-created-${++this.sequence}`,
      label: request.label,
      provider: request.provider,
      description: request.description,
      active: true,
      maskedPreview: `${request.value.slice(0, 2)}...${request.value.slice(-3)}`
    };
    this.secrets.push(created);
    return { ...created };
  }

  update(id: string, request: VaultSecretUpdateRequest): VaultSecret {
    const secret = this.secrets.find((item) => item.id === id);
    if (!secret) throw new Error('The credential no longer exists.');
    if (request.label !== undefined) secret.label = request.label;
    if (request.description !== undefined) secret.description = request.description;
    if (request.active !== undefined) secret.active = request.active;
    if (request.value) secret.maskedPreview = `${request.value.slice(0, 2)}...${request.value.slice(-3)}`;
    return { ...secret };
  }

  /** The backend soft-deletes, so the secret stays but stops being offered. */
  remove(id: string): void {
    const secret = this.secrets.find((item) => item.id === id);
    if (secret) secret.active = false;
  }
}

export const vaultFakeStore = new VaultFakeStore();
