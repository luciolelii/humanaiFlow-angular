import { AuthorizationCallService } from "@services/authorization/authorization-call";
import { BlocksCallService } from "@services/blocks/blocks-call";
import { FlowsCallService } from "@services/flows/flows-call";
import { FieldRetrieverCallService } from "@services/retriever/field-retriever-call";
import { TaskExecutionsCallService } from "@services/task-executions/task-executions-call";

export const environment = {
    production: false,
    apiUrl: 'http://localhost:8080',
    authorizationCallService: AuthorizationCallService,
    flowsCallService: FlowsCallService,
    blocksCallService: BlocksCallService,
    fieldRetrieverCallService: FieldRetrieverCallService,
    taskExecutionsCallService: TaskExecutionsCallService
};
