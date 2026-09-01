import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '@environment';
import { firstValueFrom } from 'rxjs';
import { LlmProviderCallService } from './llm-provider-call';

describe('LlmProviderCallService', () => {
  let service: LlmProviderCallService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [LlmProviderCallService, provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(LlmProviderCallService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('maps provider capabilities from the backend', async () => {
    const result = firstValueFrom(service.listCapabilities());
    httpMock.expectOne(`${environment.apiUrl}/llm/providers`).flush([
      { name: 'InternalOllama', requiresCredential: false },
      { name: 'OpenAI', requiresCredential: true }
    ]);
    await expect(result).resolves.toEqual([
      { name: 'InternalOllama', requiresCredential: false },
      { name: 'OpenAI', requiresCredential: true }
    ]);
  });
});
