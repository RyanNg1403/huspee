import { Injectable } from '@nestjs/common';

export interface VoiceCatalog {
  list(): Promise<string[]>;
}
const FALLBACK_VOICES = [
  'juniper',
  'maple',
  'spruce',
  'ember',
  'vale',
  'breeze',
  'arbor',
  'sol',
  'cove',
  'aube',
  'bubbie',
  'haetsal',
  'hanul',
  'himari',
  'leher',
  'miko',
  'neer',
  'porto',
  'rindo',
  'rio',
  'rivage',
  'selva',
  'sonna',
  'tinta',
  'viola',
];

@Injectable()
export class VoiceCatalogRegistry {
  private catalog?: VoiceCatalog;
  register(catalog: VoiceCatalog): void {
    this.catalog = catalog;
  }
  async list(): Promise<string[]> {
    if (this.catalog) {
      try {
        const voices = await this.catalog.list();
        if (voices.length) return voices;
      } catch {
        /* Use the known runtime fallback when unavailable. */
      }
    }
    return [...FALLBACK_VOICES];
  }
}
