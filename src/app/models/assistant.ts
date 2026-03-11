import { FlowData, FlowStatus } from '@models/flow';

export type AssistantIntent = 'draft' | 'refine' | 'fix' | 'explain';

export type AssistantDraftPayload = {
  name: string;
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
  provider?: string;
  defaultModel: string;
  availableModelsRetrieverUrl: string;
};

export type AssistantCallStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';

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
  | 'failed';

export type AssistantCallState = {
  id: string;
  sessionId: string;
  status: AssistantCallStatus;
  phase: AssistantCallPhase;
  progressMessage?: string;
  intent?: AssistantIntent | null;
  errorMessage?: string;
};

export type AssistantSessionState = {
  id: string;
  owner?: string;
  selectedModel: string;
  messages: AssistantChatMessage[];
  currentDraftFlow: AssistantDraftPayload | null;
  lastValidationErrors: AssistantValidationIssue[];
  lastCallId: string | null;
};
