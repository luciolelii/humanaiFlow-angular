import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TasksExecutor } from './tasks-executor';

describe('TasksExecutor', () => {
  let component: TasksExecutor;
  let fixture: ComponentFixture<TasksExecutor>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TasksExecutor]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TasksExecutor);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
