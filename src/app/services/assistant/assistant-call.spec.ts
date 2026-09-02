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
    const request = firstValueFrom(service.getCall('call-1'));

    httpMock.expectOne(`${environment.apiUrl}/assistant/calls/call-1`).flush({
      id: 'call-1',
      sessionId: 'session-1',
      status: 'COMPLETED',
      phase: 'completed',
      intent: 'DRAFT',
      flowResult: {
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
        },
        valid: true,
        validationErrors: [],
        warnings: [],
        assistantRationale: 'Done'
      }
    });

    const result = await request;
    const flow = result.actionResult!.flow!.flow;
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

  it('sends llmSelection only when supplied when creating a session', async () => {
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
    const selectionSession = firstValueFrom(service.createSession({ llmSelection: selection }));
    const selectionSessionRequest = httpMock.expectOne(`${environment.apiUrl}/assistant/sessions`);
    expect(selectionSessionRequest.request.body).toEqual({ llmSelection: selection });
    selectionSessionRequest.flush({ id: 'session-selection', messages: [] });
    await selectionSession;
  });

  it('submits a session message and polls the call, then cancels it', async () => {
    const accepted = firstValueFrom(service.submitMessage('session-1', {
      message: 'Create a flow',
      flow: { name: 'Flow', flow: emptyFlow() }
    }));
    const submitRequest = httpMock.expectOne(`${environment.apiUrl}/assistant/sessions/session-1/messages`);
    expect(submitRequest.request.body).toEqual({
      message: 'Create a flow',
      flow: { name: 'Flow', flow: emptyFlow() }
    });
    submitRequest.flush({ sessionId: 'session-1', callId: 'call-1' });
    await expect(accepted).resolves.toEqual({ sessionId: 'session-1', callId: 'call-1' });

    const call = firstValueFrom(service.getCall('call-1'));
    httpMock.expectOne(`${environment.apiUrl}/assistant/calls/call-1`).flush({
      id: 'call-1',
      sessionId: 'session-1',
      status: 'RUNNING',
      phase: 'planning',
      progressMessage: 'Planning workflow blocks',
      intent: 'DRAFT'
    });
    const runningCall = await call;
    expect(runningCall.status).toBe('RUNNING');
    expect(runningCall.phase).toBe('planning');

    const cancelled = firstValueFrom(service.cancelCall('call-1'));
    const cancelRequest = httpMock.expectOne(`${environment.apiUrl}/assistant/calls/call-1/cancel`);
    expect(cancelRequest.request.method).toBe('PUT');
    cancelRequest.flush({
      id: 'call-1',
      sessionId: 'session-1',
      status: 'CANCELLED',
      phase: 'cancelled',
      progressMessage: 'Assistant request cancelled',
      intent: 'DRAFT'
    });
    const cancelledCall = await cancelled;
    expect(cancelledCall.status).toBe('CANCELLED');
  });
});

function emptyFlow() {
  return { blocks: [], containers: [], connections: [], dependencies: [], globalInputs: [], lanes: [] };
}
