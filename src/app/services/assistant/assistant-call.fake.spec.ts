import { firstValueFrom } from 'rxjs';
import { AssistantCallServiceFake } from './assistant-call.fake';

describe('AssistantCallServiceFake', () => {
  let service: AssistantCallServiceFake;

  beforeEach(() => {
    service = new AssistantCallServiceFake();
  });

  it('drafts a new flow when the session has no flow yet', async () => {
    const accepted = await firstValueFrom(service.submitMessage('session-1', { message: 'Create a flow' }));
    const call = await firstValueFrom(service.getCall(accepted.callId));

    expect(call.status).toBe('COMPLETED');
    expect(call.intent).toBe('draft');
    expect(call.actionResult?.flow?.flow.blocks.length).toBeGreaterThan(0);
  });

  it('refines the attached flow when one is present', async () => {
    const draftAccepted = await firstValueFrom(service.submitMessage('session-1', { message: 'Create a flow' }));
    const draftCall = await firstValueFrom(service.getCall(draftAccepted.callId));
    const flow = draftCall.actionResult!.flow!;

    const refineAccepted = await firstValueFrom(service.submitMessage('session-1', { message: 'Add a review step', flow }));
    const refineCall = await firstValueFrom(service.getCall(refineAccepted.callId));

    expect(refineCall.intent).toBe('refine');
    expect(refineCall.actionResult?.flow?.flow.blocks.some((block) => block.id === 'assistant-extra-review')).toBe(true);
  });

  it('reports a cancelled call', async () => {
    const accepted = await firstValueFrom(service.submitMessage('session-1', { message: 'Create a flow' }));
    const cancelled = await firstValueFrom(service.cancelCall(accepted.callId));

    expect(cancelled.status).toBe('CANCELLED');
  });
});
