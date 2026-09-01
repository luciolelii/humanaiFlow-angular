import {
  AssistantConfig,
  AssistantDraftPayload,
  AssistantFlowActionResult,
  AssistantFlowRequest,
  AssistantSessionRequest,
  AssistantSessionState
} from '@models/assistant';
import { FlowData } from '@models/flow';
import { Observable, of } from 'rxjs';
import { AssistantCallServiceBase } from './assistant-call.base';

export class AssistantCallServiceFake extends AssistantCallServiceBase {
  private readonly models = ['llama3.1:8b', 'qwen2.5:7b', 'mistral:7b'];
  private readonly providers = ['InternalOllama', 'OpenAI'];

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
    return of(structuredClone(session));
  }

  override draft(request: AssistantFlowRequest): Observable<AssistantFlowActionResult> {
    const model = request.llmSelection?.model ?? this.models[0];
    return of({
      flow: {
        name: 'Ticket classification with urgent review',
        description: `Draft generated from prompt: ${request.userPrompt}`,
        flow: buildTicketFlow(model)
      },
      valid: true,
      validationErrors: [],
      warnings: ['Fake assistant response'],
      message: 'I created a new workflow draft.'
    });
  }

  override refine(request: AssistantFlowRequest): Observable<AssistantFlowActionResult> {
    const flow = request.flow ? structuredClone(request.flow) : null;
    if (flow) addHumanReviewTail(flow.flow);
    return of({
      flow,
      valid: true,
      validationErrors: [],
      warnings: ['Fake assistant response'],
      message: 'I updated the current workflow based on your request.'
    });
  }

  override fix(request: AssistantFlowRequest): Observable<AssistantFlowActionResult> {
    return of({
      flow: request.flow ? structuredClone(request.flow) : null,
      valid: true,
      validationErrors: [],
      warnings: ['Fake assistant response'],
      message: 'I fixed the current workflow.'
    });
  }

  override explain(_request: AssistantFlowRequest): Observable<AssistantFlowActionResult> {
    return of({
      flow: null,
      validationErrors: [],
      warnings: [],
      message: 'This workflow classifies incoming tickets and routes urgent cases to a human reviewer.'
    });
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
