import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '@environment';
import { firstValueFrom } from 'rxjs';

import { AssistantCallService } from './assistant-call';

describe('AssistantCallService', () => {
  let service: AssistantCallService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        AssistantCallService,
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });

    service = TestBed.inject(AssistantCallService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('normalizes node families in assistant drafts and nested container subflows', async () => {
    const request = firstValueFrom(service.draft({ userPrompt: 'Create a flow' }));

    httpMock.expectOne(`${environment.apiUrl}/assistant/flows/draft`).flush({
      flow: {
        name: 'Loop draft',
        flow: {
          blocks: [{ id: 'root-block', typeName: 'LLMBlock', specificConfiguration: {} }],
          containers: [{
            id: 'loop-1',
            typeName: 'LoopContainer',
            specificConfiguration: {
              subFlow: {
                blocks: [{ id: 'body-block', typeName: 'LLMBlock', specificConfiguration: {} }],
                containers: [{
                  id: 'nested-container',
                  typeName: 'GenericContainer',
                  specificConfiguration: {
                    subFlow: { blocks: [], containers: [], connections: [], dependencies: [] }
                  }
                }],
                connections: [],
                dependencies: []
              },
              guardSubFlow: {
                blocks: [{ id: 'guard-block', typeName: 'SwitchBlock', specificConfiguration: {} }],
                containers: [],
                connections: [],
                dependencies: []
              }
            }
          }],
          connections: [],
          dependencies: []
        }
      }
    });

    const result = await request;
    const flow = result.flow!.flow;
    const loopConfiguration = flow.containers[0].specificConfiguration as Record<string, any>;

    expect(flow.blocks[0].nodeFamily).toBe('block');
    expect(flow.containers[0].nodeFamily).toBe('container');
    expect(loopConfiguration['subFlow'].blocks[0].nodeFamily).toBe('block');
    expect(loopConfiguration['subFlow'].containers[0].nodeFamily).toBe('container');
    expect(loopConfiguration['subFlow'].containers[0].specificConfiguration.subFlow).toEqual({
      blocks: [],
      containers: [],
      connections: [],
      dependencies: [],
      globalInputs: [],
      lanes: []
    });
    expect(loopConfiguration['guardSubFlow'].blocks[0].nodeFamily).toBe('block');
  });

  it('loads providers and provider-specific models from the configured retrievers', async () => {
    const providers = firstValueFrom(service.listProviders('/retriever/LLM/providers'));
    httpMock.expectOne(`${environment.apiUrl}/retriever/LLM/providers`).flush(['InternalOllama', 'OpenAI']);
    await expect(providers).resolves.toEqual(['InternalOllama', 'OpenAI']);

    const models = firstValueFrom(service.listModels('/retriever/LLM/models?provider={provider}', 'Open AI'));
    httpMock.expectOne(`${environment.apiUrl}/retriever/LLM/models?provider=Open%20AI`).flush(['gpt-oss:20b']);
    await expect(models).resolves.toEqual(['gpt-oss:20b']);
  });

  it('sends llmSelection only when supplied, for sessions and flow actions', async () => {
    const defaultSession = firstValueFrom(service.createSession({}));
    const defaultSessionRequest = httpMock.expectOne(`${environment.apiUrl}/assistant/sessions`);
    expect(defaultSessionRequest.request.body).toEqual({});
    defaultSessionRequest.flush({ id: 'session-default', messages: [] });
    await defaultSession;

    const selection = {
      provider: 'OpenAI',
      model: 'gpt-oss:20b',
      credentialId: 'credential-1',
      phaseModels: { planningModel: 'planning-model' }
    };
    const actionRequests = [
      ['draft', service.draft({ userPrompt: 'Create a flow', llmSelection: selection })],
      ['refine', service.refine({ userPrompt: 'Refine it', flow: { name: 'Flow', flow: emptyFlow() }, llmSelection: selection })],
      ['fix', service.fix({ userPrompt: 'Fix it', flow: { name: 'Flow', flow: emptyFlow() }, llmSelection: selection })],
      ['explain', service.explain({ userPrompt: 'Explain it', flow: { name: 'Flow', flow: emptyFlow() }, llmSelection: selection })]
    ] as const;

    for (const [action, observable] of actionRequests) {
      const result = firstValueFrom(observable);
      const request = httpMock.expectOne(`${environment.apiUrl}/assistant/flows/${action}`);
      expect(request.request.body.llmSelection).toEqual(selection);
      request.flush({ message: 'Done' });
      await result;
    }
  });
});

function emptyFlow() {
  return { blocks: [], containers: [], connections: [], dependencies: [], globalInputs: [], lanes: [] };
}
