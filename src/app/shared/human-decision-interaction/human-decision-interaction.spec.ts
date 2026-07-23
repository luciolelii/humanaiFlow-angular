import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HumanInteractionDialogState } from '@services/dialogs/human-interaction-dialog';
import { HumanDecisionInteractionComponent } from './human-decision-interaction';

function state(overrides: Partial<HumanInteractionDialogState> = {}): HumanInteractionDialogState {
  return {
    executionId: 'execution-1',
    nodeId: 'decision-1',
    title: 'Decision',
    kind: 'human-decision',
    actionDescription: '',
    currentInput: '',
    runtimeInputs: [{ name: 'input', value: 'Candidate evidence' }],
    history: [],
    latestResponse: '',
    historyField: null,
    responseField: 'choice',
    messageField: 'rationale',
    completionField: 'choice',
    pendingUserMessage: null,
    awaitingAssistantResponse: false,
    assistantResponseBaseline: '',
    isRunning: false,
    isSubmitting: false,
    submitError: null,
    question: 'Should the candidate proceed?',
    decisionOptions: [
      { name: 'approve', label: 'Approve' },
      { name: 'reject', label: 'Reject' }
    ],
    rationaleRequired: true,
    rationaleLabel: 'Evidence-based rationale',
    onSubmit: null,
    resolve: () => undefined,
    ...overrides
  };
}

describe('HumanDecisionInteractionComponent', () => {
  let fixture: ComponentFixture<HumanDecisionInteractionComponent>;
  let component: HumanDecisionInteractionComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HumanDecisionInteractionComponent]
    }).compileComponents();
    fixture = TestBed.createComponent(HumanDecisionInteractionComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('state', state());
    fixture.detectChanges();
  });

  it('requires one option and the mandatory rationale', () => {
    expect(component.canSubmit()).toBe(false);
    component.selectChoice('approve');
    expect(component.canSubmit()).toBe(false);
    component.rationale = 'Documented evidence satisfies the criteria.';
    expect(component.canSubmit()).toBe(true);
  });

  it('emits the technical option name, never its label', () => {
    const emitted: unknown[] = [];
    component.submitDecision.subscribe((value) => emitted.push(value));
    component.selectChoice('approve');
    component.rationale = 'Documented evidence';
    component.submit();

    expect(emitted).toEqual([{
      mode: 'decision',
      choice: 'approve',
      rationale: 'Documented evidence'
    }]);
  });

  it('keeps local values when an API error updates the dialog state', () => {
    component.selectChoice('reject');
    component.rationale = 'Mandatory criterion is missing';
    fixture.componentRef.setInput('state', state({ submitError: 'Network error' }));
    fixture.detectChanges();

    expect(component.selectedChoice).toBe('reject');
    expect(component.rationale).toBe('Mandatory criterion is missing');
    expect(fixture.nativeElement.textContent).toContain('Network error');
  });
});
