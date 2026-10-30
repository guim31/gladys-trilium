// -----------------------------------------------------------------------------
// Scene actions (manifest `scene_actions`): add a timed line to the day note
// of Trilium — a journal of the house written by Gladys (the boiler started,
// the alarm was set, the garden was watered) — or create a note under a
// chosen note: a report, a to-do dictated to a voice scene.
// -----------------------------------------------------------------------------

export const SCENE_ACTIONS = {
  async append_day_note(hub, { fields = {} }) {
    return hub.appendToDayNote({ line: fields.line, addTime: fields.add_time });
  },
  async create_note(hub, { fields = {} }) {
    return hub.createNote({
      parent: fields.parent,
      title: fields.title,
      content: fields.content,
      labels: fields.labels,
    });
  },
};
