// The player's journal: developed polaroids + notes they've read + the trail of
// objectives. It is progress feedback that fits the "camera as a lens of
// discovery" fantasy — with NO health bar. Auto-persisted to localStorage under
// its own keys so photos/notes survive a tab close even between checkpoints;
// cleared on New Game.
//
// Photos are the 768x608 JPEG frames main.js already produces (~50-120 KB each
// as data URLs — big enough for the lightbox to enlarge + zoom); capped so the
// whole album stays well inside localStorage.
//
// Persistence is SPLIT across two keys and DEFERRED off the render frame:
//   • photos live under PHOTOS_KEY (the big base64 album)
//   • notes + objectives live under META_KEY (tiny)
// so a note/objective change never re-serializes the multi-MB photo album, and
// taking a photo never stalls the frame — writes are coalesced and flushed in a
// requestIdleCallback (or setTimeout(0) fallback). flush() forces a synchronous
// write for tab-close/hide. The OLD combined key is read on load() for players
// who saved before the split, then migrated forward on the next flush.

const OLD_KEY = 'inalco.journal';          // legacy combined {photos,notes,objectives}
const PHOTOS_KEY = 'inalco.journal.photos'; // photos array
const META_KEY = 'inalco.journal.meta';     // { notes, objectives }
const PHOTO_CAP = 24;

const state = {
  photos: [],       // { dataUrl, caption, kind }
  notes: [],        // { kind, title, body }
  objectives: [],   // { main, sub }
};

// --- deferred-write bookkeeping ---
let dirtyPhotos = false;   // photos need writing
let dirtyMeta = false;     // notes/objectives need writing
let hasOldKey = false;     // a legacy combined key is still present → remove after migration
let scheduled = null;      // pending idle/timeout handle (null = nothing scheduled)

const hasRIC = typeof requestIdleCallback === 'function';

function cancelScheduled() {
  if (scheduled === null) return;
  if (hasRIC) cancelIdleCallback(scheduled); else clearTimeout(scheduled);
  scheduled = null;
}

// Coalesce: only ever one pending flush. Many addObjective/addNote/addPhoto
// calls within an idle window collapse to a single write.
function schedule() {
  if (scheduled !== null) return;
  const run = () => { scheduled = null; flushNow(); };
  scheduled = hasRIC ? requestIdleCallback(run, { timeout: 1000 }) : setTimeout(run, 0);
}

function writePhotos() {
  try {
    localStorage.setItem(PHOTOS_KEY, JSON.stringify(state.photos));
    dirtyPhotos = false;
  } catch (e) {
    // over quota: drop the oldest photo and retry once (same policy as before)
    if (state.photos.length) {
      state.photos.shift();
      try { localStorage.setItem(PHOTOS_KEY, JSON.stringify(state.photos)); dirtyPhotos = false; }
      catch (e2) { /* still over quota — give up this pass */ }
    }
  }
}

function writeMeta() {
  try {
    localStorage.setItem(META_KEY, JSON.stringify({ notes: state.notes, objectives: state.objectives }));
    dirtyMeta = false;
  } catch (e) { /* meta is tiny; ignore */ }
}

// Write whatever is dirty, right now. Same bytes as an immediate write would
// have produced — only the timing has moved off the frame.
function flushNow() {
  cancelScheduled();
  if (dirtyPhotos) writePhotos();
  if (dirtyMeta) writeMeta();
  // once the new keys reflect current state, retire the legacy combined key
  if (hasOldKey && !dirtyPhotos && !dirtyMeta) {
    try { localStorage.removeItem(OLD_KEY); } catch (e) { /* ignore */ }
    hasOldKey = false;
  }
}

export const journal = {
  get photos() { return state.photos; },
  get notes() { return state.notes; },
  get objectives() { return state.objectives; },

  addPhoto(photo) {
    if (!photo || !photo.dataUrl) return;
    state.photos.push({ dataUrl: photo.dataUrl, caption: photo.caption || '', kind: photo.kind || null });
    if (state.photos.length > PHOTO_CAP) state.photos.shift();   // keep the most recent
    dirtyPhotos = true;
    schedule();
  },

  addNote(note) {
    if (!note || !note.title) return;
    if (state.notes.some((n) => n.title === note.title)) return;  // dedupe
    state.notes.push({ kind: note.kind || '', title: note.title, body: note.body || '' });
    dirtyMeta = true;
    schedule();
  },

  addObjective(main, sub) {
    if (!main) return;
    const last = state.objectives[state.objectives.length - 1];
    if (last && last.main === main && last.sub === sub) return;   // dedupe consecutive
    state.objectives.push({ main, sub: sub || '' });
    dirtyMeta = true;
    schedule();
  },

  count() { return { photos: state.photos.length, notes: state.notes.length }; },

  // --- persistence (its own keys, independent of the checkpoint) ---

  // Force any pending write to disk immediately. Call on visibilitychange/
  // beforeunload so nothing is lost on tab close/hide.
  flush() { flushNow(); },

  load() {
    try {
      const rawPhotos = localStorage.getItem(PHOTOS_KEY);
      const rawMeta = localStorage.getItem(META_KEY);
      if (rawPhotos !== null || rawMeta !== null) {
        // new split format present — read each part independently
        if (rawPhotos !== null) {
          const p = JSON.parse(rawPhotos);
          state.photos = Array.isArray(p) ? p : [];
        } else state.photos = [];
        if (rawMeta !== null) {
          const m = JSON.parse(rawMeta) || {};
          state.notes = Array.isArray(m.notes) ? m.notes : [];
          state.objectives = Array.isArray(m.objectives) ? m.objectives : [];
        } else { state.notes = []; state.objectives = []; }
        return;
      }
      // fall back to the OLD combined key (players who saved before the split)
      const raw = localStorage.getItem(OLD_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      state.photos = Array.isArray(d.photos) ? d.photos : [];
      state.notes = Array.isArray(d.notes) ? d.notes : [];
      state.objectives = Array.isArray(d.objectives) ? d.objectives : [];
      // migrate forward: mark both parts dirty and schedule a write to the new
      // keys; the legacy key is removed once that write lands.
      dirtyPhotos = true; dirtyMeta = true; hasOldKey = true;
      schedule();
    } catch (e) { /* corrupt — start empty */ }
  },

  clear() {
    state.photos = []; state.notes = []; state.objectives = [];
    dirtyPhotos = false; dirtyMeta = false; hasOldKey = false;
    cancelScheduled();
    try {
      localStorage.removeItem(PHOTOS_KEY);
      localStorage.removeItem(META_KEY);
      localStorage.removeItem(OLD_KEY);
    } catch (e) { /* ignore */ }
  },
};
