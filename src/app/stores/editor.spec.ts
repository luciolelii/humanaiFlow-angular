import { TestBed } from '@angular/core/testing';

import { Editor } from './editor';

describe('Editor', () => {
  let service: Editor;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Editor);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
