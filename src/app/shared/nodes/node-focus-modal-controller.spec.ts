import { ElementRef } from '@angular/core';
import { NodeFocusModalController } from './node-focus-modal-controller';

describe('NodeFocusModalController', () => {
  afterEach(() => {
    document.body.removeAttribute('data-node-focus-lock-count');
    document.body.classList.remove('node-focus-modal-open');
    document.body.innerHTML = '';
  });

  function attachedHost(): { parent: HTMLElement; host: HTMLElement; sibling: HTMLElement } {
    const parent = document.createElement('div');
    const host = document.createElement('div');
    const sibling = document.createElement('span');
    parent.appendChild(host);
    parent.appendChild(sibling);
    document.body.appendChild(parent);
    return { parent, host, sibling };
  }

  it('reparents the host to <body> on open and restores its original position on close', () => {
    const { parent, host, sibling } = attachedHost();
    const controller = new NodeFocusModalController(new ElementRef(host), 'test-placeholder');

    controller.open();
    expect(host.parentNode).toBe(document.body);

    controller.close();
    expect(host.parentNode).toBe(parent);
    expect(host.nextSibling).toBe(sibling);
  });

  it('applies the body scroll-lock class and count attribute while open', () => {
    const { host } = attachedHost();
    const controller = new NodeFocusModalController(new ElementRef(host), 'test-placeholder');

    controller.open();
    expect(document.body.classList.contains('node-focus-modal-open')).toBe(true);
    expect(document.body.getAttribute('data-node-focus-lock-count')).toBe('1');

    controller.close();
    expect(document.body.classList.contains('node-focus-modal-open')).toBe(false);
    expect(document.body.hasAttribute('data-node-focus-lock-count')).toBe(false);
  });

  it('shares one body-level lock counter across multiple simultaneously-open controllers', () => {
    const first = attachedHost();
    const second = attachedHost();
    const controllerA = new NodeFocusModalController(new ElementRef(first.host), 'a');
    const controllerB = new NodeFocusModalController(new ElementRef(second.host), 'b');

    controllerA.open();
    controllerB.open();
    expect(document.body.getAttribute('data-node-focus-lock-count')).toBe('2');

    controllerA.close();
    expect(document.body.classList.contains('node-focus-modal-open')).toBe(true);
    expect(document.body.getAttribute('data-node-focus-lock-count')).toBe('1');

    controllerB.close();
    expect(document.body.classList.contains('node-focus-modal-open')).toBe(false);
  });

  it('is idempotent: opening twice or closing without opening does not throw or double-lock', () => {
    const { host } = attachedHost();
    const controller = new NodeFocusModalController(new ElementRef(host), 'test-placeholder');

    expect(() => controller.close()).not.toThrow();

    controller.open();
    controller.open();
    expect(document.body.getAttribute('data-node-focus-lock-count')).toBe('1');
  });
});
