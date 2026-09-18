# Prototype 0.14.7.5 — Shared Media Delete Lifecycle Fix

Server-side DELETE now triggers a unified client cleanup by mediaId:
runtime disposal -> Entity destruction -> XRMedia registry cleanup ->
managedPlacedMedia/sharedRemoteMediaIds cleanup -> UI refresh.

It also invalidates in-flight asset reconstruction first, preventing a slow
Sprite/GLB/WebM load from resurrecting after DELETE.

Preserved: 0.14.7.4.2 Sprite initialization fix, Authoritative World Recovery,
GLB/WebM loaders, iOS WebM alpha fallback, clientId/session recovery.

Test:
1. Sprite PLACE -> iPhone visible + animated.
2. Sprite DELETE -> iPhone disappears.
3. Sprite re-PLACE -> appears again without reload.
4. Repeat PLACE/DELETE for GLB and WebM.
5. Place all three, reload iPhone -> current World reconstructs.
6. Reload iPhone 3 times -> avatars do not accumulate.

Do not Release until all pass.
