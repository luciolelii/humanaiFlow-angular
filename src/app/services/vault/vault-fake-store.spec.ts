import { ExecutionVaultCredentialsCallServiceFake } from '@services/llm-provider/execution-vault-credentials-call.fake';
import { firstValueFrom } from 'rxjs';
import { VaultCallServiceFake } from './vault-call.fake';
import { vaultFakeStore } from './vault-fake-store';

describe('vault fake store', () => {
  const vault = new VaultCallServiceFake();
  const credentials = new ExecutionVaultCredentialsCallServiceFake();

  it('offers only active credentials of the requested provider to an execution', async () => {
    const listed = await firstValueFrom(credentials.listForProvider('testProvider'));

    expect(listed.map((item) => item.id)).toEqual([
      'vault-secret-testprovider-1',
      'vault-secret-testprovider-2'
    ]);
    expect(vaultFakeStore.list().some((secret) => !secret.active)).toBe(true);
  });

  it('shows a credential created through the vault in the execution picker', async () => {
    const created = await firstValueFrom(vault.createSecret({
      label: 'testProvider - fresh key', provider: 'testProvider', value: 'sk-brand-new'
    }));
    const listed = await firstValueFrom(credentials.listForProvider('testProvider'));

    expect(listed.map((item) => item.id)).toContain(created.id);

    await firstValueFrom(vault.deleteSecret(created.id));
    const afterDelete = await firstValueFrom(credentials.listForProvider('testProvider'));
    expect(afterDelete.map((item) => item.id)).not.toContain(created.id);
  });
});
