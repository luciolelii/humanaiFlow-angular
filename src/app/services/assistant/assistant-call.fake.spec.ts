import { AssistantCallServiceFake } from './assistant-call.fake';

describe('AssistantCallServiceFake', () => {
  let service: AssistantCallServiceFake;

  beforeEach(() => {
    service = new AssistantCallServiceFake();
  });

  it('uses the selected model only when a custom selection is supplied', async () => {
    let selectedModel = '';
    service.draft({
      userPrompt: 'Create a flow',
      llmSelection: { provider: 'OpenAI', model: 'custom-model' }
    }).subscribe((result) => {
      selectedModel = String(
        (result.flow?.flow.blocks[1]?.specificConfiguration as Record<string, any>)['llmDescriptor']?.model
      );
    });

    expect(selectedModel).toBe('custom-model');
  });
});
