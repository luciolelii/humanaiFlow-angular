import { ElementRef } from '@angular/core';

const BODY_LOCK_CLASS = 'node-focus-modal-open';
const BODY_LOCK_COUNT_ATTR = 'data-node-focus-lock-count';

/**
 * Handles the "expanded/focus" modal chrome shared by generic-node and
 * container-node: reparents the node's host element to `<body>` so it renders
 * above the canvas, and locks page scroll while open via a shared body-level
 * counter (so multiple simultaneously-open nodes stack correctly instead of
 * unlocking the page as soon as any single one closes).
 */
export class NodeFocusModalController {
  private pageScrollLocked = false;
  private placeholder: Comment | null = null;
  private originalParent: Node | null = null;
  private originalNextSibling: Node | null = null;

  constructor(
    private readonly hostElement: ElementRef<HTMLElement>,
    private readonly placeholderLabel: string
  ) {}

  open(): void {
    this.attachHostToModalLayer();
    this.applyPageScrollLock();
  }

  close(): void {
    this.releasePageScrollLock();
    this.restoreHostFromModalLayer();
  }

  private applyPageScrollLock() {
    if (this.pageScrollLocked) return;
    const body = document.body;
    const currentCount = Number(body.getAttribute(BODY_LOCK_COUNT_ATTR) ?? '0');
    const nextCount = Number.isFinite(currentCount) ? currentCount + 1 : 1;
    body.setAttribute(BODY_LOCK_COUNT_ATTR, String(nextCount));
    body.classList.add(BODY_LOCK_CLASS);
    this.pageScrollLocked = true;
  }

  private releasePageScrollLock() {
    if (!this.pageScrollLocked) return;
    const body = document.body;
    const currentCount = Number(body.getAttribute(BODY_LOCK_COUNT_ATTR) ?? '0');
    const nextCount = Number.isFinite(currentCount) ? Math.max(0, currentCount - 1) : 0;

    if (nextCount === 0) {
      body.removeAttribute(BODY_LOCK_COUNT_ATTR);
      body.classList.remove(BODY_LOCK_CLASS);
    } else {
      body.setAttribute(BODY_LOCK_COUNT_ATTR, String(nextCount));
    }

    this.pageScrollLocked = false;
  }

  private attachHostToModalLayer() {
    const host = this.hostElement.nativeElement;
    const parent = host.parentNode;
    if (!parent || host.parentNode === document.body) return;

    this.originalParent = parent;
    this.originalNextSibling = host.nextSibling;
    this.placeholder = document.createComment(this.placeholderLabel);
    parent.insertBefore(this.placeholder, host);
    document.body.appendChild(host);
  }

  private restoreHostFromModalLayer() {
    const host = this.hostElement.nativeElement;
    if (!this.originalParent) return;

    if (this.placeholder?.parentNode === this.originalParent) {
      this.originalParent.insertBefore(host, this.placeholder);
      this.originalParent.removeChild(this.placeholder);
    } else if (this.originalNextSibling?.parentNode === this.originalParent) {
      this.originalParent.insertBefore(host, this.originalNextSibling);
    } else {
      this.originalParent.appendChild(host);
    }

    this.placeholder = null;
    this.originalParent = null;
    this.originalNextSibling = null;
  }
}
