import { TestBed } from '@angular/core/testing';
import { ListState } from './list-state';

describe('ListState', () => {
  let service: ListState;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [ListState] });
    service = TestBed.inject(ListState);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should return null for non-existent key', () => {
    expect(service.get('unknown')).toBeNull();
  });

  it('should create and retrieve a list view', () => {
    service.create('test');
    const view = service.get('test');
    expect(view).toBeTruthy();
    expect(view!.order.orderBy).toBeNull();
    expect(view!.order.orderDir).toBe('asc');
  });

  it('should apply default order options on create', () => {
    service.create('sorted', {
      defaultOrder: { orderBy: 'name', orderDir: 'desc' },
    });
    const view = service.get('sorted');
    expect(view!.order.orderBy).toBe('name');
    expect(view!.order.orderDir).toBe('desc');
  });

  it('should apply default filter on create', () => {
    service.create('filtered', { defaultFilter: 'search term' });
    const view = service.get('filtered');
    expect(view!.filter).toBe('search term');
  });

  it('should not overwrite existing list view on duplicate create', () => {
    service.create('dup');
    const original = service.get('dup');
    original!.filter = 'modified';
    service.create('dup');
    expect(service.get('dup')!.filter).toBe('modified');
  });

  it('should use "default" key when kind is undefined', () => {
    service.create(undefined);
    expect(service.get(undefined)).toBeTruthy();
    expect(service.get('default')).toBeTruthy();
  });
});
