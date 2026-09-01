import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '@environment';
import { firstValueFrom } from 'rxjs';
import { CREDENTIAL_ERROR_MESSAGES } from './credential-error-messages';
import { VaultCallService } from './vault-call';

describe('VaultCallService', () => {
  let service: VaultCallService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [VaultCallService, provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(VaultCallService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('maps secret metadata without exposing a value', async () => {
    const result = firstValueFrom(service.listSecrets());
    httpMock.expectOne(`${environment.apiUrl}/vault/secrets`).flush([{
      id: 'credential-1',
      label: 'OpenAI key',
      provider: 'OpenAI',
      active: true,
      maskedPreview: '***',
      value: 'must-not-reach-the-ui'
    }]);

    await expect(result).resolves.toEqual([{
      id: 'credential-1',
      label: 'OpenAI key',
      provider: 'OpenAI',
      active: true,
      maskedPreview: '***'
    }]);
  });

  it('sends a value only on explicit create or rotation requests', async () => {
    const create = firstValueFrom(service.createSecret({
      label: 'OpenAI key', provider: 'OpenAI', value: 'secret-value'
    }));
    const createRequest = httpMock.expectOne(`${environment.apiUrl}/vault/secrets`);
    expect(createRequest.request.body).toEqual({ label: 'OpenAI key', provider: 'OpenAI', value: 'secret-value' });
    createRequest.flush({ id: 'credential-1', label: 'OpenAI key', provider: 'OpenAI', active: true });
    await create;

    const update = firstValueFrom(service.updateSecret('credential-1', { value: 'rotated-value' }));
    const updateRequest = httpMock.expectOne(`${environment.apiUrl}/vault/secrets/credential-1`);
    expect(updateRequest.request.body).toEqual({ value: 'rotated-value' });
    updateRequest.flush({ id: 'credential-1', label: 'OpenAI key', provider: 'OpenAI', active: true });
    await update;
  });

  it('falls back to the shared credential message when the backend sends no body', async () => {
    const result = firstValueFrom(service.deleteSecret('credential-1'));
    httpMock.expectOne(`${environment.apiUrl}/vault/secrets/credential-1`)
      .flush(null, { status: 409, statusText: 'Conflict' });

    await expect(result).rejects.toThrow(CREDENTIAL_ERROR_MESSAGES[409]);
  });
});
