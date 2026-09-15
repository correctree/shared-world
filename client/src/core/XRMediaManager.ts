import type { XRMediaObject } from "./XRMediaObject";

export class XRMediaManager {
  private readonly objects = new Map<string, XRMediaObject>();
  private activeId: string | null = null;

  register(object: XRMediaObject): XRMediaObject {
    this.objects.set(object.id, object);
    this.activeId = object.id;
    return object;
  }

  unregister(id: string): void {
    this.objects.delete(id);
    if (this.activeId === id) this.activeId = null;
  }

  get(id: string): XRMediaObject | undefined {
    return this.objects.get(id);
  }

  getActive(): XRMediaObject | null {
    return this.activeId ? this.objects.get(this.activeId) ?? null : null;
  }

  setActive(id: string | null): void {
    this.activeId = id && this.objects.has(id) ? id : null;
  }

  list(): XRMediaObject[] {
    return [...this.objects.values()];
  }

  clearRegistry(): void {
    this.objects.clear();
    this.activeId = null;
  }
}
