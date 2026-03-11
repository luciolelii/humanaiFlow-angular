import { TaskExecution } from '@models/task-execution';
import { Observable, of } from 'rxjs';
import { TaskExecutionsCallServiceBase } from './task-executions-call.base';

export class TaskExecutionsCallServiceFake extends TaskExecutionsCallServiceBase {
  private readonly data: TaskExecution[] = [
    {
      id: 'c106be9d-5467-428c-8992-0b5f40a59aac',
      name: 'Test Flow',
      creationTime: 1772619308394,
      requiredAuthorizations: {
        'LLMProvider::testProvider::authorization': {
          key: 'LLMProvider::testProvider::authorization',
          provider: 'testProvider',
          fieldName: 'authorization',
          description: 'API key required for testProvider',
          requiredBySteps: ['first', 'second']
        }
      },
      providedAuthorizations: {},
      missingAuthorizationKeys: ['LLMProvider::testProvider::authorization'],
      context: {
        inputs: {
          'feeb2977-370f-4bf9-aa84-04fa2f11e365:name': 'Leonardo da Vinci'
        },
        result: {},
        startTime: 1772619308397,
        endTime: 1772619308398,
        errors: {
          '5ceb9b7b-88a0-41bb-afef-76fcb1f57918': 'Provider not found: testProvider'
        },
        warnings: {
          'b2540579-ca7b-4beb-8ed3-65136e7f03d6': 'Response was slower than expected'
        },
        steps: {
          'b2540579-ca7b-4beb-8ed3-65136e7f03d6': {
            block: {
              id: 'b2540579-ca7b-4beb-8ed3-65136e7f03d6',
              position: { x: 120, y: 160 },
              name: 'first',
              inputs: [{ name: 'name', type: 'TEXT', multiple: false }],
              outputs: [{ name: 'response', type: 'TEXT', multiple: false }],
              specificConfiguration: {
                type: 'LLMBlockConfiguration',
                name: 'first',
                llmDescriptor: { provider: 'testProvider', model: 'testModel' },
                prompt: 'When ${{name}} died ? give me only the year as number'
              },
              typeName: 'LLMBlock'
            },
            id: 'b2540579-ca7b-4beb-8ed3-65136e7f03d6',
            inputs: [
              {
                descriptor: { name: 'name', type: 'TEXT', multiple: false },
                value: 'Leonardo da Vinci',
                registered: false,
                set: true
              }
            ],
            outputs: [
              {
                descriptor: { name: 'response', type: 'TEXT', multiple: false },
                connected: true
              }
            ],
            status: 'FAILED',
            started: true,
            simulated: false
          },
          '5ceb9b7b-88a0-41bb-afef-76fcb1f57918': {
            block: {
              id: '5ceb9b7b-88a0-41bb-afef-76fcb1f57918',
              position: { x: 500, y: 160 },
              name: 'second',
              inputs: [{ name: 'year', type: 'TEXT', multiple: false }],
              outputs: [{ name: 'response', type: 'TEXT', multiple: false }],
              specificConfiguration: {
                type: 'LLMBlockConfiguration',
                name: 'second',
                llmDescriptor: { provider: 'testProvider', model: 'testModel' },
                prompt: 'what was the most important event in year ${{year}}?'
              },
              typeName: 'LLMBlock'
            },
            id: '5ceb9b7b-88a0-41bb-afef-76fcb1f57918',
            inputs: [
              {
                descriptor: { name: 'year', type: 'TEXT', multiple: false },
                value: null,
                registered: true,
                set: false
              }
            ],
            outputs: [
              {
                descriptor: { name: 'response', type: 'TEXT', multiple: false },
                connected: false
              }
            ],
            status: 'WAITING_FOR_INPUT',
            started: true,
            simulated: false
          }
        },
        status: 'ERROR',
        waitingSteps: [],
        executionResult: {}
      }
    },
    {
      id: 'eda4040e-ae58-4ffb-a3b4-16dfef45a6c2',
      name: 'Test Flow',
      creationTime: 1772623910033,
      requiredAuthorizations: {},
      providedAuthorizations: {},
      missingAuthorizationKeys: [],
      context: {
        inputs: {
          '95ebb03f-80e0-412d-87ee-2d4b7ddef240:name': 'marie curie'
        },
        result: {
          '68c5949c-1c74-400e-a1aa-b5f7739e5bb2:output':
            'Based on the provided context, Marie Curie is a remarkable scientist and explorer who made significant contributions to the field of science and exploration. She is often considered a pioneer in the field of radioactivity.\n'
        },
        startTime: 1772623910037,
        endTime: 1772623947755,
        errors: {},
        warnings: {},
        steps: {
          '95ebb03f-80e0-412d-87ee-2d4b7ddef240': {
            block: {
              id: '95ebb03f-80e0-412d-87ee-2d4b7ddef240',
              position: { x: 120, y: 140 },
              name: 'first',
              inputs: [{ name: 'name', type: 'TEXT', multiple: false }],
              outputs: [{ name: 'response', type: 'TEXT', multiple: false }],
              specificConfiguration: {
                type: 'LLMBlockConfiguration',
                name: 'first',
                llmDescriptor: {
                  provider: 'ollamaTestProvider',
                  model: 'sam860/gemma3:270m'
                },
                prompt: 'Make a question about ${{name}}'
              },
              typeName: 'LLMBlock'
            },
            id: '95ebb03f-80e0-412d-87ee-2d4b7ddef240',
            inputs: [
              {
                descriptor: {
                  name: 'name',
                  type: 'TEXT',
                  multiple: false
                },
                value: 'marie curie',
                registered: false,
                set: true
              }
            ],
            outputs: [
              {
                descriptor: {
                  name: 'response',
                  type: 'TEXT',
                  multiple: false
                },
                connected: true
              }
            ],
            status: 'COMPLETED',
            started: true,
            simulated: false
          },
          '68c5949c-1c74-400e-a1aa-b5f7739e5bb2': {
            block: {
              id: '68c5949c-1c74-400e-a1aa-b5f7739e5bb2',
              position: { x: 500, y: 140 },
              name: 'interactive',
              inputs: [{ name: 'input', type: 'TEXT', multiple: false }],
              outputs: [{ name: 'output', type: 'TEXT', multiple: false }],
              specificConfiguration: {
                type: 'HumanInteractiveBlockConfiguration',
                name: 'interactive',
                actionDescription: 'Answer the question in input',
                llmDescriptor: {
                  provider: 'ollamaTestProvider',
                  model: 'sam860/gemma3:270m'
                }
              },
              typeName: 'HumanInteractionBlock'
            },
            id: '68c5949c-1c74-400e-a1aa-b5f7739e5bb2',
            inputs: [
              {
                descriptor: {
                  name: 'input',
                  type: 'TEXT',
                  multiple: false
                },
                value:
                  'Marie Curie is a remarkable scientist and explorer who made significant contributions to science and exploration. She is often considered a pioneer in the field of radioactivity. What is your opinion about her contributions to the field of science and exploration?',
                registered: true,
                set: true
              }
            ],
            outputs: [
              {
                descriptor: {
                  name: 'output',
                  type: 'TEXT',
                  multiple: false
                },
                connected: false
              }
            ],
            status: 'COMPLETED',
            started: true,
            simulated: true
          }
        },
        status: 'SUCCESS',
        waitingSteps: [],
        executionResult: {
          '68c5949c-1c74-400e-a1aa-b5f7739e5bb2:output':
            'Based on the provided context, Marie Curie is a remarkable scientist and explorer who made significant contributions to the field of science and exploration. She is often considered a pioneer in the field of radioactivity.\n'
        }
      }
    },
    {
      id: '74ec477f-b04e-494c-80cc-968a40527bef',
      name: 'Test Flow',
      creationTime: 1772705504567,
      requiredAuthorizations: {},
      providedAuthorizations: {},
      missingAuthorizationKeys: [],
      context: {
        inputs: {
          'f91ec0f7-03e8-4208-89ac-bd9db46dca8c:name': 'marie curie'
        },
        result: {},
        startTime: null,
        endTime: null,
        errors: {},
        warnings: {},
        steps: {
          'ab7e0b08-c653-4d11-b808-e0e51c89d989': {
            block: {
              id: 'ab7e0b08-c653-4d11-b808-e0e51c89d989',
              position: { x: 500, y: 140 },
              name: 'interactive',
              inputs: [{ name: 'input', type: 'TEXT', multiple: false }],
              outputs: [{ name: 'output', type: 'TEXT', multiple: false }],
              specificConfiguration: {
                type: 'HumanInteractiveBlockConfiguration',
                name: 'interactive',
                actionDescription: 'Answer the question in input',
                simulateWith: {
                  provider: 'ollamaTestProvider',
                  model: 'sam860/gemma3:270m'
                }
              },
              typeName: 'HumanInteractionBlock'
            },
            id: 'ab7e0b08-c653-4d11-b808-e0e51c89d989',
            inputs: [
              {
                descriptor: {
                  name: 'input',
                  type: 'TEXT',
                  multiple: false
                },
                value: null,
                registered: true,
                set: false
              }
            ],
            outputs: [
              {
                descriptor: {
                  name: 'output',
                  type: 'TEXT',
                  multiple: false
                },
                connected: false
              }
            ],
            status: 'WAITING_FOR_INPUT',
            started: false,
            simulated: false
          },
          'f91ec0f7-03e8-4208-89ac-bd9db46dca8c': {
            block: {
              id: 'f91ec0f7-03e8-4208-89ac-bd9db46dca8c',
              position: { x: 120, y: 140 },
              name: 'first',
              inputs: [{ name: 'name', type: 'TEXT', multiple: false }],
              outputs: [{ name: 'response', type: 'TEXT', multiple: false }],
              specificConfiguration: {
                type: 'LLMBlockConfiguration',
                name: 'first',
                llmDescriptor: {
                  provider: 'ollamaTestProvider',
                  model: 'sam860/gemma3:270m'
                },
                prompt: 'Make a question about ${{name}}'
              },
              typeName: 'LLMBlock'
            },
            id: 'f91ec0f7-03e8-4208-89ac-bd9db46dca8c',
            inputs: [
              {
                descriptor: {
                  name: 'name',
                  type: 'TEXT',
                  multiple: false
                },
                value: 'marie curie',
                registered: false,
                set: true
              }
            ],
            outputs: [
              {
                descriptor: {
                  name: 'response',
                  type: 'TEXT',
                  multiple: false
                },
                connected: true
              }
            ],
            status: 'READY',
            started: false,
            simulated: false
          }
        },
        status: 'READY',
        waitingSteps: [],
        executionResult: {}
      }
    },
    {
      id: '228b8689-e53c-4fcc-8426-fcf9f8aad634',
      name: 'Test Flow Waiting',
      creationTime: 1772705840477,
      context: {
        inputs: {
          'f80bce81-f1e4-4e03-9982-d35a042b1276:name': 'marie curie'
        },
        result: {},
        startTime: 1772705842371,
        endTime: null,
        errors: {},
        warnings: {},
        steps: {
          '82844256-d9c1-4f81-a415-49b18c371a13': {
            block: {
              id: '82844256-d9c1-4f81-a415-49b18c371a13',
              position: { x: 500, y: 140 },
              name: 'interactive',
              inputs: [{ name: 'input', type: 'TEXT', multiple: false }],
              outputs: [{ name: 'output', type: 'TEXT', multiple: false }],
              specificConfiguration: {
                type: 'HumanInteractiveBlockConfiguration',
                name: 'interactive',
                actionDescription: 'Answer the question in input',
                simulateWith: {
                  provider: 'ollamaTestProvider',
                  model: 'sam860/gemma3:270m'
                }
              },
              typeName: 'HumanInteractionBlock'
            },
            id: '82844256-d9c1-4f81-a415-49b18c371a13',
            inputs: [
              {
                descriptor: {
                  name: 'input',
                  type: 'TEXT',
                  multiple: false
                },
                value:
                  'Marie Curie is a pioneering scientist who revolutionized our understanding of radioactivity and the development of nuclear medicine. Her work has inspired generations of scientists and continues to be studied and understood.\n',
                registered: true,
                set: true
              }
            ],
            outputs: [
              {
                descriptor: {
                  name: 'output',
                  type: 'TEXT',
                  multiple: false
                },
                connected: false
              }
            ],
            status: 'WAITING_FOR_INTERACTION',
            started: true,
            simulated: false
          },
          'f80bce81-f1e4-4e03-9982-d35a042b1276': {
            block: {
              id: 'f80bce81-f1e4-4e03-9982-d35a042b1276',
              position: { x: 120, y: 140 },
              name: 'first',
              inputs: [{ name: 'name', type: 'TEXT', multiple: false }],
              outputs: [{ name: 'response', type: 'TEXT', multiple: false }],
              specificConfiguration: {
                type: 'LLMBlockConfiguration',
                name: 'first',
                llmDescriptor: {
                  provider: 'ollamaTestProvider',
                  model: 'sam860/gemma3:270m'
                },
                prompt: 'Make a question about ${{name}}'
              },
              typeName: 'LLMBlock'
            },
            id: 'f80bce81-f1e4-4e03-9982-d35a042b1276',
            inputs: [
              {
                descriptor: {
                  name: 'name',
                  type: 'TEXT',
                  multiple: false
                },
                value: 'marie curie',
                registered: false,
                set: true
              }
            ],
            outputs: [
              {
                descriptor: {
                  name: 'response',
                  type: 'TEXT',
                  multiple: false
                },
                connected: true
              }
            ],
            status: 'COMPLETED',
            started: true,
            simulated: false
          }
        },
        status: 'WAITING',
        waitingSteps: ['82844256-d9c1-4f81-a415-49b18c371a13'],
        executionResult: {}
      }
    }
  ];

  override retrieveAllTaskExecutions(): Observable<TaskExecution[]> {
    return of(this.data);
  }

  override createTaskExecution(flowId: string): Observable<TaskExecution> {
    const execution: TaskExecution = {
      id: crypto.randomUUID(),
      name: flowId || 'Execution',
      creationTime: Date.now(),
      context: {
        inputs: {},
        result: {},
        startTime: null,
        endTime: null,
        errors: {},
        warnings: {},
        steps: {},
        status: 'CREATED',
        waitingSteps: [],
        executionResult: {}
      }
    };
    this.data.unshift(execution);
    return of(execution);
  }

  override deleteTaskExecution(executionId: string): Observable<void> {
    const index = this.data.findIndex((item) => item.id === executionId);
    if (index >= 0) {
      this.data.splice(index, 1);
    }
    return of(void 0);
  }

  override startTaskExecution(executionId: string): Observable<TaskExecution> {
    const execution = this.findExecution(executionId);
    execution.context.status = 'RUNNING';
    execution.context.startTime = execution.context.startTime ?? Date.now();
    return of(execution);
  }

  override prepareStringInput(
    executionId: string,
    nodeId: string,
    inputName: string,
    value: string
  ): Observable<TaskExecution> {
    const execution = this.findExecution(executionId);
    execution.context.inputs[`${nodeId}:${inputName}`] = value;
    execution.context.status = execution.context.waitingSteps.length ? 'WAITING' : execution.context.status;
    return of(execution);
  }

  override prepareFileInput(
    executionId: string,
    nodeId: string,
    inputName: string,
    file: File
  ): Observable<TaskExecution> {
    const execution = this.findExecution(executionId);
    execution.context.inputs[`${nodeId}:${inputName}`] = file?.name ?? '';
    execution.context.status = execution.context.waitingSteps.length ? 'WAITING' : execution.context.status;
    return of(execution);
  }

  override submitInteractionText(
    executionId: string,
    nodeId: string,
    fieldName: string,
    value: string
  ): Observable<TaskExecution> {
    const execution = this.findExecution(executionId);
    execution.context.executionResult[`${nodeId}:${fieldName}`] = value;
    execution.context.result[`${nodeId}:${fieldName}`] = value;
    execution.context.waitingSteps = execution.context.waitingSteps.filter((stepId) => stepId !== nodeId);

    const step = execution.context.steps[nodeId];
    if (step) {
      step.status = 'COMPLETED';
    }

    execution.context.status = execution.context.waitingSteps.length ? 'WAITING' : 'RUNNING';
    return of(execution);
  }

  override provideAuthorization(
    executionId: string,
    key: string,
    value: string
  ): Observable<TaskExecution> {
    const execution = this.findExecution(executionId);
    execution.providedAuthorizations = {
      ...(execution.providedAuthorizations ?? {}),
      [key]: value ? 'provided' : ''
    };
    execution.missingAuthorizationKeys = (execution.missingAuthorizationKeys ?? []).filter((item) => item !== key);
    return of(execution);
  }

  private findExecution(executionId: string): TaskExecution {
    const execution = this.data.find((item) => item.id === executionId);
    if (!execution) {
      throw new Error(`Execution with id ${executionId} not found`);
    }
    return execution;
  }
}
