import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '@environment';
import { firstValueFrom } from 'rxjs';

import { ContainersCallService } from './containers-call';

describe('ContainersCallService', () => {
  let service: ContainersCallService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ContainersCallService,
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });

    service = TestBed.inject(ContainersCallService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('retrieves container descriptors from the catalog endpoint and keeps shared definitions available in the schema root', async () => {
    const request = firstValueFrom(service.retrieveAllContainerTypes());

    const catalogRequest = httpMock.expectOne(`${environment.apiUrl}/containers/types/catalog`);
    expect(catalogRequest.request.method).toBe('GET');
    catalogRequest.flush({
      sharedDefinitions: {
        FlowData: {
          type: 'object',
          properties: {
            blocks: { type: 'array' }
          }
        }
      },
      descriptors: [
        {
          type: 'GenericContainer',
          description: 'Container node',
          userInteractive: false,
          hasExampleContainer: true,
          exampleContainerEndpoint: '/containers/custom-example',
          schema: {
            type: 'object',
            properties: {
              subFlow: {
                $ref: '#/sharedDefinitions/FlowData'
              }
            }
          }
        }
      ]
    });

    const containerTypes = await request;

    expect(containerTypes).toHaveLength(1);
    expect(containerTypes[0]).toEqual(expect.objectContaining({
      type: 'GenericContainer',
      family: 'container',
      hasExampleBlock: true,
      exampleBlockEndpoint: `${environment.apiUrl}/containers/custom-example`
    }));
    expect(containerTypes[0].schema).toEqual(expect.objectContaining({
      sharedDefinitions: {
        FlowData: {
          type: 'object',
          properties: {
            blocks: { type: 'array' }
          }
        }
      }
    }));
  });

  it('uses the example endpoint exposed by the catalog when creating an empty container', async () => {
    const typesRequest = firstValueFrom(service.retrieveAllContainerTypes());

    httpMock.expectOne(`${environment.apiUrl}/containers/types/catalog`).flush({
      descriptors: [
        {
          type: 'GenericContainer',
          description: 'Container node',
          userInteractive: false,
          hasExampleContainer: true,
          exampleContainerEndpoint: '/containers/custom-example',
          schema: {
            type: 'object',
            properties: {
              name: { type: 'string' }
            }
          }
        }
      ]
    });

    await typesRequest;

    const createRequest = firstValueFrom(service.createEmptyContainer('GenericContainer'));

    const exampleRequest = httpMock.expectOne(`${environment.apiUrl}/containers/custom-example`);
    expect(exampleRequest.request.method).toBe('GET');
    exampleRequest.flush({
      id: 'container-1',
      name: 'Container',
      typeName: 'GenericContainer',
      specificConfiguration: {
        type: 'GenericContainerConfiguration',
        name: 'Container'
      },
      inputs: [],
      outputs: []
    });

    const container = await createRequest;

    expect(container).toEqual(expect.objectContaining({
      id: 'container-1',
      typeName: 'GenericContainer',
      name: 'Container',
      nodeFamily: 'container'
    }));
  });

  it('rejects the legacy container catalog array format', async () => {
    const request = firstValueFrom(service.retrieveAllContainerTypes());

    httpMock.expectOne(`${environment.apiUrl}/containers/types/catalog`).flush([
      {
        type: 'GenericContainer'
      }
    ]);

    await expect(request).rejects.toThrow(
      'Invalid container catalog response: expected reduced catalog format with a descriptors array'
    );
  });

  it('fills missing required boolean fields using descriptor schema defaults', async () => {
    const typesRequest = firstValueFrom(service.retrieveAllContainerTypes());

    httpMock.expectOne(`${environment.apiUrl}/containers/types/catalog`).flush({
      descriptors: [
        {
          type: 'LoopContainer',
          description: 'Loop container node',
          userInteractive: false,
          hasExampleContainer: true,
          exampleContainerEndpoint: '/containers/types/LoopContainer/example',
          schema: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              maxIterations: { type: 'integer' },
              useLlm: { type: 'boolean' }
            },
            required: ['name', 'maxIterations', 'useLlm']
          }
        }
      ]
    });

    await typesRequest;

    const request = firstValueFrom(service.createContainer('container-1', {
      typeName: 'LoopContainer',
      specificConfiguration: {
        name: 'Loop',
        maxIterations: 3
      }
    }));

    const createRequest = httpMock.expectOne(`${environment.apiUrl}/containers`);
    expect(createRequest.request.method).toBe('POST');
    expect(createRequest.request.body.useLlm).toBe(false);
    expect(createRequest.request.body.useLLM).toBeUndefined();

    createRequest.flush({
      id: 'container-1',
      name: 'Loop',
      typeName: 'LoopContainer',
      specificConfiguration: {
        type: 'LoopContainerConfiguration',
        name: 'Loop',
        maxIterations: 3,
        useLlm: false
      },
      inputs: [],
      outputs: []
    });

    await expect(request).resolves.toEqual(expect.objectContaining({
      id: 'container-1',
      typeName: 'LoopContainer',
      nodeFamily: 'container'
    }));
  });
});
