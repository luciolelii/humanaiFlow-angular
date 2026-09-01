import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '@environment';
import { firstValueFrom } from 'rxjs';
import { ExecutionVaultCredentialsCallService } from './execution-vault-credentials-call';

describe('ExecutionVaultCredentialsCallService', () => {
  let service: ExecutionVaultCredentialsCallService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ExecutionVaultCredentialsCallService, provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(ExecutionVaultCredentialsCallService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('requests the credentials of a single provider and maps the vault secret id', async () => {
    const result = firstValueFrom(service.listForProvider('OpenAI'));
    const request = httpMock.expectOne(
      (candidate) => candidate.url === `${environment.apiUrl}/secure-retriever/UserSecrets/forProvider/items`
    );

    expect(request.request.params.get('provider')).toBe('OpenAI');
    request.flush({
      items: [
        {
          data: 'vault-secret-1',
          descriptor: { label: 'OpenAI key', description: 'shared', meta: { provider: 'OpenAI' } }
        },
        {
          data: '',
          descriptor: { label: 'Broken entry', meta: { provider: 'OpenAI' } }
        }
      ]
    });

    await expect(result).resolves.toEqual([{
      id: 'vault-secret-1',
      label: 'OpenAI key',
      description: 'shared',
      provider: 'OpenAI'
    }]);
  });
});
