import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '@environment';
import { firstValueFrom } from 'rxjs';

import { BlocksCallService } from './blocks-call';

describe('BlocksCallService', () => {
  let service: BlocksCallService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        BlocksCallService,
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });

    service = TestBed.inject(BlocksCallService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('retrieves block descriptors from the catalog endpoint and attaches shared definitions to each schema', async () => {
    const request = firstValueFrom(service.retrieveAllBlocksTypes());

    const catalogRequest = httpMock.expectOne(`${environment.apiUrl}/blocks/types/catalog`);
    expect(catalogRequest.request.method).toBe('GET');
    catalogRequest.flush({
      sharedDefinitions: {
        LLMDescriptor: {
          type: 'object',
          properties: {
            provider: { type: 'string' },
            model: { type: 'string' }
          }
        }
      },
      descriptors: [
        {
          type: 'LLMBlock',
          description: 'LLM node',
          userInteractive: false,
          schema: {
            type: 'object',
            properties: {
              llmDescriptor: {
                $ref: '#/sharedDefinitions/LLMDescriptor'
              }
            }
          }
        }
      ]
    });

    const blockTypes = await request;

    expect(blockTypes).toHaveLength(1);
    expect(blockTypes[0]).toEqual(expect.objectContaining({
      type: 'LLMBlock',
      family: 'block',
      description: 'LLM node'
    }));
    expect(blockTypes[0].schema).toEqual(expect.objectContaining({
      type: 'object',
      sharedDefinitions: {
        LLMDescriptor: {
          type: 'object',
          properties: {
            provider: { type: 'string' },
            model: { type: 'string' }
          }
        }
      },
      properties: {
        llmDescriptor: {
          $ref: '#/sharedDefinitions/LLMDescriptor'
        }
      }
    }));
  });

  it('rejects the legacy block catalog array format', async () => {
    const request = firstValueFrom(service.retrieveAllBlocksTypes());

    httpMock.expectOne(`${environment.apiUrl}/blocks/types/catalog`).flush([
      {
        type: 'LLMBlock'
      }
    ]);

    await expect(request).rejects.toThrow(
      'Invalid block catalog response: expected reduced catalog format with a descriptors array'
    );
  });
});
