/**
 * PuzzleRegistry - where puzzle modules sign in (D5).
 *
 * Fail-loud like the content validators: double registration and unknown
 * lookups are programming errors, not things to paper over.
 */
import type { PuzzleModule } from './puzzleModule';

export class PuzzleRegistry {
  private readonly modules = new Map<string, PuzzleModule>();

  register(module: PuzzleModule): void {
    if (this.modules.has(module.id)) {
      throw new Error(`PuzzleRegistry: duplicate module id "${module.id}"`);
    }
    this.modules.set(module.id, module);
  }

  get(id: string): PuzzleModule {
    const module = this.modules.get(id);
    if (!module) {
      throw new Error(`PuzzleRegistry: no module registered for id "${id}"`);
    }
    return module;
  }

  has(id: string): boolean {
    return this.modules.has(id);
  }

  ids(): readonly string[] {
    return [...this.modules.keys()];
  }
}
