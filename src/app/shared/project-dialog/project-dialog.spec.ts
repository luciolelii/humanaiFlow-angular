import { TestBed } from '@angular/core/testing';
import { ProjectDialogService } from '@services/dialogs/project-dialog';
import { ProjectDialogComponent } from './project-dialog';

describe('ProjectDialogComponent name capture', () => {
  it('resolves the typed name', async () => {
    await TestBed.configureTestingModule({ imports: [ProjectDialogComponent] }).compileComponents();
    const dialog = TestBed.inject(ProjectDialogService);
    const fixture = TestBed.createComponent(ProjectDialogComponent);
    fixture.detectChanges();

    const result = dialog.open({ project: null });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    input.value = 'Recruiting';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();

    fixture.componentInstance.submit();
    await expect(result).resolves.toEqual({ name: 'Recruiting', description: '' });
  });
});
