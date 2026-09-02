import { FlowData, FlowStatus } from '@models/flow';

export type AssistantIntent = 'draft' | 'refine' | 'fix' | 'explain';

export type AssistantDraftPayload = {
  name: string;
  description?: string;
  flow: FlowData;
};

export type AssistantSendMessageRequest = {
  message: string;
};

export type AssistantFlowResult = {
  name?: string;
  description?: string;
  flow: FlowData;
};

export type AssistantValidationIssue = {
  message: string;
  path?: string;
};

export type AssistantChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  intent?: AssistantIntent | null;
  warnings?: string[];
  validationErrors?: AssistantValidationIssue[];
};

export type AssistantEditorDraft = {
  id: string;
  name: string;
  description?: string;
  data: FlowData;
  status: FlowStatus;
};

export type AssistantConfig = {
  defaultProvider: string;
  defaultModel: string;
  availableProvidersRetrieverUrl: string;
  availableModelsRetrieverUrl: string;
  defaultPhaseModels: AssistantPhaseModels;
};

export type AssistantPhaseModels = {
  planningModel?: string;
  jsonModel?: string;
  repairModel?: string;
};

export type AssistantLlmSelection = {
  provider: string;
  model: string;
  credentialId?: string;
  phaseModels?: AssistantPhaseModels;
};

export type VaultSecret = {
  id: string;
  label: string;
  provider: string;
  description?: string;
  active: boolean;
  lastUsedAt?: string;
  maskedPreview?: string;
};

export type VaultSecretCreateRequest = {
  label: string;
  provider: string;
  description?: string;
  value: string;
};

export type VaultSecretUpdateRequest = {
  label?: string;
  description?: string;
  active?: boolean;
  value?: string;
};

export type AssistantSessionRequest = {
  llmSelection?: AssistantLlmSelection;
};

export type AssistantSessionMessageRequest = {
  message: string;
  flow?: AssistantDraftPayload;
};

export type AssistantCallAccepted = {
  sessionId: string;
  callId: string;
};

export type AssistantFlowActionResult = {
  flow: AssistantDraftPayload | null;
  valid?: boolean;
  validationErrors: AssistantValidationIssue[];
  warnings: string[];
  message: string;
};

export type AssistantCallStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export type AssistantCallPhase =
  | 'queued'
  | 'routing'
  | 'planning'
  | 'configuring_blocks'
  | 'connecting_blocks'
  | 'validating'
  | 'fixing'
  | 'explaining'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type AssistantCallState = {
  id: string;
  sessionId: string;
  status: AssistantCallStatus;
  phase: AssistantCallPhase;
  progressMessage?: string;
  intent?: AssistantIntent | null;
  errorMessage?: string;
  flowResult?: AssistantFlowResult | null;
  actionResult?: AssistantFlowActionResult | null;
};

export type AssistantSessionState = {
  id: string;
  owner?: string;
  selectedModel: string;
  messages: AssistantChatMessage[];
  currentFlow: AssistantDraftPayload | null;
  currentDraftFlow: AssistantDraftPayload | null;
  lastValidationErrors: AssistantValidationIssue[];
  lastCallId: string | null;
};
