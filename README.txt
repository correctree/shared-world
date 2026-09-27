Shared World Prototype 0.24.2 - ROOM SHARE LINKS

CHANGES FROM 0.21.2.1
- Replaces strict artwork-ID matching with original asset-filename matching.
- Supports rooms whose artwork IDs were rewritten to import-* by an older WORLD ZIP import.
- Still requires the ZIP roomCode to match the current ROOM code.
- Writes only files referenced by the package and reloads only current ROOM objects
  whose assetRef/fallbackRef filename exists in that package.

CHANGES FROM 0.21.2
- Adds REHYDRATE MISSING ASSETS beside the existing WORLD ZIP controls.
- Uses a previously exported WORLD + ASSETS ZIP to restore missing binary files.
- Restores each file under its original /assets filename on the Persistent Disk.
- Requires every packaged artwork ID to exist in the current ROOM before writing.
- Does not call world:import and therefore creates zero duplicate objects.
- Keeps current transforms, GROUP/TAG, behavior, SCENES, CUES and permissions unchanged.
- Checks whether each asset already exists and uploads only HTTP 404 files.
- Verifies every restored file with a fresh HTTP GET before reloading the artwork.
- Rebuilds the existing artwork runtimes from the authoritative ROOM snapshot.

RECOVER ASSETS LOST BEFORE THE PERSISTENT DISK WAS ATTACHED
1. Enter the same ROOM code used by the exported package.
2. Open WORLD SETTINGS.
3. Press REHYDRATE MISSING ASSETS.
4. Select the original EXPORT WORLD + ASSETS ZIP.
5. Wait for:
   ASSETS RESTORED · N uploaded · N already present · 0 objects duplicated
6. Confirm Sprite / WebM / GLB / Audio objects appear at their existing positions.
7. Restart the Render service once more and confirm both ROOM and assets return.

Do not use IMPORT WORLD ZIP for this repair. That command remains an additive
world importer for bringing a separate world into the current room.

GOAL
- Restore the same ROOM after a Render restart or redeploy.
- Persist authoring state without sending large WORLD data through WebSocket.
- Preserve all 0.21.1.5.17 connection and payload protections.

FILES
- main.ts -> client/src/main.ts
- SharedWorldRoom.ts -> server/src/SharedWorldRoom.ts
- state.ts -> server/src/state.ts
- persistence.ts -> server/src/persistence.ts

PERSISTED PER ROOM CODE
- World environment
- Sprite / WebM / GLB / Audio object definitions and transforms
- Visibility, GROUP / TAG and interactive behavior
- SCENES and CUES
- Stable Room Owner client ID and Director grants

NOT PERSISTED
- Connected players, positions, chat, voice sessions and transient animation playback
- Legacy session-only permissions (a browser without a stable client ID cannot own a restarted ROOM)

SAFETY
- 250 ms debounced autosave after each durable authoring mutation
- Atomic temporary-file rename
- Three validated generations retained as *.json, *.previous.json and *.stable.json
- Automatic previous/stable recovery if a newer generation is invalid
- 2 MB snapshot ceiling and ROOM/item-count validation
- Large binary assets continue through HTTP /assets and never enter the WORLD JSON

RENDER REQUIRED SETTING
1. Open the existing Shared World Web Service in Render.
2. Add a Persistent Disk.
3. Set Mount Path to /var/data (1 GB is sufficient for the current prototype).
4. Add environment variable:
   SHARED_WORLD_DATA_DIR=/var/data
5. Save and redeploy.

Only files under the configured disk mount survive Render restarts/deploys.
If the current Render plan does not support Persistent Disks, upgrade the service
or use a managed database/object store before claiming restart persistence.

UI / LOG CONFIRMATION
- Green ROOM SAVED: disk is configured and at least one snapshot was written.
- Green PERSISTENCE READY: disk is configured; waiting for the first mutation.
- Amber DISK NOT CONFIGURED: local save works, but Render restart recovery is not guaranteed.
- Red SAVE FAILED: inspect Render Logs.

Expected Render Logs:
  [ROOM STORAGE] ... persistentConfigured: true
  [ROOM SAVED] ...
After a restart:
  [ROOM RESTORED] ...
If the main snapshot is invalid:
  [ROOM STORAGE RECOVERED LAST STABLE] ...
  [ROOM RESTORED LAST STABLE] ...

INSTALL
  cd /Users/masakikenichi/shared-world
  mkdir -p /tmp/shared-world-0212
  unzip -o ~/Downloads/prototype-0.21.2.2-asset-name-rehydration.zip -d /tmp/shared-world-0212
  cp -f /tmp/shared-world-0212/main.ts client/src/main.ts
  cp -f /tmp/shared-world-0212/SharedWorldRoom.ts server/src/SharedWorldRoom.ts
  cp -f /tmp/shared-world-0212/state.ts server/src/state.ts
  cp -f /tmp/shared-world-0212/persistence.ts server/src/persistence.ts
  npm install
  npm run build
  git diff --check
  git add client/src/main.ts server/src/SharedWorldRoom.ts server/src/state.ts server/src/persistence.ts
  git commit -m "Shared World 0.21.2.2 Asset Name Rehydration"
  git push

RESTART TEST
1. Confirm version 0.21.2 and green ROOM SAVED / PERSISTENCE READY.
2. Add or move one artwork; change environment; save one SCENE and one CUE.
3. Confirm [ROOM SAVED] in Render Logs.
4. Use Render Manual Deploy -> Restart service (do not delete the disk).
5. Re-enter the same ROOM code.
6. Confirm environment, artwork, GROUP/TAG, behavior, SCENE and CUE are restored.
7. Confirm Render Logs contain [ROOM RESTORED].
8. Re-test PC/iPhone synchronization, CUE FIRE and WORLD + ASSETS ZIP export.

VALIDATION PERFORMED
- Node 24 TypeScript strip/check: passed for main.ts, SharedWorldRoom.ts and persistence.ts.
- Persistence write/read round trip: passed.
- Corrupted-primary -> last-stable recovery: passed.
- Full npm dependency build could not run in the execution environment because
  registry.npmjs.org returned HTTP 403; run npm install and npm run build locally.
0.21.2.3 ASSET RELINK REHYDRATION

- Repairs legacy WORLD imports where both object IDs and asset filenames changed.
- Matches existing ROOM objects to the package by media type, normalized title,
  position and scale.
- Uploads only missing package assets, then changes only assetRef/fallbackRef on
  the existing authoritative objects.
- Keeps existing object IDs and transforms and adds zero duplicate objects.
- Aborts before writing if the media-type counts cannot be paired one-to-one.
0.22.0 ROOM SNAPSHOT V2

ROOT FIX
- RESTORE ROOM SNAPSHOT is authoritative replace, not additive import.
- Object IDs from the snapshot are preserved; no import-* IDs are generated.
- Every packaged asset is addressed by SHA-256 plus its validated extension.
- Server verifies that each hash-named upload matches its bytes.
- Server validates every referenced asset before changing live ROOM state.
- The proposed ROOM is written atomically to Persistent Disk before the live
  state is replaced. The previous primary snapshot becomes the stable backup.
- Existing v1 WORLD ZIP files are migrated to Snapshot V2 in the browser.
- MERGE WORLD ZIP remains separate for intentionally adding another world.

FILES TO REPLACE
- client/src/main.ts
- server/src/main.ts
- server/src/SharedWorldRoom.ts
- server/src/persistence.ts
- server/src/state.ts

FIRST RECOVERY OF ART001
1. Deploy 0.22.0 and confirm the version label.
2. Enter ART001 and open WORLD.
3. Choose RESTORE ROOM SNAPSHOT.
4. Select the original WORLD + ASSETS ZIP containing the intended 7 objects.
5. The current 8-object snapshot is rotated to the stable backup.
6. After validation, ART001 becomes the exact 7-object snapshot and reloads.
7. Restart the Render service and confirm the same ROOM returns.
0.22.0.1 LIVE RESTORE SYNC

- Removes the forced window.location.reload() after RESTORE ROOM SNAPSHOT.
- Preserves the current player login, ROOM connection and Colyseus session.
- Disposes the old rendered media locally and requests three authoritative
  snapshots while rebuilding the restored objects in place.
- Saves a fresh local ROOM backup after live synchronization completes.
- Server files remain compatible with 0.22.0; only client/src/main.ts changes.

0.22.1 ROOM AUTO SAVE HARDENING

- ROOM code remains the automatic persistence key; routine ZIP export is no longer
  required to preserve a ROOM across normal Render restarts and redeploys.
- Keeps three validated generations per ROOM: current, previous and stable.
- Loads current first, then automatically falls back to previous and stable.
- Validates snapshot size, ROOM code, collection limits and duplicate media IDs
  before a generation can be loaded or rotated.
- A temporary snapshot is read back before atomic rename.
- Durable authoring mutations still use the existing 250 ms debounced autosave.
- A 60-second dirty checkpoint catches any pending durable mutation and reports
  storage health to connected browsers even while a ROOM is idle.
- The header now shows SAVING, ROOM SAVED, ROOM RECOVERED, SAVE FAILED or
  DISK NOT CONFIGURED, with revision, timestamp and recovery source in its tooltip.
- EXPORT ROOM SNAPSHOT V2 remains available only as an off-platform disaster
  backup for disk deletion, detachment or account/service loss.

FILES TO REPLACE
- client/src/main.ts
- server/src/main.ts
- server/src/SharedWorldRoom.ts
- server/src/persistence.ts
- server/src/state.ts (unchanged but included for a complete replacement set)

RENDER VERIFICATION
1. Deploy and confirm version 0.22.1 and green ROOM SAVED / PERSISTENCE READY.
2. Enter ART001 and confirm the seven works appear.
3. Move one work, wait for ROOM SAVED, then restart the service without deleting the disk.
4. Re-enter ART001 and confirm the change remains.
5. Render Logs should show [ROOM RESTORED] with source: current.
6. If current JSON is ever invalid, the server tries previous and then stable and
   logs [ROOM RESTORED RECOVERY GENERATION].

0.22.1.1 ROOM ENTRY STABILITY

- Keeps the ROOM code, name and login screen intact during temporary entry failures.
- Retries ROOM entry up to five times with 0, 1.5, 3, 6 and 10 second delays.
- Gives each attempt a 15 second ceiling so a stalled cold-start connection does
  not leave the ENTER button locked forever.
- Shows the current attempt and the next retry countdown in the lobby.
- Prevents a late response from a timed-out attempt from becoming a second ROOM
  session; late sessions are explicitly left.
- Cancels all pending entry attempts when the browser page is closed.
- Colyseus 0.18 continues to own transient reconnection after entry succeeds.
- Server persistence files remain compatible with 0.22.1; only client/src/main.ts
  changes in this patch. The complete ZIP still includes all five replacement files.

ENTRY TEST
1. Deploy and confirm version 0.22.1.1.
2. Restart the Render service, then immediately try to enter ART001.
3. Confirm CONNECTING 1/5 and retry countdowns appear while Render starts.
4. Confirm entry succeeds without repeatedly pressing ENTER.
5. Confirm seven artworks and the latest saved positions are restored.

0.22.2 ROOM RECOVERY CONTROLS

- Adds SAVE ROOM NOW to WORLD SETTINGS for an immediate owner-authorized save.
- Shows the current revision, saved time and available previous revision.
- Adds owner-authorized RESTORE PREVIOUS with a confirmation dialog.
- Reads the target generation before writing, then atomically promotes it to
  current. The pre-restore current is rotated into previous, making the action
  reversible by selecting RESTORE PREVIOUS again.
- Rebuilds artworks from the authoritative ROOM state without page reload,
  logout or Colyseus session replacement.
- Broadcasts environment, SCENES, CUES, permissions and persistence state after
  recovery so connected PC and mobile clients converge on the same version.
- Keeps the 0.22.1 three-generation disk format and 0.22.1.1 entry retry logic.

RECOVERY TEST
1. Deploy and confirm version 0.22.2, then enter ART001.
2. Confirm seven artworks and REVISION / PREVIOUS information in WORLD SETTINGS.
3. Press SAVE ROOM NOW and confirm SAVED NOW.
4. Move one artwork and wait for ROOM SAVED.
5. Press RESTORE PREVIOUS and accept the confirmation.
6. Confirm the earlier position returns without logout or page reload.
7. Restart Render and confirm the restored generation remains active.

0.22.2.1 MANUAL CHECKPOINT FIX

ROOT CAUSE
- The 0.22.2 RESTORE PREVIOUS target was a rolling generation. Frequent 250 ms
  autosaves during artwork movement could advance previous close to the latest
  position, making a successful restore appear to do nothing.

FIX
- SAVE ROOM NOW now writes a dedicated ROOM checkpoint file after the current
  generation is saved successfully.
- Autosave, checkpoints and rolling current/previous/stable generations are
  independent; autosave never overwrites the named checkpoint.
- RESTORE CHECKPOINT always returns to the last explicit SAVE ROOM NOW state.
- The pre-restore current automatically rotates into previous.
- UNDO LAST RESTORE promotes that previous generation, allowing the checkpoint
  restoration to be reversed.
- Checkpoint availability and revision are shown in WORLD SETTINGS.

CHECKPOINT TEST
1. Deploy and confirm version 0.22.2.1, then enter ART001.
2. Press SAVE ROOM NOW and confirm CHECKPOINT R<number> is shown.
3. Move one artwork clearly to another position and wait for ROOM SAVED.
4. Press RESTORE CHECKPOINT and confirm the exact saved position returns.
5. Press UNDO LAST RESTORE and confirm the moved position returns.

0.22.2.2 RESTORE DUPLICATE GUARD

ROOT CAUSE
- Checkpoint/undo restoration already changes the authoritative Colyseus map.
- The initiating browser also performed a second explicit full local delete and
  rebuild while asynchronous artwork loaders and state callbacks were active.
- Those overlapping reconstruction paths could leave two render entities for
  one logical artwork even though the saved ROOM JSON rejects duplicate IDs.

FIX
- Removes the second client-side full delete/rebuild from checkpoint and undo.
- Uses the authoritative Colyseus state patch as the primary restoration path.
- Keeps three delayed media snapshots as one idempotent reconciliation path for
  missed mobile ADD / REMOVE / UPDATE callbacks.
- Does not change checkpoint files, ROOM persistence or server behavior.

DUPLICATE TEST
1. Deploy and confirm version 0.22.2.2; a page reload clears the old duplicate render.
2. Enter ART001 and confirm the authoritative artwork count is seven.
3. SAVE ROOM NOW, move one artwork, wait for ROOM SAVED, then RESTORE CHECKPOINT.
4. Confirm the saved position returns and the artwork count remains seven.
5. Press UNDO LAST RESTORE and confirm the moved position returns with seven artworks.

0.23.0 ROOM MANAGEMENT

- Adds an owner-scoped MY ROOMS catalog to the lobby.
- Lists ROOM code, last-saved time, revision, artwork count and checkpoint revision.
- Click selects a ROOM; double-click enters it.
- CREATE writes a new empty persistent ROOM and checkpoint before entry.
- CLONE SELECTED creates a new ROOM snapshot from the selected owned ROOM.
- Content-addressed assets are referenced rather than copied, so cloning does
  not duplicate GLB, Sprite, WebM or Audio bytes on the Persistent Disk.
- Catalog responses include only snapshots whose persisted owner client ID
  matches the browser's stable client ID.
- Create and clone validate ROOM codes, reject existing targets and never
  overwrite an existing ROOM.
- ROOM deletion is intentionally excluded from this version.
- Keeps checkpoint recovery, duplicate guard and entry retry behavior.

SECURITY SCOPE
- Owner filtering uses the prototype's stable browser client ID. It prevents
  ordinary cross-browser catalog discovery but is not account authentication.
  Production multi-user administration should use signed-in user identities.

ROOM MANAGEMENT TEST
1. Deploy and confirm version 0.23.0.
2. Confirm ART001 appears in MY ROOMS with seven works.
3. Enter NEW ROOM CODE TEST001 and press CREATE; confirm it appears with zero works.
4. Select ART001, enter ART001COPY as clone target and press CLONE SELECTED.
5. Enter ART001COPY and confirm the same seven works appear.
6. Move one copied artwork and confirm ART001 remains unchanged.

0.23.0.1 ROOM API REACHABILITY

OBSERVED
- The 0.23.0 client and server both deployed successfully, but MY ROOMS showed
  ROOM LIST FAILED / Failed to fetch after Render was already live.

FIX
- Normalizes a configured ws:// or wss:// Colyseus endpoint to http:// or
  https:// before using it with browser fetch().
- Moves the prototype stable client ID from a custom request header to an
  encoded query parameter for ROOM catalog requests.
- This keeps GET/POST requests CORS-simple and avoids the custom-header OPTIONS
  preflight that failed on the deployed route.
- The server accepts both query and legacy header identity during migration.
- No ROOM snapshots, checkpoints, artwork assets or ownership values change.

REACHABILITY TEST
1. Deploy and confirm version 0.23.0.1 and server log ROOM API REACHABILITY ready.
2. Reload the page and confirm ART001 appears in MY ROOMS.
3. If Render is waking, wait for ROOM entry readiness and press REFRESH once.
4. Continue the 0.23.0 CREATE and CLONE SELECTED tests.

0.23.1 ROOM CREATE / CLONE STABILITY

- CREATE and CLONE now complete current, previous, stable and checkpoint files
  as one verified provisioning operation.
- A failed write or read-back removes only the incomplete new target ROOM, so
  the same ROOM code can be retried safely.
- Server responses report verified state and persisted artwork count.
- The client checks the saved ROOM against a fresh owner catalog response up
  to three times before reporting success.
- CREATE success reports zero works; CLONE success reports the copied count.
- Existing ROOMs, assets and checkpoints are not migrated or rewritten.

CREATE / CLONE STABILITY TEST
1. Deploy and confirm version 0.23.1.
2. Enter TEST001 in NEW ROOM CODE and press CREATE.
3. Confirm TEST001 appears as 0 works and its status ends in verified.
4. Select ART001, enter ART001COPY in CLONE TARGET CODE and press CLONE SELECTED.
5. Confirm ART001COPY appears as 7 works and its status ends in verified.
6. Enter ART001COPY and confirm seven works appear.
7. Move one copied work, wait for ROOM SAVED, then return to ART001 and confirm
   its original arrangement is unchanged.
8. Redeploy or restart the Render service; confirm TEST001 and ART001COPY remain
   in MY ROOMS with their saved counts.

0.23.1.1 ROOM CODE INPUT FIX

OBSERVED
- The global lobby button width compressed both ROOM-code inputs to roughly
  30 pixels, making CREATE and CLONE target codes impossible to enter.

FIX
- Uses an explicit two-column grid for both ROOM management action rows.
- Reserves 134 pixels for each action button and gives all remaining width to
  the editable ROOM-code input.
- Adds explicit input width, box sizing, accessible labels and autocomplete-off.
- Pressing Enter in either field now runs its matching CREATE or CLONE action.
- No server, snapshot, checkpoint, ownership or artwork data changes.

INPUT TEST
1. Deploy and confirm version 0.23.1.1 after entering a ROOM.
2. Confirm NEW ROOM CODE and CLONE TARGET CODE are both visibly editable.
3. Enter TEST001 and press CREATE; confirm 0 works and verified.
4. Select ART001, enter ART001COPY and press CLONE SELECTED; confirm 7 works
   and verified.

0.23.2 ROOM RENAME / ARCHIVE

- Adds owner-only ROOM-code rename across current, previous, stable and
  checkpoint generations.
- Writes and verifies the complete renamed target before removing the old
  generation files. An interruption may leave a recoverable duplicate but
  cannot remove the only valid copy.
- Rename rejects an existing target code and never overwrites another ROOM.
- Adds non-destructive ARCHIVE. Archived ROOM data, artwork references and all
  generations remain on Persistent Disk but are hidden from the normal list.
- SHOW ARCHIVED reveals archived entries; selecting one changes ARCHIVE to
  RESTORE.
- RESTORE returns the ROOM to the normal MY ROOMS list.
- ROOM deletion remains intentionally unavailable.

RENAME / ARCHIVE TEST
1. Deploy and confirm version 0.23.2 after entering a ROOM.
2. Select TEST001, enter TESTROOM in RENAME TO CODE and press RENAME.
3. Confirm TESTROOM appears and TEST001 no longer appears.
4. Select TESTROOM and press ARCHIVE; confirm it disappears without deletion.
5. Enable SHOW ARCHIVED, select TESTROOM · ARCHIVED and press RESTORE.
6. Disable SHOW ARCHIVED and confirm TESTROOM appears normally.
7. Reload the page and repeat the list check to confirm persistence.

0.23.3 ROOM MANAGEMENT UI

- Adds a persistent selected-ROOM summary with code, artwork count, revision
  and archived state.
- Highlights the selected ROOM with a cyan border and selection bar.
- Expands the ROOM list viewport and preserves selection after refresh.
- Groups CREATE/CLONE and RENAME/ARCHIVE controls into compact disclosure
  panels so the catalog remains readable as ROOM count grows.
- Displays active and archived counts when SHOW ARCHIVED is enabled.
- Adds confirmation dialogs before RENAME, ARCHIVE and RESTORE operations.
- Keeps deletion unavailable and does not change ROOM snapshots, checkpoints,
  ownership or asset files.

ROOM MANAGEMENT UI TEST
1. Deploy and confirm MY ROOMS shows version 0.23.3.
2. Select ART001COPY and confirm the selected summary shows 7 works and its
   revision; confirm the selected list row has a cyan highlight.
3. Open NEW ROOM / COPY and confirm both input actions remain usable.
4. Open MANAGE SELECTED ROOM, press ARCHIVE and cancel the confirmation; verify
   no ROOM state changes.
5. Press ARCHIVE again and confirm; then SHOW ARCHIVED and RESTORE it.
6. Refresh and confirm the same ROOM remains selected whenever it is visible.

0.24.0 ROOM ACCESS FOUNDATION

- Adds an explicit OWNER / EDITOR / VISITOR role foundation.
- Shows this browser's persistent prototype ACCESS ID with a copy action.
- ROOM owners can register up to 12 editor ACCESS IDs.
- EDITORs can use the existing environment authoring permissions while the
  owner identity and owner-only catalog operations remain unchanged.
- Adds SHARED · CODE ENTRY and OWNER + EDITORS ONLY entry modes.
- OWNER + EDITORS ONLY is enforced by the authoritative ROOM server before
  join; unlisted visitors cannot enter.
- Existing ROOMs default to SHARED mode with no editors, preserving current
  behavior without rewriting snapshots.
- Access policy is stored in the ROOM catalog sidecar on Persistent Disk and
  follows RENAME, ARCHIVE and RESTORE operations.
- This is a migration foundation, not account authentication. ACCESS IDs are
  browser-local and can change if browser site storage is cleared. A later
  signed-in identity provider can replace the subject without changing roles.

ACCESS FOUNDATION TEST
1. Deploy and confirm MY ROOMS shows version 0.24.0.
2. Open ROOM ACCESS and confirm COPY MY ID works.
3. Keep ART001 in SHARED · CODE ENTRY and press SAVE ACCESS.
4. Add a second browser/device ACCESS ID as an editor and save.
5. Re-enter ART001 from that browser/device and confirm EDITOR — EDITING
   ENABLED appears in the environment editor.
6. Set a disposable test ROOM to OWNER + EDITORS ONLY and confirm an unlisted
   browser cannot enter while owner and listed editor can enter.

0.24.1 ACCESS UX

- Shows OWNER, EDITOR or VISITOR persistently in the desktop workspace header.
- Adds the current role to the always-visible ROOM label after authorization.
- Keeps the existing authoritative 0.24.0 access rules and Persistent Disk
  format unchanged.
- Detects ROOM_ACCESS_DENIED as a final authorization result instead of retrying
  the same rejected entry five times.
- Replaces the generic connection failure with an actionable message explaining
  that the browser ACCESS ID must be registered by the ROOM owner.
- Other temporary network and Render wake-up failures retain the existing
  five-attempt retry sequence.

ACCESS UX TEST
1. Deploy and confirm MY ROOMS and the workspace header show version 0.24.1.
2. Enter TESTROOM from its owner browser and confirm OWNER is visible in the
   header and ROOM label.
3. Enter TESTROOM from the registered second browser and confirm EDITOR is
   visible in both locations and environment editing remains enabled.
4. Remove that second browser ACCESS ID from TESTROOM, save access, then try to
   enter again from the second browser.
5. Confirm entry stops immediately with the owner/editor-only explanation; it
   must not run the five temporary-connection retries.
6. Register the second browser again and confirm entry and EDITOR status return.

0.24.2 ROOM SHARE LINKS

- Adds COPY ROOM LINK to the owner-side ROOM ACCESS panel.
- The copied URL contains only the selected ROOM code as a `room` query
  parameter. It never contains an ACCESS ID or grants a role.
- Opening the link pre-fills the ROOM code and shows an invited-ROOM hint in
  the lobby; the visitor still presses ENTER WORLD deliberately.
- Existing SHARED or OWNER + EDITORS ONLY rules remain authoritative on the
  server. A copied URL cannot bypass ROOM access control.
- OWNER, EDITOR and VISITOR role display from 0.24.1 remains unchanged.
- Persistent ROOM snapshots, access sidecars and artwork assets are unchanged.

ROOM SHARE LINK TEST
1. Deploy and confirm MY ROOMS and the workspace header show version 0.24.2.
2. On the left owner browser, select TESTROOM and open ROOM ACCESS.
3. Press COPY ROOM LINK and paste the link into the right browser address bar.
4. Confirm TESTROOM is already filled in and INVITED ROOM TESTROOM is shown.
5. Press ENTER WORLD and confirm the registered browser enters as EDITOR.
6. Remove its editor registration temporarily and reopen the same link; confirm
   the link does not bypass the owner/editor-only rejection.
7. Register it again and confirm the same link enters as EDITOR.
