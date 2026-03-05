import { AuthorizationCallFakeService } from "@services/authorization/authorization-call.fake";
import { BlocksCallServiceFake } from "@services/blocks/blocks-call.fake";
import { FlowsCallServiceFake } from "@services/flows/flows-call.fake";
import { FieldRetreiverCallServiceFake } from "@services/retreiver/field-retreiver-call.fake";
import { TaskExecutionsCallServiceFake } from "@services/task-executions/task-executions-call.fake";

export const environment = {
    production: false,
    apiUrl: 'http://localhost:8080',
    authorizationCallService: AuthorizationCallFakeService, // Assign the appropriate service here
    flowsCallService: FlowsCallServiceFake,
    blocksCallService: BlocksCallServiceFake,
    fieldRetreiverCallService: FieldRetreiverCallServiceFake,
    taskExecutionsCallService: TaskExecutionsCallServiceFake
};
