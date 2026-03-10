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

export type AssistantFlowResponse = {
  flow: AssistantDraftPayload;
  valid: boolean;
  validationErrors: AssistantValidationIssue[];
  warnings: string[];
  assistantRationale?: string;
  repairAttempts?: number;
};

export type AssistantExplainResponse = {
  explanation: string;
  warnings: string[];
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
