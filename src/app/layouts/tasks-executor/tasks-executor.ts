import { Component, signal } from '@angular/core';
import { TaskExecution } from '@models/task-execution';
import { TasksExecutionsListComponent, TaskExecutionListItem } from '@shared/tasks-executions-list/tasks-executions-list';
import { TaskExecutionViewerComponent } from '@shared/task-execution-viewer/task-execution-viewer';

@Component({
  selector: 'app-tasks-executor',
  imports: [TasksExecutionsListComponent, TaskExecutionViewerComponent],
  templateUrl: './tasks-executor.html',
  styleUrl: './tasks-executor.css',
})
export class TasksExecutor {
  readonly executionDetails = signal<TaskExecution[]>([
    {
      id: 'c106be9d-5467-428c-8992-0b5f40a59aac',
      name: 'Test Flow',
      creationTime: 1772619308394,
      context: {
        inputs : {
          'feeb2977-370f-4bf9-aa84-04fa2f11e365:name' : 'Leonardo da Vinci'
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
              sink: false,
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
              sink: true,
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
      context: {
        inputs: {
          '95ebb03f-80e0-412d-87ee-2d4b7ddef240:name': 'marie curie'
        },
        result: {
          '68c5949c-1c74-400e-a1aa-b5f7739e5bb2:output': 'Based on the provided context, Marie Curie is a remarkable scientist and explorer who made significant contributions to the field of science and exploration. She is often considered a pioneer in the field of radioactivity.\n'
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
              sink: false,
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
              sink: true,
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
                },
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
                value: 'Marie Curie is a remarkable scientist and explorer who made significant contributions to science and exploration. She is often considered a pioneer in the field of radioactivity. What is your opinion about her contributions to the field of science and exploration?',
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
          '68c5949c-1c74-400e-a1aa-b5f7739e5bb2:output': 'Based on the provided context, Marie Curie is a remarkable scientist and explorer who made significant contributions to the field of science and exploration. She is often considered a pioneer in the field of radioactivity.\n'
        }
      }
    }
  ]);

  readonly executions = signal<TaskExecutionListItem[]>([
    {
      id: 'c106be9d-5467-428c-8992-0b5f40a59aac',
      title: 'Test Flow',
      flowName: 'Test Flow',
      status: 'ERROR',
      startedAt: '2026-03-03 10:35',
      duration: '00:00:00'
    },
    {
      id: 'eda4040e-ae58-4ffb-a3b4-16dfef45a6c2',
      title: 'Test Flow',
      flowName: 'Test Flow',
      status: 'COMPLETED',
      startedAt: '2026-03-03 11:51',
      duration: '00:37:43'
    }
  ]);

  readonly selectedExecutionId = signal<string | null>(this.executions()[0]?.id ?? null);

  readonly selectedExecution = () =>
    this.executionDetails().find((execution) => execution.id === this.selectedExecutionId()) ?? null;

  selectExecution(id: string) {
    this.selectedExecutionId.set(id);
  }
}
