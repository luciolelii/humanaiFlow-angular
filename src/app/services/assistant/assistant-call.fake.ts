import {
  AssistantCallPhase,
  AssistantCallState,
  AssistantChatMessage,
  AssistantConfig,
  AssistantDraftPayload,
  AssistantSendMessageRequest,
  AssistantSessionState,
  AssistantValidationIssue
} from '@models/assistant';
import { FlowData } from '@models/flow';
import { Observable, of } from 'rxjs';
import { AssistantCallServiceBase } from './assistant-call.base';

type FakeCallRecord = {
  id: string;
  sessionId: string;
  content: string;
  phaseIndex: number;
  phases: AssistantCallPhase[];
  completed: boolean;
  failed: boolean;
  cancelled: boolean;
};

export class AssistantCallServiceFake extends AssistantCallServiceBase {
  private readonly models = ['llama3.1:8b', 'qwen2.5:7b', 'mistral:7b'];
  private readonly sessions = new Map<string, AssistantSessionState>();
  private readonly calls = new Map<string, FakeCallRecord>();

  override getConfig(): Observable<AssistantConfig> {
    return of({
      defaultModel: this.models[0],
      availableModelsRetrieverUrl: '/fake/assistant/models'
    });
  }

  override listModels(_retrieverUrl: string): Observable<string[]> {
    return of(this.models);
  }

  override createSession(request: {
    model: string;
  }): Observable<AssistantSessionState> {
    const session: AssistantSessionState = {
      id: crypto.randomUUID(),
      selectedModel: request.model,
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

  override sendMessage(sessionId: string, request: AssistantSendMessageRequest): Observable<{ callId: string }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Assistant session ${sessionId} not found`);
    }
    session.messages = [
      ...session.messages,
      {
        id: crypto.randomUUID(),
        role: 'user',
        content: request.message
      }
    ];

    const callId = crypto.randomUUID();
    const phases = this.buildPhases(request.message);
    this.calls.set(callId, {
      id: callId,
      sessionId,
      content: request.message,
      phaseIndex: 0,
      phases,
      completed: false,
      failed: false,
      cancelled: false
    });
    session.lastCallId = callId;

    return of({ callId });
  }

  override getCall(callId: string): Observable<AssistantCallState> {
    const call = this.calls.get(callId);
    if (!call) {
      throw new Error(`Assistant call ${callId} not found`);
    }

    if (!call.completed && !call.failed && !call.cancelled) {
      if (call.phaseIndex < call.phases.length - 1) {
        call.phaseIndex += 1;
      } else {
        call.completed = true;
        this.applyCallResult(call);
      }
    }

    const phase = call.completed
      ? 'completed'
      : call.failed
        ? 'failed'
        : call.cancelled
          ? 'cancelled'
          : call.phases[call.phaseIndex];

    return of({
      id: call.id,
      sessionId: call.sessionId,
      status: call.failed
        ? 'FAILED'
        : call.cancelled
          ? 'CANCELLED'
        : call.completed
          ? 'COMPLETED'
          : call.phaseIndex === 0
            ? 'QUEUED'
            : 'RUNNING',
      phase,
      progressMessage: call.cancelled ? 'Assistant request cancelled' : undefined,
      errorMessage: call.failed ? 'Fake assistant call failed.' : undefined
    });
  }

  override cancelCall(callId: string): Observable<AssistantCallState> {
    const call = this.calls.get(callId);
    if (!call) {
      throw new Error(`Assistant call ${callId} not found`);
    }

    call.cancelled = true;
    return of({
      id: call.id,
      sessionId: call.sessionId,
      status: 'CANCELLED',
      phase: 'cancelled',
      progressMessage: 'Assistant request cancelled'
    });
  }

  override getSession(sessionId: string): Observable<AssistantSessionState> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Assistant session ${sessionId} not found`);
    }
    return of(structuredClone(session));
  }

  private buildPhases(content: string): AssistantCallPhase[] {
    const normalized = content.toLowerCase();
    if (/explain|what does|why/.test(normalized)) {
      return ['routing', 'explaining'];
    }
    if (/fix|repair|invalid|error|bug/.test(normalized)) {
      return ['routing', 'planning', 'configuring_blocks', 'connecting_blocks', 'validating', 'fixing'];
    }
    return ['routing', 'planning', 'configuring_blocks', 'connecting_blocks', 'validating'];
  }

  private applyCallResult(call: FakeCallRecord) {
    const session = this.sessions.get(call.sessionId);
    if (!session) return;

    const content = call.content.toLowerCase();

    if (/explain|what does|why/.test(content)) {
      session.messages = [
        ...session.messages,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: session.currentDraftFlow
            ? `This flow "${session.currentDraftFlow.name}" receives input, classifies urgency, routes urgent cases to a human, and completes the non-urgent path automatically.`
            : 'There is no draft flow in the session yet.'
        }
      ];
      return;
    }

    let draft = session.currentDraftFlow;
    let validationErrors: AssistantValidationIssue[] = [];
    let assistantMessage = 'I updated the workflow based on your request.';

    if (!draft || /create|new flow|from scratch/.test(content)) {
      draft = {
        name: 'Ticket classification with urgent review',
        description: `Draft generated from prompt: ${call.content}`,
        flow: buildTicketFlow(session.selectedModel)
      };
      assistantMessage = 'I created a new workflow draft.';
    } else if (/review|approval|human/.test(content)) {
      draft = structuredClone(draft);
      addHumanReviewTail(draft.flow);
      assistantMessage = 'I updated the current workflow based on your request.';
    } else if (/fix|repair|invalid|error|bug/.test(content)) {
      draft = structuredClone(draft);
      validationErrors = [];
      assistantMessage = 'I fixed the current workflow.';
    }

    if (/invalid|broken/.test(content)) {
      validationErrors = [{ message: 'The draft contains unresolved validation issues.' }];
      assistantMessage = 'I created an initial draft, but it still needs corrections.';
    }

    session.currentFlow = draft;
    session.currentDraftFlow = draft;
    session.lastValidationErrors = validationErrors;
    session.messages = [
      ...session.messages,
      {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `${assistantMessage} ${validationErrors.length ? 'The draft still has validation errors.' : 'The draft is valid.'}`.trim(),
        warnings: ['Fake assistant response'],
        validationErrors
      }
    ];
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
