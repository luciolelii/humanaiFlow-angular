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
    const request = firstValueFrom(service.getSession('session-1'));

    httpMock.expectOne(`${environment.apiUrl}/assistant/sessions/session-1`).flush({
      id: 'session-1',
      selectedModel: 'model-1',
      messages: [],
      currentDraftFlow: {
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

    const session = await request;
    const flow = session.currentDraftFlow!.flow;
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
});
