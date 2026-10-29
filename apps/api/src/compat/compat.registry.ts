import { Inject, Injectable } from '@nestjs/common';
import { CompatOperation, CompatOperationProvider } from './compat.types';

export const COMPAT_PROVIDERS = Symbol('COMPAT_PROVIDERS');

@Injectable()
export class CompatRegistry {
  private readonly byPath = new Map<string, CompatOperation>();

  constructor(@Inject(COMPAT_PROVIDERS) providers: CompatOperationProvider[]) {
    for (const provider of providers) {
      for (const operation of provider.operations()) {
        if (this.byPath.has(operation.path)) throw new Error(`Duplicate compat operation ${operation.path}`);
        this.byPath.set(operation.path, operation);
      }
    }
  }

  get(path: string): CompatOperation | undefined {
    return this.byPath.get(path);
  }

  list(): CompatOperation[] {
    return [...this.byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
  }
}
