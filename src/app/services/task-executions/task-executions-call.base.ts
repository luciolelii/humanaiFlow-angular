import { LLMDescriptor } from '@models/flow';
import {
  BiasImpactExperimentRequest,
  BiasImpactJob,
  BiasImpactReport,
  BiasRerunRequest
} from '@models/bias-impact';
import { ExecutionEventLogEntry, TaskExecution, TaskExecutionGroup } from '@models/task-execution';
import { ProjectExecutionPlan, ProjectRun } from '@models/project';
import { Observable } from 'rxjs';

export abstract class TaskExecutionsCallServiceBase {
  abstract retrieveAllTaskExecutions(): Observable<TaskExecution[]>;
  abstract retrieveTaskExecutionGroups(): Observable<TaskExecutionGroup[]>;
  abstract retrieveTaskExecution(executionId: string): Observable<TaskExecution>;
  abstract retrieveStepIterations(executionId: string, stepId: string): Observable<TaskExecution[]>;
  abstract retrieveExecutionEvents(executionId: string): Observable<ExecutionEventLogEntry[]>;
  abstract createTaskExecution(flowId: string): Observable<TaskExecution>;
  /**
   * Runs a whole project: creates one execution per flow, all sharing a projectRunId. It does not
   * start them - the client still supplies inputs and credentials, exactly as for a single flow.
   */
  abstract createProjectExecutions(projectId: string, skipNonExecutable: boolean): Observable<ProjectExecutionPlan>;
  /**
   * Starts, or resumes, a project run. The flows run one at a time in the project's order; each
   * step starts only when the previous one succeeded.
   */
  abstract startProjectRun(projectId: string, projectRunId: string): Observable<ProjectRun>;
  abstract rerunTaskExecution(executionId: string): Observable<TaskExecution>;
  abstract runBiasImpactExperiment(
    executionId: string,
    stepId: string,
    request: BiasImpactExperimentRequest
  ): Observable<BiasImpactJob>;
  abstract getBiasImpactJob(jobId: string): Observable<BiasImpactJob>;
  abstract createBiasedRerun(executionId: string, request: BiasRerunRequest): Observable<TaskExecution>;
  abstract compareBiasExecutions(
    baselineExecutionId: string,
    biasedExecutionId: string,
    includeRawOutputs: boolean
  ): Observable<BiasImpactReport>;
  abstract listBiasImpactReports(executionId: string): Observable<BiasImpactReport[]>;
  abstract getBiasImpactReport(reportId: string): Observable<BiasImpactReport>;
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
  abstract prepareGlobalStringInput(
    executionId: string,
    inputName: string,
    value: string
  ): Observable<TaskExecution>;
  abstract prepareGlobalStringArrayInput(
    executionId: string,
    inputName: string,
    values: string[]
  ): Observable<TaskExecution>;
  abstract prepareGlobalFileInput(
    executionId: string,
    inputName: string,
    file: File
  ): Observable<TaskExecution>;
  abstract prepareGlobalFileArrayInput(
    executionId: string,
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
