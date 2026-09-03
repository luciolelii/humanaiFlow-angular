import { AdminCallService } from "@services/admin/admin-call";
import { AssistantCallService } from "@services/assistant/assistant-call";
import { AuthorizationCallService } from "@services/authorization/authorization-call";
import { BlocksCallService } from "@services/blocks/blocks-call";
import { ContainersCallService } from "@services/containers/containers-call";
import { ExecutionVaultCredentialsCallService } from "@services/llm-provider/execution-vault-credentials-call";
import { LlmProviderCallService } from "@services/llm-provider/llm-provider-call";
import { VaultCallService } from "@services/vault/vault-call";
import { FlowsCallService } from "@services/flows/flows-call";
import { ProjectsCallService } from "@services/projects/projects-call";
import { FieldRetrieverCallService } from "@services/retriever/field-retriever-call";
import { TaskExecutionsCallService } from "@services/task-executions/task-executions-call";

export const environment = {
        apiUrl: window.__runtimeConfig?.apiUrl || '/api',
        production: true,
        assistantEnabled: window.__runtimeConfig?.assistantEnabled ?? true,
        tourModeAlwaysOn: window.__runtimeConfig?.tourModeAlwaysOn ?? false,
        turnstileEnabled: window.__runtimeConfig?.turnstileEnabled ?? true,
        authorizationCallService: AuthorizationCallService,
        adminCallService: AdminCallService,
        assistantCallService: AssistantCallService,
        flowsCallService: FlowsCallService,
        projectsCallService: ProjectsCallService,
        blocksCallService: BlocksCallService,
        containersCallService: ContainersCallService,
        fieldRetrieverCallService: FieldRetrieverCallService,
        taskExecutionsCallService: TaskExecutionsCallService,
        llmProviderCallService: LlmProviderCallService,
        executionVaultCredentialsCallService: ExecutionVaultCredentialsCallService,
        vaultCallService: VaultCallService
};
