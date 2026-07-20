// The player's journal: developed polaroids + notes they've read + the trail of
// objectives. It is progress feedback that fits the "camera as a lens of
// discovery" fantasy — with NO health bar. Auto-persisted to localStorage under
// its own key so photos/notes survive a tab close even between checkpoints;
// cleared on New Game.
//
// Photos are the 240x190 JPEG thumbnails main.js already produces (~10-20 KB
// each as data URLs); capped so the whole album stays well inside localStorage.

const KEY = 'inalco.journal';
const PHOTO_CAP = 24;

const state = {
  photos: [],       // { dataUrl, caption, kind }
  notes: [],        // { kind, title, body }
  objectives: [],   // { main, sub }
};

let dirty = false;

export const journal = {
  get photos() { return state.photos; },
  get notes() { return state.notes; },
  get objectives() { return state.objectives; },

  addPhoto(photo) {
    if (!photo || !photo.dataUrl) return;
    state.photos.push({ dataUrl: photo.dataUrl, caption: photo.caption || '', kind: photo.kind || null });
    if (state.photos.length > PHOTO_CAP) state.photos.shift();   // keep the most recent
    this.save();
  },

  addNote(note) {
    if (!note || !note.title) return;
    if (state.notes.some((n) => n.title === note.title)) return;  // dedupe
    state.notes.push({ kind: note.kind || '', title: note.title, body: note.body || '' });
    this.save();
  },

  addObjective(main, sub) {
    if (!main) return;
    const last = state.objectives[state.objectives.length - 1];
    if (last && last.main === main && last.sub === sub) return;   // dedupe consecutive
    state.objectives.push({ main, sub: sub || '' });
    this.save();
  },

  count() { return { photos: state.photos.length, notes: state.notes.length }; },

  // --- persistence (its own key, independent of the checkpoint) ---
  save() {
    dirty = true;
    try { localStorage.setItem(KEY, JSON.stringify(state)); dirty = false; }
    catch (e) {
      // over quota: drop the oldest photo and retry once
      if (state.photos.length) { state.photos.shift(); try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e2) {} }
    }
  },
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      state.photos = Array.isArray(d.photos) ? d.photos : [];
      state.notes = Array.isArray(d.notes) ? d.notes : [];
      state.objectives = Array.isArray(d.objectives) ? d.objectives : [];
    } catch (e) { /* corrupt — start empty */ }
  },
  clear() {
    state.photos = []; state.notes = []; state.objectives = [];
    try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  },
};
