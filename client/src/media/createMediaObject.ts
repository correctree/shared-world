import type * as pc from "playcanvas";
import {
  createDefaultTransform,
  type XRMediaObject,
  type XRMediaType,
  type XRPlaybackController
} from "../core/XRMediaObject";

let sequence = 0;

export function createMediaObject(options: {
  title: string;
  type: XRMediaType;
  entity: pc.Entity | null;
  playback?: XRPlaybackController;
  playable?: boolean;
  animated?: boolean;
  spatial?: boolean;
  live?: boolean;
  source?: unknown;
}): XRMediaObject {
  sequence += 1;
  return {
    id: `media-${Date.now()}-${sequence}`,
    title: options.title,
    type: options.type,
    entity: options.entity,
    transform: createDefaultTransform(),
    capabilities: {
      playable: options.playable,
      animated: options.animated,
      spatial: options.spatial ?? true,
      live: options.live
    },
    playback: options.playback,
    source: options.source,
    behavior: []
  };
}
