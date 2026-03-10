import {
  AssistantDraftPayload,
  AssistantExplainResponse,
  AssistantFlowResponse,
  AssistantValidationIssue
} from '@models/assistant';
import { Observable, of } from 'rxjs';
import { AssistantCallServiceBase } from './assistant-call.base';

export class AssistantCallServiceFake extends AssistantCallServiceBase {
  override listModels(): Observable<string[]> {
    return of([
      'llama3.1:8b',
      'qwen2.5:7b',
      'mistral:7b'
    ]);
  }

  override createDraft(request: {
    userPrompt: string;
    model: string;
    maxRepairAttempts?: number;
  }): Observable<AssistantFlowResponse> {
    const invalid = /invalid|broken|errore|error/i.test(request.userPrompt);
    const flow = buildTicketFlow(request.model);
    return of({
      flow: {
        name: /classif/i.test(request.userPrompt) ? 'Ticket classification with urgent review' : 'Assistant generated flow',
        description: `Draft generated from prompt: ${request.userPrompt}`,
        flow
      },
      valid: !invalid,
      validationErrors: invalid ? [{ message: 'The draft contains unresolved validation issues.' }] : [],
      warnings: ['Fake assistant response'],
      assistantRationale: 'Uses an input block, an LLM classifier, a conditional router, and a human review branch.',
      repairAttempts: invalid ? 1 : 0
    });
  }

  override refineDraft(request: {
    userPrompt: string;
    model: string;
    maxRepairAttempts?: number;
    flow: AssistantDraftPayload;
  }): Observable<AssistantFlowResponse> {
    const next = structuredClone(request.flow);
    next.name = request.flow.name || 'Refined flow';
    next.description = `${request.flow.description ?? 'Refined draft'}\n\nRefinement: ${request.userPrompt}`.trim();

    if (/review|approval|human/i.test(request.userPrompt)) {
      addHumanReviewTail(next.flow);
    }

    return of({
      flow: next,
      valid: true,
      validationErrors: [],
      warnings: ['Fake assistant response'],
      assistantRationale: 'Applied the requested refinement incrementally without replacing the whole graph.',
      repairAttempts: 0
    });
  }

  override fixDraft(request: {
    userPrompt: string;
    model: string;
    maxRepairAttempts?: number;
    flow: AssistantDraftPayload;
    validationErrors?: AssistantValidationIssue[];
  }): Observable<AssistantFlowResponse> {
    const next = structuredClone(request.flow);
    return of({
      flow: next,
      valid: true,
      validationErrors: [],
      warnings: ['Fake assistant response'],
      assistantRationale: 'Recomputed the draft and cleared the reported validation problems.',
      repairAttempts: 1
    });
  }

  override explainDraft(request: {
    userPrompt: string;
    model: string;
    flow: AssistantDraftPayload;
  }): Observable<AssistantExplainResponse> {
    return of({
      explanation: `This flow "${request.flow.name}" receives a ticket, classifies urgency with an LLM, routes urgent cases to a human reviewer, and auto-forwards non-urgent cases.`,
      warnings: ['Fake assistant response']
    });
  }
}

function buildTicketFlow(model: string) {
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
        typeName: 'InputBlock'
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
        typeName: 'LLMBlock'
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
        typeName: 'ConditionalBlock'
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
        typeName: 'HumanInteractionBlock'
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
        typeName: 'OutputBlock'
      }
    ],
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
    ]
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
    typeName: 'HumanInteractionBlock'
  });

  flow.connections.push({
    id: 'assistant-conn-extra',
    sourceId: 'assistant-human',
    sourceName: 'output',
    targetId: 'assistant-extra-review',
    targetName: 'input'
  });
}
