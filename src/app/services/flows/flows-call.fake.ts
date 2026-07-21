import { Flow, FlowValidationError } from "@models/flow";
import { FlowsCallServiceBase } from "./flows-call.base";
import { defer, Observable, of } from "rxjs";
import { Authorization } from "@services/authorization/authorization";
import { inject } from "@angular/core";
import { flowFromApi } from "./flow-mapper";

export class FlowsCallServiceFake extends FlowsCallServiceBase {
  private ownerUsername(): string {
    return this.authorizationService.loggedInUser()?.username ?? '';
  }

  private requireFlow(flowId: string): Flow {
    const flow = this.data[flowId];
    if (!flow) {
      throw new Error(`Flow with id ${flowId} not found`);
    }
    return flow;
  }

  private requireOwner(flow: Flow) {
    if (flow.author !== this.ownerUsername()) {
      throw new Error('Only the owner can change flow flags.');
    }
  }

  override getFlowById(flowId: string): Observable<Flow> {
    return defer(() => of(this.requireFlow(flowId)));
  }

  authorizationService = inject(Authorization);

  private data: Record<string, Flow> = {
    '1': { id: '1', name: 'A Flow', data: { blocks: [], containers: [], connections: [], dependencies: [] }, visibility: 'PUBLIC', author: 'Alice', createdAt: new Date("December 17, 2023 03:24:00"), status: 'EXECUTABLE', updatedAt: new Date("January 7, 2026 12:24:00") },
    '2': { id: '2', name: 'Test Flow', data: { blocks: [], containers: [], connections: [], dependencies: [] }, visibility: 'PRIVATE', author: 'Bob', createdAt: new Date("April 25, 2025 12:24:00"), status: 'DRAFT', updatedAt: new Date("April 27, 2025 18:42:00") },
    'testFlow': flowFromApi(testDataFlow)
  }

  override retrieveAllFlows() {
    return of(Object.values(this.data));
  }

  override updateFlow(flow: Flow) {
    return defer(() => {
      if (flow.finalized) {
        throw new Error('Flow is finalized');
      }
      this.data[flow.id] = flow;
      return of(flow);
    });
  }

  override createFlow(flow: Pick<Flow, 'name' | 'description' | 'data' | 'status'>): Observable<Flow> {
    const newId = (Object.keys(this.data).length + 1).toString();
    const created: Flow = {
      id: newId,
      name: flow.name,
      description: flow.description,
      data: flow.data,
      visibility: 'PRIVATE',
      author: this.authorizationService.loggedInUser()?.username ?? 'assistant',
      createdAt: new Date(),
      status: flow.status,
      updatedAt: new Date()
    };
    this.data[newId] = created;
    return of(created);
  }

  override createNewFlow(name?: string): Observable<Flow> {
    return this.createFlow({
      name: name || 'New Flow',
      description: undefined,
      data: { blocks: [], containers: [], connections: [], dependencies: [] },
      status: 'DRAFT'
    });
  }

  override deleteFlow(flowId: string): Observable<void> {
    return defer(() => {
      const flow = this.requireFlow(flowId);
      if (flow.finalized) {
        throw new Error('Flow is finalized');
      }
      delete this.data[flowId];
      return of(void 0);
    });
  }

  override updatePublished(flowId: string, value: boolean): Observable<Flow> {
    return defer(() => {
      const flow = this.requireFlow(flowId);
      this.requireOwner(flow);
      const updated = {
        ...flow,
        published: value,
        visibility: value ? 'PUBLIC' : 'PRIVATE',
        updatedAt: new Date()
      } satisfies Flow;
      this.data[flowId] = updated;
      return of(updated);
    });
  }

  override finalizeFlow(flowId: string): Observable<Flow> {
    return defer(() => {
      const flow = this.requireFlow(flowId);
      this.requireOwner(flow);
      if (flow.finalized) {
        return of(flow);
      }
      const updated = {
        ...flow,
        finalized: true,
        updatedAt: new Date()
      } satisfies Flow;
      this.data[flowId] = updated;
      return of(updated);
    });
  }

  override getFlowValidation(flowId: string): Observable<FlowValidationError[]> {
    return defer(() => of(this.requireFlow(flowId).validationErrors ?? []));
  }
}
const testDataFlow ={
  "id": "testFlow",
  "name" : "Test Flow",
  "owner": "lucio",
  "status": "DRAFT",
  "published": false,
  "finalized": false,
  "description" : "This is a test flow",
  "createdAt": "2023-12-17T03:24:00.000Z",
  "lastUpdateAt": "2026-01-07T12:24:00.000Z",
  "flow" : {
  "blocks" : [ {
    "id" : "cabd6f4e-5a05-41f8-9bf7-4de20391ac4e",
    "sink" : false,
    "name" : "first",
    "inputs" : [ {
      "name" : "name",
      "type" : "TEXT",
      "multiple" : false
    } ],
    "outputs" : [ {
      "name" : "response",
      "type" : "TEXT",
      "multiple" : false
    } ],
    "specificConfiguration" : {
      "type" : "LLMBlockConfiguration",
      "name" : "first",
      "llmDescriptor" : {
        "provider" : "testProvider",
        "model" : "testModel"
      },
      "prompt" : "Make a question about ${{name}}"
    },
    "typeName" : "LLMBlock"
  }, {
    "id" : "0063a3ec-3863-4045-bd3b-61eaf87b4604",
    "sink" : true,
    "name" : "interactive",
    "inputs" : [ {
      "name" : "input",
      "type" : "TEXT",
      "multiple" : false
    } ],
    "outputs" : [ {
      "name" : "output",
      "type" : "TEXT",
      "multiple" : false
    } ],
    "specificConfiguration" : {
      "type" : "HumanInteractiveBlockConfiguration",
      "name" : "interactive",
      "actionDescription" : "Answer the question in input",
      "simulateWith" : {
        "provider" : "testProvider",
        "model" : "testModel"
      },
      "inputAsList" : false,
      "outputAsList" : false
    },
    "typeName" : "HumanInteractionBlock"
  } ],
  "connections" : [ {
    "id" : "8da696c2-dc03-4717-b2ce-18637ae6f7f8",
    "sourceId" : "cabd6f4e-5a05-41f8-9bf7-4de20391ac4e",
    "sourceName" : "response",
    "targetId" : "0063a3ec-3863-4045-bd3b-61eaf87b4604",
    "targetName" : "input"
  } ]
}
}; 
