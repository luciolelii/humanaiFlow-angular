import { Flow, FlowData, FlowVisibility } from "@models/flow";
import { FlowsCallServiceBase } from "./flows-call.base";
import { BehaviorSubject, Observable, of } from "rxjs";
import { Authorization } from "@services/authorization/authorization";
import { inject } from "@angular/core";
import { IOType } from "@models/node-types";

export class FlowsCallServiceFake extends FlowsCallServiceBase {
  override getFlowById(flowId: string): Observable<Flow> {
    const flow = this.data[flowId];
    if (!flow) {
      throw new Error(`Flow with id ${flowId} not found`);
    }
    return of(flow);
  }

  authorizationService = inject(Authorization);

  private data: Record<string, Flow> = {
    '1': { id: '1', name: 'A Flow', data: { nodes: [], connections: [] }, visibility: 'PUBLIC', author: 'Alice', createdAt: new Date("December 17, 2023 03:24:00"), updatedAt: new Date("January 7, 2026 12:24:00") },
    '2': { id: '2', name: 'Test Flow', data: { nodes: [], connections: [] }, visibility: 'PRIVATE', author: 'Bob', createdAt: new Date("April 25, 2025 12:24:00"), updatedAt: new Date("April 27, 2025 18:42:00") },
    'testFlow': flowFromJson(testDataFlow)
  }

  override retrieveAllFlows() {
    return of(Object.values(this.data));
  }

  override updateFlow(flow: Flow) {
    this.data[flow.id] = flow;
    return of(void 0);
  }

  override createNewFlow(name?: string): Observable<Flow> {
    const newId = (Object.keys(this.data).length + 1).toString();
    this.data[newId] = { id: newId, name: name || `New Flow`, data: { nodes: [], connections: [] }, visibility: 'PRIVATE', author: this.authorizationService.loggedInUser()!.username, createdAt: new Date(), updatedAt: new Date() };
    return of(this.data[newId]);
  }

  override deleteFlow(flowId: string): Observable<void> {
    delete this.data[flowId];
    return of(void 0);
  }
}



export function flowFromJson(raw: any): Flow {
  return {
    id: raw.id,
    author: raw.author,
    visibility: raw.visibility as FlowVisibility,
    createdAt: new Date(raw.createdAt),
    updatedAt: new Date(raw.updatedAt),
    name: raw.name,
    description: raw.description,
    data: {
      nodes: raw.nodes,
      connections: raw.connections
    }
  };
}


const testDataFlow ={
    "id": "my test flow",
    "author": "lucio.lelii",
    "visibility": "PUBLIC",
    "createdAt": "2026-01-21T10:38:50.671+00:00",
    "updatedAt": "2026-01-21T10:38:50.671+00:00",
    "name": "my test flow",
    "description": "This is a test flow",
    "nodes": [
        {
            "key": "3ec4a0e5-914a-41e0-ab74-d4e64a4dba09",
            "name": "Input Node",
            "position": null,
            "parameters": null,
            "nodeDefinition": {
                "category": "Input",
                "runtimeParameters": null,
                "fixedParameters": null,
                "inputs": {},
                "outputs": {
                    "phrase": {
                        "type": "TEXT",
                        "multiple": false
                    }
                },
                "simulable": false,
                "name": "Phrase"
            }
        },
        {
            "key": "80519c40-20ba-49cf-800a-598ee2e64f65",
            "name": "translator to french",
            "position": null,
            "parameters": {
                "LLMProvider": "OllamaTestProvider",
                "LLMModel": "sam860/gemma3:270m"
            },
            "nodeDefinition": {
                "category": "Execution",
                "executor": "genericAIExecutorTest",
                "inputMappers": {
                    "prompt": {
                        "type": "translator",
                        "translation": "translate the following phrase : \"${{phrase}}\" in french, return only the translation"
                    }
                },
                "outputMappers": {
                    "translated": {
                        "type": "direct",
                        "fieldName": "response"
                    }
                },
                "name": "French Translator",
                "runtimeParameters": null,
                "fixedParameters": null,
                "inputs": {
                    "phrase": {
                        "type": "TEXT",
                        "multiple": false
                    }
                },
                "outputs": {
                    "translated": {
                        "type": "TEXT",
                        "multiple": false
                    }
                }
            }
        },
        {
            "key": "ff349078-dce1-4ecd-8b2f-bd43100633fc",
            "name": "Output Node",
            "position": null,
            "parameters": null,
            "nodeDefinition": {
                "category": "Output",
                "runtimeParameters": null,
                "fixedParameters": null,
                "outputs": {},
                "inputs": {
                    "translated": {
                        "type": "TEXT",
                        "multiple": false
                    }
                },
                "name": "Translated Phrase"
            }
        }
    ],
    "connections": [
        {
            "key": "c335e3da-2af3-4e8f-a8ee-9bfc236196ee",
            "sourceNode": "3ec4a0e5-914a-41e0-ab74-d4e64a4dba09",
            "sourceField": "phrase",
            "targetNode": "80519c40-20ba-49cf-800a-598ee2e64f65",
            "targetField": "phrase"
        },
        {
            "key": "e0239aef-d570-463d-b453-c3906ab0e4b0",
            "sourceNode": "80519c40-20ba-49cf-800a-598ee2e64f65",
            "sourceField": "translated",
            "targetNode": "ff349078-dce1-4ecd-8b2f-bd43100633fc",
            "targetField": "translated"
        }
    ]
}; 