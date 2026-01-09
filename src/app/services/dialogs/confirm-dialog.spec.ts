import { TestBed } from '@angular/core/testing';

import { ConfirmDialog } from './confirm-dialog';

describe('ConfirmDialog', () => {
  let service: ConfirmDialog;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ConfirmDialog);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
