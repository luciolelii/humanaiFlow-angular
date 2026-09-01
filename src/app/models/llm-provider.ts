export type LlmProviderCapability = {
  name: string;
  requiresCredential: boolean;
};

export type ExecutionVaultCredential = {
  id: string;
  label: string;
  description?: string;
  provider: string;
};
