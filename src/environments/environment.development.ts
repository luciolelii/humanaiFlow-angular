import { AssistantCallServiceFake } from "@services/assistant/assistant-call.fake";
import { AuthorizationCallFakeService } from "@services/authorization/authorization-call.fake";
import { BlocksCallServiceFake } from "@services/blocks/blocks-call.fake";
import { ContainersCallServiceFake } from "@services/containers/containers-call.fake";
import { FlowsCallServiceFake } from "@services/flows/flows-call.fake";
import { FieldRetrieverCallServiceFake } from "@services/retriever/field-retriever-call.fake";
import { TaskExecutionsCallServiceFake } from "@services/task-executions/task-executions-call.fake";

export const environment = {
    production: false,
    apiUrl: 'http://localhost:8080',
    assistantEnabled: false,
    tourModeAlwaysOn: true,
    turnstileSiteKey: '',
    authorizationCallService: AuthorizationCallFakeService, // Assign the appropriate service here
    assistantCallService: AssistantCallServiceFake,
    flowsCallService: FlowsCallServiceFake,
    blocksCallService: BlocksCallServiceFake,
    containersCallService: ContainersCallServiceFake,
    fieldRetrieverCallService: FieldRetrieverCallServiceFake,
    taskExecutionsCallService: TaskExecutionsCallServiceFake
};
