import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '@environment';
import { DEFAULT_NODE_CAPABILITIES } from '@models/flow';
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

  it('parses a terminal EndBlock descriptor capabilities and falls back to defaults when absent', async () => {
    const request = firstValueFrom(service.retrieveAllBlocksTypes());

    httpMock.expectOne(`${environment.apiUrl}/blocks/types/catalog`).flush({
      descriptors: [
        {
          type: 'EndBlock',
          description: 'Terminal outcome',
          userInteractive: false,
          schema: { type: 'object', properties: {} },
          capabilities: {
            visualRole: 'END',
            terminal: true,
            biasAnnotationsAllowed: false,
            allowsIncomingConnections: true,
            allowsOutgoingConnections: false,
            canDependOnOtherNodes: false,
            canHaveDependentNodes: false
          }
        },
        {
          type: 'LLMBlock',
          description: 'LLM node',
          userInteractive: false,
          schema: { type: 'object', properties: {} }
        }
      ]
    });

    const blockTypes = await request;

    expect(blockTypes.find((type) => type.type === 'EndBlock')?.capabilities).toEqual({
      visualRole: 'END',
      terminal: true,
      biasAnnotationsAllowed: false,
      allowsIncomingConnections: true,
      allowsOutgoingConnections: false,
      canDependOnOtherNodes: false,
      canHaveDependentNodes: false
    });
    expect(blockTypes.find((type) => type.type === 'LLMBlock')?.capabilities).toEqual(DEFAULT_NODE_CAPABILITIES);
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

  it('loads and normalizes the dynamic bias annotations descriptor', async () => {
    const request = firstValueFrom(service.retrieveBiasAnnotationsDescriptor());
    const httpRequest = httpMock.expectOne(`${environment.apiUrl}/blocks/bias-annotations/descriptor`);
    expect(httpRequest.request.method).toBe('GET');
    httpRequest.flush({
      type: 'BiasAnnotation', blockProperty: 'biasAnnotations', multiple: true, maxItems: 3,
      schema: { type: 'object', required: ['category'], properties: { category: { type: 'string' } } },
      options: { category: [{ value: 'DYNAMIC_VALUE', label: 'Dynamic label', description: 'Dynamic description' }] },
      defaults: { status: 'DYNAMIC_DEFAULT' }, serverGeneratedFields: ['id']
    });

    await expect(request).resolves.toEqual(expect.objectContaining({
      blockProperty: 'biasAnnotations', maxItems: 3,
      options: { category: [{ value: 'DYNAMIC_VALUE', label: 'Dynamic label', description: 'Dynamic description' }] }
    }));
  });

  it('retrieves and caches type-level bias capabilities', async () => {
    const first = firstValueFrom(service.retrieveBiasCapabilities('LLMBlock'));
    const request = httpMock.expectOne(`${environment.apiUrl}/blocks/types/LLMBlock/bias-capabilities`);
    expect(request.request.method).toBe('GET');
    request.flush({
      blockType: 'LLMBlock',
      supported: true,
      isolatedExperimentSupported: true,
      fullFlowExperimentSupported: true,
      externalSideEffects: false,
      configurationDependent: false,
      activationModes: ['PROMPT_DIRECTIVE']
    });

    await expect(first).resolves.toEqual(expect.objectContaining({
      blockType: 'LLMBlock', activationModes: ['PROMPT_DIRECTIVE']
    }));
    await expect(firstValueFrom(service.retrieveBiasCapabilities('LLMBlock'))).resolves.toEqual(expect.objectContaining({
      supported: true
    }));
  });

  it('posts the configured block for instance-specific bias capabilities', async () => {
    const block = {
      id: 'conditional-1',
      name: 'Conditional',
      inputs: [],
      outputs: [{ name: 'true', type: 'TEXT', multiple: false }],
      specificConfiguration: { useLlm: true },
      typeName: 'ConditionalBlock',
      nodeFamily: 'block' as const
    };
    const response = firstValueFrom(service.retrieveBiasCapabilitiesForInstance('ConditionalBlock', block));
    const request = httpMock.expectOne(`${environment.apiUrl}/blocks/types/ConditionalBlock/bias-capabilities`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(block);
    request.flush({
      blockType: 'ConditionalBlock',
      supported: true,
      isolatedExperimentSupported: true,
      fullFlowExperimentSupported: true,
      externalSideEffects: false,
      configurationDependent: true,
      activationModes: ['PROMPT_DIRECTIVE', 'INPUT_TRANSFORMATION']
    });

    await expect(response).resolves.toEqual(expect.objectContaining({
      configurationDependent: true,
      activationModes: ['PROMPT_DIRECTIVE', 'INPUT_TRANSFORMATION']
    }));
  });
});
