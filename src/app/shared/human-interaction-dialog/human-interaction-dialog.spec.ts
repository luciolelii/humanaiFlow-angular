import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HumanInteractionDialogService } from '@services/dialogs/human-interaction-dialog';
import { HumanInteractionDialogHostComponent } from './human-interaction-dialog';

describe('HumanInteractionDialogHostComponent dispatcher', () => {
  let fixture: ComponentFixture<HumanInteractionDialogHostComponent>;
  let dialog: HumanInteractionDialogService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HumanInteractionDialogHostComponent]
    }).compileComponents();
    fixture = TestBed.createComponent(HumanInteractionDialogHostComponent);
    dialog = TestBed.inject(HumanInteractionDialogService);
  });

  afterEach(() => dialog.close(null));

  it('keeps chat-session on the existing chat UI', () => {
    void dialog.open({
      executionId: 'execution-1',
      nodeId: 'chat-1',
      kind: 'chat-session',
      history: [{ role: 'assistant', content: 'How can I help?' }],
      messageField: 'message',
      completionField: 'response'
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('How can I help?');
    expect(fixture.nativeElement.textContent).toContain('Send Final Response');
    expect(fixture.nativeElement.querySelector('app-human-decision-interaction')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-human-text-interaction')).toBeNull();
  });

  it('dispatches human-decision to its dedicated component', () => {
    void dialog.open({
      executionId: 'execution-1',
      nodeId: 'decision-1',
      kind: 'human-decision',
      question: 'Approve?',
      decisionOptions: [
        { name: 'approve', label: 'Approve' },
        { name: 'reject', label: 'Reject' }
      ],
      rationaleRequired: true
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-human-decision-interaction')).not.toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Send Final Response');
  });

  it('dispatches single-response to its dedicated textarea component', () => {
    void dialog.open({
      executionId: 'execution-1',
      nodeId: 'interaction-1',
      kind: 'single-response',
      actionDescription: 'Provide evidence',
      runtimeInputs: [{ name: 'input', value: 'Context' }]
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-human-text-interaction')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Provide evidence');
  });
});
