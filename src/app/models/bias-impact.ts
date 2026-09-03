import { BiasActivationMode } from './flow';

export type BiasInterventionDirection = 'BIAS' | 'MITIGATION' | 'BOTH';

export type BiasCapabilities = {
  blockType: string;
  supported: boolean;
  isolatedExperimentSupported: boolean;
  fullFlowExperimentSupported: boolean;
  externalSideEffects: boolean;
  configurationDependent: boolean;
  activationModes: BiasActivationMode[];
};

export type ExternalSideEffectPolicy = 'BLOCK' | 'MOCK' | 'REQUIRE_CONFIRMATION';

export type BiasImpactExperimentRequest = {
  annotationIds: string[];
  direction: BiasInterventionDirection;
  repetitions: number;
  includeRawOutputs: boolean;
  externalSideEffectPolicy: ExternalSideEffectPolicy;
  confirmExternalSideEffects: boolean;
};

export type BiasRerunActivation = {
  nodeId: string;
  annotationIds: string[];
  includeSubflow: boolean;
  direction: BiasInterventionDirection;
};

export type BiasRerunRequest = {
  activations: BiasRerunActivation[];
  externalSideEffectPolicy: ExternalSideEffectPolicy;
  confirmExternalSideEffects: boolean;
};

/**
 * The values the API actually sends: the backend enum is NORMAL | EXPERIMENT.
 *
 * The product vocabulary is "variant", and this type used to say `BIAS_VARIANT` - a value no
 * endpoint has ever emitted, which silently made every run look ordinary. The names differ on
 * purpose; do not "correct" this one back to match the UI wording.
 */
export type BiasExecutionMode = 'NORMAL' | 'EXPERIMENT' | string;

/**
 * The shape the API actually sends. Bias and mitigation are tracked in *separate* collections, per
 * node for annotations and per container for activated subflows, so the direction of a variant is
 * read from which of them are non-empty.
 *
 * There is deliberately no `activeAnnotationIdsByNode` and no `activeBiasProbes` here: neither is
 * ever sent on this object - probes belong to a step view - and modelling them made code silently
 * read undefined.
 */
export type BiasExecutionContext = {
  experimentId: string | null;
  mode: BiasExecutionMode;
  activeBiasAnnotationIdsByNode: Record<string, string[]>;
  activeMitigationAnnotationIdsByNode: Record<string, string[]>;
  biasSubflowActivatedContainerIds: string[];
  mitigationSubflowActivatedContainerIds: string[];
  externalSideEffectPolicy: ExternalSideEffectPolicy;
  externalSideEffectsConfirmed: boolean;
};

export type BiasInterventionMix = 'BIAS' | 'MITIGATION' | 'MIXED';

function hasAnnotations(byNode: Record<string, string[]> | undefined): boolean {
  return Object.values(byNode ?? {}).some((ids) => (ids ?? []).length > 0);
}

/** True only for a real variant: the object is present on every execution, defaulting to NORMAL. */
export function isBiasVariantContext(context: BiasExecutionContext | null | undefined): boolean {
  return context?.mode === 'EXPERIMENT';
}

/**
 * Which interventions a variant actually ran with. Null when it is not a variant, or when it is one
 * but nothing is recorded as active - which is worth showing as "unspecified" rather than guessing
 * one of the two.
 */
export function biasInterventionMix(
  context: BiasExecutionContext | null | undefined
): BiasInterventionMix | null {
  if (!isBiasVariantContext(context)) return null;

  const bias = hasAnnotations(context!.activeBiasAnnotationIdsByNode)
    || (context!.biasSubflowActivatedContainerIds ?? []).length > 0;
  const mitigation = hasAnnotations(context!.activeMitigationAnnotationIdsByNode)
    || (context!.mitigationSubflowActivatedContainerIds ?? []).length > 0;

  if (bias && mitigation) return 'MIXED';
  if (mitigation) return 'MITIGATION';
  if (bias) return 'BIAS';
  return null;
}

/** Every annotation active on a node, whichever direction it points in. */
export function activeAnnotationIdsFor(
  context: BiasExecutionContext | null | undefined,
  nodeId: string
): string[] {
  if (!context) return [];
  return [
    ...(context.activeBiasAnnotationIdsByNode?.[nodeId] ?? []),
    ...(context.activeMitigationAnnotationIdsByNode?.[nodeId] ?? [])
  ];
}

export type BiasImpactJobStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export type BiasImpactJob = {
  id: string;
  status: BiasImpactJobStatus;
  executionId: string;
  stepId: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  reportId: string | null;
  report: BiasImpactReport | null;
  errorCode: string | null;
  errorMessage: string | null;
  terminal: boolean;
};

export type BiasImpactReportKind = 'ISOLATED_STEP' | 'FULL_FLOW';

export type BiasImmediateImpact = {
  outputChanged: boolean;
  maximumTextDifference: number;
  changeRate: number;
  baselineOutput: unknown;
  biasedOutputs: unknown[];
};

export type BiasDownstreamImpactEntry = {
  nodeId: string;
  nodeName: string;
  baselineStatus: string;
  biasedStatus: string;
  changed: boolean;
  baselineOutputs: unknown;
  biasedOutputs: unknown;
};

export type BiasRoutingChangeEntry = {
  nodeId: string;
  baselineBranch: string;
  biasedBranch: string;
};

export type BiasMockedSideEffectKind =
  | 'HTTP'
  | 'MCP_AGENT'
  | 'MCP_AGENT_CHAT'
  | 'EXTERNAL';

export type BiasMockedSideEffect = {
  nodeId: string;
  nodeName: string;
  kind: BiasMockedSideEffectKind;
};

export type BiasImpactReport = {
  id: string;
  experimentId: string;
  kind: BiasImpactReportKind;
  baselineExecutionId: string;
  biasedExecutionId: string | null;
  nodeId: string | null;
  annotationIds: string[];
  repetitions: number;
  createdAt: string;
  rawOutputsIncluded: boolean;
  immediateImpact: BiasImmediateImpact;
  downstreamImpact: BiasDownstreamImpactEntry[];
  routingChanges: BiasRoutingChangeEntry[];
  mockedSideEffects: BiasMockedSideEffect[];
  summary: string;
  warnings: string[];
  interventionDirection?: BiasInterventionDirection;
};

export const BIAS_PROBE_ERROR_CODES = [
  'BIAS_PROBE_MODE_REQUIRED',
  'BIAS_PROBE_INSTRUCTION_REQUIRED',
  'BIAS_PROBE_MODE_UNSUPPORTED',
  'BIAS_PROBE_TARGET_INPUT_NOT_FOUND',
  'BIAS_PROBE_MOCK_OUTPUTS_REQUIRED',
  'BIAS_PROBE_MOCK_OUTPUT_NOT_FOUND',
  'BIAS_PROBE_MOCK_OUTPUT_TYPE_MISMATCH',
  'DUPLICATE_BIAS_ANNOTATION_ID',
  'TOO_MANY_BIAS_ANNOTATIONS',
  'BIAS_FIELD_TOO_LONG'
] as const;

export type BiasProbeErrorCode = typeof BIAS_PROBE_ERROR_CODES[number];

export const BIAS_EXPERIMENT_ERROR_CODES = [
  'BIAS_BASELINE_NOT_FINAL',
  'BIAS_STEP_NOT_FOUND',
  'BIAS_BLOCK_NOT_SUPPORTED',
  'BIAS_ANNOTATION_NOT_FOUND',
  'BIAS_ANNOTATION_NOT_EXECUTABLE',
  'BIAS_EXECUTION_NOT_FINAL',
  'BIAS_EXECUTION_NOT_VARIANT',
  'BIAS_EXECUTION_HISTORY_MISMATCH',
  'BIAS_SIDE_EFFECT_BLOCKED',
  'BIAS_SIDE_EFFECT_CONFIRMATION_REQUIRED',
  'BIAS_SUBFLOW_ON_NON_CONTAINER',
  'BIAS_SUBFLOW_NOT_EXECUTABLE',
  'BIAS_ACTIVATION_ANNOTATIONS_REQUIRED',
  'BIAS_JOB_NOT_FOUND',
  'BIAS_REPORT_NOT_FOUND',
  'BIAS_EXPERIMENT_FAILED'
] as const;

export type BiasExperimentErrorCode = typeof BIAS_EXPERIMENT_ERROR_CODES[number];

export type BiasSideEffectError = {
  reason: 'SIDE_EFFECT_BLOCKED' | 'CONFIRMATION_REQUIRED';
  code: 'BIAS_SIDE_EFFECT_BLOCKED' | 'BIAS_SIDE_EFFECT_CONFIRMATION_REQUIRED';
  message: string;
};
