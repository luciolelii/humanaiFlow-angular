import { AssistantCallService } from "@services/assistant/assistant-call";
import { AuthorizationCallService } from "@services/authorization/authorization-call";
import { BlocksCallService } from "@services/blocks/blocks-call";
import { ContainersCallService } from "@services/containers/containers-call";
import { FlowsCallService } from "@services/flows/flows-call";
import { FieldRetrieverCallService } from "@services/retriever/field-retriever-call";
import { TaskExecutionsCallService } from "@services/task-executions/task-executions-call";

export const environment = {
    production: false,
    apiUrl: 'http://localhost:8080',
    assistantEnabled: true,
    tourModeAlwaysOn: false,
    assistantCallService: AssistantCallService,
    authorizationCallService: AuthorizationCallService,
    flowsCallService: FlowsCallService,
    blocksCallService: BlocksCallService,
    containersCallService: ContainersCallService,
    fieldRetrieverCallService: FieldRetrieverCallService,
    taskExecutionsCallService: TaskExecutionsCallService
};
