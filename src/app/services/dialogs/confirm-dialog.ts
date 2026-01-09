import { Injectable, signal } from "@angular/core";

@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {

  private _state = signal<{
    message: string;
    resolve: (v: boolean) => void;
  } | null>(null);

  readonly state = this._state.asReadonly();

  open(message: string): Promise<boolean> {
    return new Promise<boolean>(resolve => {
      this._state.set({ message, resolve });
    });
  }

  confirm(result: boolean) {
    const s = this._state();
    if (!s) return;

    s.resolve(result);
    this._state.set(null);
  }
}
