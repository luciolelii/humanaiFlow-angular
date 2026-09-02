import {
  AssistantCallAccepted,
  AssistantCallState,
  AssistantConfig,
  AssistantDraftPayload,
  AssistantFlowActionResult,
  AssistantIntent,
  AssistantSessionMessageRequest,
  AssistantSessionRequest,
  AssistantSessionState
} from '@models/assistant';
import { FlowData } from '@models/flow';
import { Observable, of, throwError } from 'rxjs';
import { AssistantCallServiceBase } from './assistant-call.base';

export class AssistantCallServiceFake extends AssistantCallServiceBase {
  private readonly models = ['llama3.1:8b', 'qwen2.5:7b', 'mistral:7b'];
  private readonly providers = ['InternalOllama', 'OpenAI'];
  private readonly sessions = new Map<string, AssistantSessionState>();
  private readonly calls = new Map<string, { sessionId: string; intent: AssistantIntent; result: AssistantFlowActionResult }>();

  override getConfig(): Observable<AssistantConfig> {
    return of({
      defaultProvider: this.providers[0],
      defaultModel: this.models[0],
      availableProvidersRetrieverUrl: '/fake/assistant/providers',
      availableModelsRetrieverUrl: '/fake/assistant/models?provider={provider}',
      defaultPhaseModels: {}
    });
  }

  override listProviders(_retrieverUrl: string): Observable<string[]> {
    return of(this.providers);
  }

  override listModels(_retrieverUrlTemplate: string, _provider: string): Observable<string[]> {
    return of(this.models);
  }

  override createSession(request: AssistantSessionRequest): Observable<AssistantSessionState> {
    const session: AssistantSessionState = {
      id: crypto.randomUUID(),
      selectedModel: request.llmSelection?.model ?? this.models[0],
      messages: [
        {
          id: crypto.randomUUID(),
          role: 'system',
          content: 'Select a model, then ask me to create, refine, fix, or explain a workflow.'
        }
      ],
      currentFlow: null,
      currentDraftFlow: null,
      lastValidationErrors: [],
      lastCallId: null
    };
    this.sessions.set(session.id, session);
    return of(structuredClone(session));
  }

  override getSession(sessionId: string): Observable<AssistantSessionState> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return throwError(() => new Error('Assistant session not found'));
    }
    return of(structuredClone(session));
  }

  override submitMessage(sessionId: string, request: AssistantSessionMessageRequest): Observable<AssistantCallAccepted> {
    const session = this.sessions.get(sessionId);
    const flow = request.flow ?? session?.currentFlow ?? undefined;
    const intent = this.inferIntent(request.message, flow);
    const result = this.buildActionResult(intent, { ...request, flow });
    const callId = crypto.randomUUID();
    this.calls.set(callId, { sessionId, intent, result });

    if (session) {
      session.messages = [
        ...session.messages,
        { id: crypto.randomUUID(), role: 'user', content: request.message },
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: result.message,
          warnings: result.warnings,
          validationErrors: result.validationErrors
        }
      ];
      session.lastCallId = callId;
      if (result.flow) {
        session.currentFlow = result.flow;
        session.currentDraftFlow = result.flow;
      }
      session.lastValidationErrors = result.validationErrors;
    }

    return of({ sessionId, callId });
  }

  override getCall(callId: string): Observable<AssistantCallState> {
    const call = this.calls.get(callId);
    if (!call) {
      return of({
        id: callId,
        sessionId: '',
        status: 'FAILED',
        phase: 'failed',
        errorMessage: 'Assistant call not found',
        intent: null,
        flowResult: null,
        actionResult: null
      });
    }
    return of({
      id: callId,
      sessionId: call.sessionId,
      status: 'COMPLETED',
      phase: call.intent === 'explain' ? 'explaining' : 'completed',
      progressMessage: 'Assistant request completed',
      intent: call.intent,
      flowResult: call.result.flow,
      actionResult: call.result
    });
  }

  override cancelCall(callId: string): Observable<AssistantCallState> {
    const call = this.calls.get(callId);
    const session = call ? this.sessions.get(call.sessionId) : undefined;
    if (session) {
      session.messages = [
        ...session.messages,
        { id: crypto.randomUUID(), role: 'assistant', content: 'Assistant request cancelled.' }
      ];
    }
    return of({
      id: callId,
      sessionId: call?.sessionId ?? '',
      status: 'CANCELLED',
      phase: 'cancelled',
      progressMessage: 'Assistant request cancelled',
      intent: call?.intent ?? null,
      flowResult: null,
      actionResult: null
    });
  }

  private inferIntent(message: string, flow: AssistantDraftPayload | undefined): AssistantIntent {
    const normalized = message.toLowerCase();
    if (!flow) return 'draft';
    if (/\b(fix|repair|invalid|error|broken)\b/.test(normalized)) return 'fix';
    if (/\b(explain|what does|why|describe)\b/.test(normalized)) return 'explain';
    return 'refine';
  }

  private buildActionResult(intent: AssistantIntent, request: AssistantSessionMessageRequest): AssistantFlowActionResult {
    switch (intent) {
      case 'draft': {
        const model = this.models[0];
        return {
          flow: {
            name: 'Ticket classification with urgent review',
            description: `Draft generated from prompt: ${request.message}`,
            flow: buildTicketFlow(model)
          },
          valid: true,
          validationErrors: [],
          warnings: ['Fake assistant response'],
          message: 'I created a new workflow draft.'
        };
      }
      case 'refine': {
        const flow = request.flow ? structuredClone(request.flow) : null;
        if (flow) addHumanReviewTail(flow.flow);
        return {
          flow,
          valid: true,
          validationErrors: [],
          warnings: ['Fake assistant response'],
          message: 'I updated the current workflow based on your request.'
        };
      }
      case 'fix':
        return {
          flow: request.flow ? structuredClone(request.flow) : null,
          valid: true,
          validationErrors: [],
          warnings: ['Fake assistant response'],
          message: 'I fixed the current workflow.'
        };
      case 'explain':
        return {
          flow: null,
          validationErrors: [],
          warnings: [],
          message: 'This workflow classifies incoming tickets and routes urgent cases to a human reviewer.'
        };
    }
  }

}

function buildTicketFlow(model: string): FlowData {
  return {
    blocks: [
      {
        id: 'assistant-input',
        name: 'Incoming Ticket',
        position: { x: 80, y: 220 },
        inputs: [],
        outputs: [{ name: 'ticket', type: 'TEXT', multiple: false }],
        specificConfiguration: {
          type: 'InputBlockConfiguration',
          name: 'Incoming Ticket'
        },
        typeName: 'InputBlock',
        nodeFamily: 'block'
      },
      {
        id: 'assistant-llm',
        name: 'Classify Urgency',
        position: { x: 360, y: 220 },
        inputs: [{ name: 'name', type: 'TEXT', multiple: false }],
        outputs: [{ name: 'response', type: 'TEXT', multiple: false }],
        specificConfiguration: {
          type: 'LLMBlockConfiguration',
          name: 'Classify Urgency',
          llmDescriptor: {
            provider: 'InternalOllama',
            model
          },
          prompt: 'Classify the ticket urgency as true for urgent, false otherwise. Ticket: ${{name}}'
        },
        typeName: 'LLMBlock',
        nodeFamily: 'block'
      },
      {
        id: 'assistant-condition',
        name: 'Urgent?',
        position: { x: 650, y: 220 },
        inputs: [{ name: 'input', type: 'TEXT', multiple: false }],
        outputs: [
          { name: 'true', type: 'TEXT', multiple: false },
          { name: 'false', type: 'TEXT', multiple: false }
        ],
        specificConfiguration: {
          type: 'ConditionalBlockConfiguration',
          name: 'Urgent?',
          condition: '${{input}} == true'
        },
        typeName: 'ConditionalBlock',
        nodeFamily: 'block'
      },
      {
        id: 'assistant-human',
        name: 'Human Review',
        position: { x: 950, y: 120 },
        inputs: [{ name: 'input', type: 'TEXT', multiple: false }],
        outputs: [{ name: 'output', type: 'TEXT', multiple: false }],
        specificConfiguration: {
          type: 'HumanInteractiveBlockConfiguration',
          name: 'Human Review',
          actionDescription: 'Review urgent ticket and decide priority',
          simulateWith: {
            provider: 'InternalOllama',
            model
          },
          inputAsList: false,
          outputAsList: false
        },
        typeName: 'HumanInteractionBlock',
        nodeFamily: 'block'
      },
      {
        id: 'assistant-output',
        name: 'Resolved Route',
        position: { x: 950, y: 330 },
        inputs: [{ name: 'input', type: 'TEXT', multiple: false }],
        outputs: [],
        specificConfiguration: {
          type: 'OutputBlockConfiguration',
          name: 'Resolved Route'
        },
        typeName: 'OutputBlock',
        nodeFamily: 'block'
      }
    ],
    containers: [],
    connections: [
      {
        id: 'assistant-conn-1',
        sourceId: 'assistant-input',
        sourceName: 'ticket',
        targetId: 'assistant-llm',
        targetName: 'name'
      },
      {
        id: 'assistant-conn-2',
        sourceId: 'assistant-llm',
        sourceName: 'response',
        targetId: 'assistant-condition',
        targetName: 'input'
      },
      {
        id: 'assistant-conn-3',
        sourceId: 'assistant-condition',
        sourceName: 'true',
        targetId: 'assistant-human',
        targetName: 'input'
      },
      {
        id: 'assistant-conn-4',
        sourceId: 'assistant-condition',
        sourceName: 'false',
        targetId: 'assistant-output',
        targetName: 'input'
      }
    ],
    dependencies: []
  };
}

function addHumanReviewTail(flow: AssistantDraftPayload['flow']) {
  const alreadyExists = flow.blocks.some((block) => block.id === 'assistant-extra-review');
  if (alreadyExists) return;

  flow.blocks.push({
    id: 'assistant-extra-review',
    name: 'Extra Review',
    position: { x: 1240, y: 120 },
    inputs: [{ name: 'input', type: 'TEXT', multiple: false }],
    outputs: [{ name: 'output', type: 'TEXT', multiple: false }],
    specificConfiguration: {
      type: 'HumanInteractiveBlockConfiguration',
      name: 'Extra Review',
      actionDescription: 'Confirm the high-risk decision before completion',
      simulateWith: {
        provider: 'InternalOllama',
        model: 'llama3.1:8b'
      },
      inputAsList: false,
      outputAsList: false
    },
    typeName: 'HumanInteractionBlock',
    nodeFamily: 'block'
  });

  flow.connections.push({
    id: 'assistant-conn-extra',
    sourceId: 'assistant-human',
    sourceName: 'output',
    targetId: 'assistant-extra-review',
    targetName: 'input'
  });
}
