import { AssistantCallService } from "@services/assistant/assistant-call";
import { AuthorizationCallService } from "@services/authorization/authorization-call";
import { BlocksCallService } from "@services/blocks/blocks-call";
import { ContainersCallService } from "@services/containers/containers-call";
import { FlowsCallService } from "@services/flows/flows-call";
import { FieldRetrieverCallService } from "@services/retriever/field-retriever-call";
import { TaskExecutionsCallService } from "@services/task-executions/task-executions-call";

export const environment = {
        apiUrl: window.__runtimeConfig?.apiUrl || '/api',
        production: true,
        assistantEnabled: window.__runtimeConfig?.assistantEnabled ?? true,
        tourModeAlwaysOn: window.__runtimeConfig?.tourModeAlwaysOn ?? false,
        turnstileEnabled: window.__runtimeConfig?.turnstileEnabled ?? true,
        authorizationCallService: AuthorizationCallService,
        assistantCallService: AssistantCallService,
        flowsCallService: FlowsCallService,
        blocksCallService: BlocksCallService,
        containersCallService: ContainersCallService,
        fieldRetrieverCallService: FieldRetrieverCallService,
        taskExecutionsCallService: TaskExecutionsCallService
};
