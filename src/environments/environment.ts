import { AuthorizationCallService } from "@services/authorization/authorization-call";
import { BlocksCallService } from "@services/blocks/blocks-call";
import { FlowsCallService } from "@services/flows/flows-call";
import { FieldRetreiverCallService } from "@services/retreiver/field-retreiver-call";

export const environment = {
        apiUrl: '/api',
        production: true,
        authorizationCallService: AuthorizationCallService,
        flowsCallService: FlowsCallService,
        blocksCallService: BlocksCallService,
        fieldRetreiverCallService: FieldRetreiverCallService
};
