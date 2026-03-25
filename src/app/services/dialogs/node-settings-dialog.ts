import { Injectable, signal } from "@angular/core";

export type NodeSettingFieldType = "text" | "password" | "textarea" | "select" | "checkbox" | "display";

export type NodeSettingOption = {
  label: string;
  value: string;
};

export type NodeSettingField = {
  key: string;
  label: string;
  type: NodeSettingFieldType;
  placeholder?: string;
  tip?: string;
  rows?: number;
  readonly?: boolean;
  autofocus?: boolean;
  copyable?: boolean;
  required?: boolean;
  options?: NodeSettingOption[];
};

export type NodeSettingsValues = Record<string, string | boolean>;

export type NodeSettingsDialogRefresh = {
  fields: NodeSettingField[];
  initial?: NodeSettingsValues;
};

export type NodeSettingsDialogInput = {
  title?: string;
  fields: NodeSettingField[];
  initial?: NodeSettingsValues;
  onValuesChange?: (draft: NodeSettingsValues) =>
    Promise<NodeSettingsDialogRefresh | null> | NodeSettingsDialogRefresh | null;
};

@Injectable({ providedIn: "root" })
export class NodeSettingsDialogService {
  private _state = signal<{
    title: string;
    fields: NodeSettingField[];
    initial: NodeSettingsValues;
    onValuesChange: ((draft: NodeSettingsValues) =>
      Promise<NodeSettingsDialogRefresh | null> | NodeSettingsDialogRefresh | null) | null;
    resolve: (value: NodeSettingsValues | null) => void;
  } | null>(null);

  readonly state = this._state.asReadonly();

  open(input: NodeSettingsDialogInput): Promise<NodeSettingsValues | null> {
    return new Promise((resolve) => {
      this._state.set({
        title: input.title ?? "Node Settings",
        fields: input.fields,
        initial: input.initial ?? {},
        onValuesChange: input.onValuesChange ?? null,
        resolve
      });
    });
  }

  close(value: NodeSettingsValues | null) {
    const state = this._state();
    if (!state) return;
    state.resolve(value);
    this._state.set(null);
  }
}
