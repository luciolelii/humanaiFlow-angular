import { TestBed } from '@angular/core/testing';

import { ListState } from './list-state';

describe('ListState', () => {
  let service: ListState;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ListState);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
