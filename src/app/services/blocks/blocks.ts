import { Injectable, signal } from '@angular/core';
import { environment } from '@environment';
import { BlockType, BlockTypeName, FlowBlock } from '@models/flow';
import { BlocksCallServiceBase } from './block-call.base';
import { catchError, firstValueFrom, of, throwError } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class BlocksService {
  blocksCallService: BlocksCallServiceBase = new environment.blocksCallService();

  toInit: boolean = true;
  private loadingPromise: Promise<void> | null = null;

  private _blockTypes = signal<BlockType[]>([]);

  async getAllBlocksTypes() {
    if (this.toInit) {
      await this.refresh();
      this.toInit = false;
    }

    return this._blockTypes.asReadonly();
  }

  async refresh(force = false): Promise<void> {
    if (this.loadingPromise && !force) {
      return this.loadingPromise;
    }

    this.loadingPromise = firstValueFrom(this.blocksCallService.retrieveAllBlocksTypes())
      .then((blockTypes) => {
        this._blockTypes.set(blockTypes);
      })
      .catch((err) => {
        console.error('Retrieve blocks types failed', err);
        throw err;
      })
      .finally(() => {
        this.loadingPromise = null;
      });

    return this.loadingPromise;
  }

  async getBlockType(typeName: BlockTypeName) {
    const current = this._blockTypes().find((blockType) => blockType.type === typeName);
    if (current) return current;

    const blockTypes = await firstValueFrom(this.blocksCallService.retrieveAllBlocksTypes());
    this._blockTypes.set(blockTypes);
    return blockTypes.find((blockType) => blockType.type === typeName);
  }

  createEmptyBlock(blockType: BlockTypeName) {
    const descriptor = this._blockTypes().find((type) => type.type === blockType);
    const schema = (descriptor?.schema ?? null) as Record<string, unknown> | null;
    const specificConfiguration = this.buildObjectFromSchema(schema, schema);
    const io = this.defaultIOForBlockType(String(blockType));

    const block: FlowBlock = {
      id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`,
      sink: String(blockType) === 'HumanInteractionBlock',
      name: String(blockType),
      position: undefined,
      inputs: io.inputs,
      outputs: io.outputs,
      specificConfiguration: this.ensureBlockName(specificConfiguration, String(blockType)),
      typeName: String(blockType)
    };

    return of({
      ...block,
      __needsServerCreate: true
    } as FlowBlock);
  }

  updateBlock(blockId: string, configuration: any) {
    return this.blocksCallService.updateBlock(blockId, configuration).pipe(
      catchError((err) => {
        console.error('Update block failed', err);
        return throwError(() => err);
      })
    );
  }

  private ensureBlockName(configuration: Record<string, unknown>, blockType: string) {
    const next = { ...configuration };
    if (typeof next['name'] !== 'string' || next['name'].length === 0) {
      next['name'] = blockType;
    }
    return next;
  }

  private defaultIOForBlockType(typeName: string) {
    void typeName;
    return {
      inputs: [],
      outputs: []
    };
  }

  private buildObjectFromSchema(
    node: Record<string, unknown> | null,
    root: Record<string, unknown> | null
  ): Record<string, unknown> {
    if (!node || !root) return {};
    const resolved = this.resolveRef(node, root);
    const properties = this.toRecord(resolved['properties']);
    const result: Record<string, unknown> = {};

    for (const [key, propSchema] of Object.entries(properties)) {
      result[key] = this.buildValueFromSchema(this.toRecord(propSchema), root);
    }

    return result;
  }

  private buildValueFromSchema(node: Record<string, unknown>, root: Record<string, unknown>): unknown {
    const resolved = this.resolveRef(node, root);

    if (Object.prototype.hasOwnProperty.call(resolved, 'default')) {
      return resolved['default'];
    }

    const enumValues = resolved['enum'];
    if (Array.isArray(enumValues) && enumValues.length > 0) {
      return enumValues[0];
    }

    const type = resolved['type'];
    if (type === 'string') return '';
    if (type === 'boolean') return false;
    if (type === 'number' || type === 'integer') return 0;
    if (type === 'array') return [];
    if (type === 'object' || Object.prototype.hasOwnProperty.call(resolved, 'properties')) {
      return this.buildObjectFromSchema(resolved, root);
    }

    return null;
  }

  private resolveRef(node: Record<string, unknown>, root: Record<string, unknown>): Record<string, unknown> {
    const ref = node['$ref'];
    if (typeof ref !== 'string' || !ref.startsWith('#/')) {
      return node;
    }

    const segments = ref.slice(2).split('/');
    let current: unknown = root;

    for (const segment of segments) {
      const asRecord = this.toRecord(current);
      current = asRecord[segment];
      if (current == null) {
        return node;
      }
    }

    return this.toRecord(current);
  }

  private toRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }
}
