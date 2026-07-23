import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '@environment';
import { firstValueFrom } from 'rxjs';

import { TaskExecutionsCallService } from './task-executions-call';

const report = {
  id: 'report-1',
  experimentId: 'experiment-1',
  kind: 'ISOLATED_STEP',
  baselineExecutionId: 'execution-1',
  biasedExecutionId: null,
  nodeId: 'step-1',
  annotationIds: ['annotation-1'],
  repetitions: 3,
  createdAt: '2026-07-21T10:00:00',
  rawOutputsIncluded: true,
  immediateImpact: {
    outputChanged: true,
    maximumTextDifference: 0.4,
    changeRate: 1,
    baselineOutput: { output: 'baseline' },
    biasedOutputs: [{ output: 'biased' }]
  },
  downstreamImpact: [],
  routingChanges: [],
  mockedSideEffects: [{ nodeId: 'http-1', nodeName: 'HTTP call', kind: 'HTTP' }],
  summary: 'Changed output',
  warnings: []
};

describe('TaskExecutionsCallService bias APIs', () => {
  let service: TaskExecutionsCallService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [TaskExecutionsCallService, provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(TaskExecutionsCallService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('maps the execution flow snapshot, branched topology, bias annotations and node capabilities', async () => {
    const result = firstValueFrom(service.retrieveAllTaskExecutions());
    const request = httpMock.expectOne(`${environment.apiUrl}/executions`);
    request.flush([{
      id: 'execution-1',
      name: 'Branched flow',
      creationTime: 1,
      flowId: 'flow-1',
      context: {
        inputs: {},
        result: {},
        errors: {},
        warnings: {},
        waitingSteps: [],
        status: 'READY',
        steps: {},
        connections: [
          {
            id: 'branch-a',
            sourceNodeId: 'decision',
            sourceOutput: 'accepted',
            targetNodeId: 'accepted-step',
            targetInput: 'input'
          }
        ]
      },
      flowSnapshot: {
        blocks: [{
          id: 'decision',
          name: 'Decision',
          inputs: [{ name: 'input', type: 'ANY', multiple: false }],
          outputs: [{ name: 'accepted', type: 'ANY', multiple: false }],
          specificConfiguration: {},
          typeName: 'HumanDecisionBlock',
          biasAnnotations: [{ id: 'bias-1', category: 'SELECTION_BIAS' }],
          capabilities: {
            visualRole: 'DECISION',
            terminal: false,
            biasAnnotationsAllowed: true,
            allowsIncomingConnections: true,
            allowsOutgoingConnections: true,
            canDependOnOtherNodes: true,
            canHaveDependentNodes: true
          }
        }],
        containers: [],
        connections: [{
          id: 'branch-a',
          sourceId: 'decision',
          sourceName: 'accepted',
          targetId: 'accepted-step',
          targetName: 'input'
        }],
        dependencies: []
      }
    }]);

    const execution = await result;
    expect(execution[0].flowSnapshot?.connections[0]).toEqual({
      id: 'branch-a',
      sourceId: 'decision',
      sourceName: 'accepted',
      targetId: 'accepted-step',
      targetName: 'input'
    });
    expect(execution[0].flowSnapshot?.blocks[0].biasAnnotations).toEqual([
      { id: 'bias-1', category: 'SELECTION_BIAS' }
    ]);
    expect(execution[0].flowSnapshot?.blocks[0].capabilities?.visualRole).toBe('DECISION');
    expect(execution[0].stepConnections?.[0].sourceName).toBe('accepted');
  });

  it('keeps the documented root topology and execution node metadata', async () => {
    const result = firstValueFrom(service.retrieveAllTaskExecutions());
    const request = httpMock.expectOne(`${environment.apiUrl}/executions`);
    request.flush([{
      id: 'execution-id',
      name: 'test biased',
      sourceFlowId: 'flow-id',
      creationTime: 1784795504244,
      requiredAuthorizations: [],
      context: {
        inputs: {},
        result: {},
        errors: {},
        warnings: [],
        waitingSteps: [],
        status: 'CREATED',
        steps: {
          decision: {
            id: 'decision',
            status: 'WAITING_FOR_INPUT',
            skipReason: null,
            simulated: false,
            node: {
              id: 'decision',
              name: 'shortlist-decision',
              typeName: 'HumanDecisionBlock',
              userInteractive: true,
              position: { x: 600, y: 160 },
              inputs: [{ name: 'input', type: 'TEXT', multiple: false }],
              outputs: [
                { name: 'approve', type: 'TEXT', multiple: false },
                { name: 'reject', type: 'TEXT', multiple: false }
              ],
              biasAnnotations: [{ id: 'selection-risk', category: 'SELECTION_BIAS' }],
              specificConfiguration: { name: 'shortlist-decision' }
            }
          }
        }
      },
      stepConnections: [
        { id: 'approve-edge', sourceId: 'decision', sourceName: 'approve', targetId: 'approved', targetName: 'input' },
        { id: 'reject-edge', sourceId: 'decision', sourceName: 'reject', targetId: 'rejected', targetName: 'input' }
      ],
      stepDependencies: []
    }]);

    const [execution] = await result;
    const decision = execution.context.steps['decision'];
    expect(execution.stepConnections?.map((connection) => connection.sourceName)).toEqual(['approve', 'reject']);
    expect(execution.stepDependencies).toEqual([]);
    expect(decision.node?.position).toEqual({ x: 600, y: 160 });
    expect(decision.node?.userInteractive).toBe(true);
    expect(decision.node?.biasAnnotations?.[0].id).toBe('selection-risk');
  });

  it('starts an asynchronous impact experiment and maps the job response', async () => {
    const result = firstValueFrom(service.runBiasImpactExperiment('execution-1', 'step-1', {
      annotationIds: ['annotation-1'],
      repetitions: 3,
      includeRawOutputs: true,
      externalSideEffectPolicy: 'BLOCK',
      confirmExternalSideEffects: false
    }));
    const request = httpMock.expectOne(`${environment.apiUrl}/executions/execution-1/steps/step-1/bias-impact`);
    expect(request.request.method).toBe('POST');
    request.flush({
      id: 'job-1', status: 'QUEUED', executionId: 'execution-1', stepId: 'step-1',
      createdAt: '2026-07-21T10:00:00', startedAt: null, completedAt: null,
      reportId: null, report: null, errorCode: null, errorMessage: null, terminal: false
    });

    await expect(result).resolves.toEqual(expect.objectContaining({ id: 'job-1', status: 'QUEUED', terminal: false }));
  });

  it('retrieves a completed job with its persisted report', async () => {
    const result = firstValueFrom(service.getBiasImpactJob('job-1'));
    const request = httpMock.expectOne(`${environment.apiUrl}/executions/bias-impact-jobs/job-1`);
    expect(request.request.method).toBe('GET');
    request.flush({
      id: 'job-1', status: 'COMPLETED', executionId: 'execution-1', stepId: 'step-1',
      createdAt: '2026-07-21T10:00:00', startedAt: '2026-07-21T10:00:01', completedAt: '2026-07-21T10:00:02',
      reportId: 'report-1', report, errorCode: null, errorMessage: null, terminal: true
    });

    await expect(result).resolves.toEqual(expect.objectContaining({
      status: 'COMPLETED', reportId: 'report-1', report: expect.objectContaining({ mockedSideEffects: report.mockedSideEffects })
    }));
  });

  it('uses the confirmed biased rerun and comparison routes', async () => {
    const rerun = firstValueFrom(service.createBiasedRerun('baseline-1', {
      activations: [{ nodeId: 'node-1', annotationIds: ['annotation-1'] }],
      externalSideEffectPolicy: 'MOCK',
      confirmExternalSideEffects: false
    }));
    const rerunRequest = httpMock.expectOne(`${environment.apiUrl}/executions/baseline-1/bias-rerun`);
    expect(rerunRequest.request.method).toBe('POST');
    rerunRequest.flush({ id: 'variant-1', name: 'Variant', creationTime: 1, context: {} });
    await expect(rerun).resolves.toEqual(expect.objectContaining({ id: 'variant-1' }));

    const comparison = firstValueFrom(service.compareBiasExecutions('baseline-1', 'variant-1', true));
    const comparisonRequest = httpMock.expectOne(
      `${environment.apiUrl}/executions/baseline-1/bias-compare/variant-1?includeRawOutputs=true`
    );
    expect(comparisonRequest.request.method).toBe('POST');
    comparisonRequest.flush({ ...report, baselineExecutionId: 'baseline-1', biasedExecutionId: 'variant-1', kind: 'FULL_FLOW' });
    await expect(comparison).resolves.toEqual(expect.objectContaining({ kind: 'FULL_FLOW', biasedExecutionId: 'variant-1' }));
  });

  it('lists and retrieves persisted reports', async () => {
    const listed = firstValueFrom(service.listBiasImpactReports('execution-1'));
    const listRequest = httpMock.expectOne(`${environment.apiUrl}/executions/execution-1/bias-impact-reports`);
    expect(listRequest.request.method).toBe('GET');
    listRequest.flush([report]);
    await expect(listed).resolves.toEqual([expect.objectContaining({ id: 'report-1' })]);

    const detail = firstValueFrom(service.getBiasImpactReport('report-1'));
    const detailRequest = httpMock.expectOne(`${environment.apiUrl}/executions/bias-impact-reports/report-1`);
    expect(detailRequest.request.method).toBe('GET');
    detailRequest.flush(report);
    await expect(detail).resolves.toEqual(expect.objectContaining({ id: 'report-1' }));
  });
});
