import { TestBed } from '@angular/core/testing';
import { afterEach, vi } from 'vitest';
import { NotificationService } from './notification';

describe('NotificationService', () => {
  let service: NotificationService;

  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(NotificationService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should have no current notification initially', () => {
    expect(service.current()).toBeNull();
  });

  it('should show a notification', () => {
    service.show('Test message', 'success');
    expect(service.current()).toBeTruthy();
    expect(service.current()!.message).toBe('Test message');
    expect(service.current()!.type).toBe('success');
  });

  it('should auto-dismiss after duration', async () => {
    vi.useFakeTimers();
    service.show('Auto dismiss', 'info', 2000);
    expect(service.current()).toBeTruthy();
    await vi.advanceTimersByTimeAsync(2000);
    expect(service.current()).toBeNull();
  });

  it('should dismiss manually', () => {
    service.show('Manual dismiss', 'error', 0);
    expect(service.current()).toBeTruthy();
    service.dismiss();
    expect(service.current()).toBeNull();
  });

  it('should throttle same-type notifications', () => {
    service.show('First', 'error');
    const first = service.current();
    service.show('Second', 'error');
    expect(service.current()).toBe(first);
  });

  it('should not throttle different-type notifications', () => {
    service.show('Error', 'error');
    service.show('Success', 'success');
    expect(service.current()!.message).toBe('Success');
  });
});
