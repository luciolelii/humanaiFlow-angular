import { AuthorizationCallFakeService } from "@services/authorization/authorization-call.fake";
import { FlowsCallServiceFake } from "@services/flows/flows-call.fake";

export const environment = {
    production: false,
    apiUrl: 'http://localhost:8080',
    authorizationCallService: AuthorizationCallFakeService, // Assign the appropriate service here
    flowsCallService: FlowsCallServiceFake
};
