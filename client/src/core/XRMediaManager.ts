import type { XRMediaObject } from "./XRMediaObject";

export class XRMediaManager {
  private readonly objects = new Map<string, XRMediaObject>();
  private activeId: string | null = null;
  private readonly proximityState = new Map<string, boolean>();

  register(object: XRMediaObject): XRMediaObject {
    this.objects.set(object.id, object);
    this.clearProximityStateForObject(object.id);
    this.activeId = object.id;
    return object;
  }

  unregister(id: string): void {
    this.objects.delete(id);
    this.clearProximityStateForObject(id);
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

  private clearProximityStateForObject(id: string): void {
  for (const key of this.proximityState.keys()) {
    if (key.startsWith(`${id}:`)) {
      this.proximityState.delete(key);
    }
  }
}
  
 updateUserProximity(userPosition: { x: number; y: number; z: number }): void {
  for (const object of this.objects.values()) {
    const behaviors = object.behavior ?? [];

    for (const behavior of behaviors) {
      if (!behavior.enabled || behavior.trigger !== "user-proximity") continue;
      const entity = object.entity;
if (!entity) continue;

const objectPosition = entity.getPosition();

const dx = objectPosition.x - userPosition.x;
const dy = objectPosition.y - userPosition.y;
const dz = objectPosition.z - userPosition.z;

const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
const isInside = distance <= behavior.distance;
const stateKey = `${object.id}:${behavior.id}`;
const wasInside = this.proximityState.get(stateKey) ?? false;

if (isInside !== wasInside) {
  this.proximityState.set(stateKey, isInside);

  const action = isInside
    ? behavior.enterAction
    : behavior.leaveAction;

console.log("[XR PROXIMITY]", {
  object: object.title,
  distance,
  threshold: behavior.distance,
  wasInside,
  isInside,
  action
});
  
  if (action === "play") {
    void object.playback?.play();
  } else if (action === "stop") {
    object.playback?.stop();
  }
}
    }
  }
}
  
  clearRegistry(): void {
    this.objects.clear();
    this.proximityState.clear();
    this.activeId = null;
  }
}
