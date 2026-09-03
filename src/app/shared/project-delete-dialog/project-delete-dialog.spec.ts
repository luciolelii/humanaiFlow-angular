import { TestBed } from '@angular/core/testing';
import { Project } from '@models/project';
import { ProjectDeleteDialogService } from '@services/dialogs/project-delete-dialog';

import { ProjectDeleteDialogComponent } from './project-delete-dialog';

const project: Project = {
  id: 'p1',
  name: 'Recruiting',
  owner: 'alice',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  sharedContext: { entries: [] }
};

async function open(flows: { id: string; name: string; finalized?: boolean }[]) {
  await TestBed.configureTestingModule({ imports: [ProjectDeleteDialogComponent] }).compileComponents();

  const dialog = TestBed.inject(ProjectDeleteDialogService);
  const fixture = TestBed.createComponent(ProjectDeleteDialogComponent);
  fixture.detectChanges();

  const result = dialog.open({ project, flows });
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  return { fixture, dialog, result };
}

describe('ProjectDeleteDialogComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('keeps the destructive button disabled until the exact project name is typed', async () => {
    const { fixture } = await open([{ id: 'f1', name: 'Flow A' }]);
    const component = fixture.componentInstance;

    expect(component.canConfirm()).toBe(false);

    component.typedName.set('recruiting');
    expect(component.canConfirm()).toBe(false);

    component.typedName.set('Recruiting');
    expect(component.canConfirm()).toBe(true);

    const button: HTMLButtonElement =
      fixture.nativeElement.querySelector('.project-delete__confirm-button');
    fixture.detectChanges();
    expect(button.disabled).toBe(false);
  });

  it('names the count and warns that finalized flows go too', async () => {
    const { fixture } = await open([
      { id: 'f1', name: 'Flow A' },
      { id: 'f2', name: 'Flow B', finalized: true }
    ]);

    expect(fixture.componentInstance.headline()).toBe('Delete project “Recruiting” and its 2 flows?');
    expect(fixture.componentInstance.finalizedCount()).toBe(1);

    const text: string = fixture.nativeElement.textContent;
    // The cascade breaks a rule the flow list otherwise enforces, so it must be spelled out.
    expect(text).toContain('finalized');
    expect(text).toContain('Flow A');
    expect(text).toContain('Flow B');
  });

  it('resolves false when cancelled', async () => {
    const { fixture, result } = await open([{ id: 'f1', name: 'Flow A' }]);

    fixture.componentInstance.cancel();

    await expect(result).resolves.toBe(false);
  });

  it('resolves true only once the name matches', async () => {
    const { fixture, result } = await open([{ id: 'f1', name: 'Flow A' }]);
    const component = fixture.componentInstance;

    component.confirm();
    expect(component.state()).not.toBeNull();

    component.typedName.set('Recruiting');
    component.confirm();

    await expect(result).resolves.toBe(true);
  });

  it('still asks for an empty project, but does not demand the name since nothing is destroyed', async () => {
    const { fixture } = await open([]);

    expect(fixture.componentInstance.flowCount()).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('contains no flows');
    expect(fixture.componentInstance.canConfirm()).toBe(true);
  });
});
