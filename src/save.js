// Game checkpoint persistence — "Continue where you left off".
//
// STORAGE CHOICE: localStorage. It survives a tab close (sessionStorage would
// not), is synchronous and trivially JSON-serializable, and our whole snapshot
// is a few KB — well under the ~5 MB budget. IndexedDB is only worth its async
// complexity for large binary blobs; we keep the photo album as capped, small
// thumbnails (journal.js) so everything fits comfortably here.
//
// This module is only the STORE. What goes into a snapshot is assembled in
// main.js from each system's serialize()/restore() (player, story, buildings,
// night, journal). Bumping VERSION invalidates old, incompatible saves.

const KEY = 'inalco.save';
export const SAVE_VERSION = 1;

export const save = {
  // Does a usable checkpoint exist?
  exists() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      return d && d.version === SAVE_VERSION;
    } catch (e) { return false; }
  },

  // Read the snapshot object (or null). Callers apply it via restore hooks.
  read() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const d = JSON.parse(raw);
      return d && d.version === SAVE_VERSION ? d : null;
    } catch (e) { return null; }
  },

  // Persist a snapshot. Stamps version. `snap` should already be plain JSON.
  write(snap) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ version: SAVE_VERSION, ...snap }));
      return true;
    } catch (e) { return false; }   // quota / private mode — fail soft
  },

  clear() {
    try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  },

  // A short human summary for the menu's Continue button.
  summary() {
    const d = this.read();
    if (!d) return null;
    return {
      objective: d.objective?.main || 'In progress',
      evidence: d.evidence ?? 0,
      when: d.savedAt || null,
    };
  },
};
