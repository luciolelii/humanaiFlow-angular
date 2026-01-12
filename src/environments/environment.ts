import { AuthorizationCallService } from "@services/authorization/authorization-call";
import { FlowsCallService } from "@services/flows/flows-call";

export const environment = {
        apiUrl: '/api',
        production: true,
        authorizationCallService: AuthorizationCallService,
        flowsCallService: FlowsCallService
};
