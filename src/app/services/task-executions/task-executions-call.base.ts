import { LLMDescriptor } from '@models/flow';
import { ExecutionEventLogEntry, TaskExecution } from '@models/task-execution';
import { Observable } from 'rxjs';

export abstract class TaskExecutionsCallServiceBase {
  abstract retrieveAllTaskExecutions(): Observable<TaskExecution[]>;
  abstract retrieveExecutionEvents(executionId: string): Observable<ExecutionEventLogEntry[]>;
  abstract createTaskExecution(flowId: string): Observable<TaskExecution>;
  abstract deleteTaskExecution(executionId: string): Observable<void>;
  abstract startTaskExecution(executionId: string): Observable<TaskExecution>;
  abstract simulateTaskExecution(executionId: string, simulator: LLMDescriptor): Observable<TaskExecution>;
  abstract cancelTaskExecution(executionId: string): Observable<TaskExecution>;
  abstract resumeTaskExecution(executionId: string): Observable<TaskExecution>;
  abstract prepareStringInput(
    executionId: string,
    nodeId: string,
    inputName: string,
    value: string
  ): Observable<TaskExecution>;
  abstract prepareStringArrayInput(
    executionId: string,
    nodeId: string,
    inputName: string,
    values: string[]
  ): Observable<TaskExecution>;
  abstract prepareFileInput(
    executionId: string,
    nodeId: string,
    inputName: string,
    file: File
  ): Observable<TaskExecution>;
  abstract prepareFileArrayInput(
    executionId: string,
    nodeId: string,
    inputName: string,
    files: File[]
  ): Observable<TaskExecution>;
  abstract submitInteractionText(
    executionId: string,
    nodeId: string,
    fieldName: string,
    value: string
  ): Observable<TaskExecution>;
  abstract provideAuthorization(
    executionId: string,
    key: string,
    value: string
  ): Observable<TaskExecution>;
}
