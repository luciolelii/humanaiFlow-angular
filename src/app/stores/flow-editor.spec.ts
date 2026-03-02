import { TestBed } from '@angular/core/testing';

import { EditorStateHolder } from './flow-editor';

describe('EditorStateHolder', () => {
  let service: EditorStateHolder;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(EditorStateHolder);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
