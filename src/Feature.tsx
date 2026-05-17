import { useEffect, useMemo } from "react";
import {
  createClockSync,
  useDraft,
  useEventLog,
  useFairRng,
  useMeshSlot,
  useNamedPeer,
  usePhase,
  useReactions,
  type MeshConfig,
  type YRoom,
} from "@baditaflorin/mesh-common";

type Props = { room: YRoom | null; config: MeshConfig };
type Take = { id: string; peerId: string; text: string; ts: number };
const SLOT_MS = 6_000;

export function Feature({ room, config }: Props) {
  if (!room) {
    return (
      <div className="blitz-screen">
        <h1>hot takes blitz</h1>
        <p>Connecting…</p>
      </div>
    );
  }
  return <Body room={room} config={config} />;
}

function Body({ room, config }: { room: YRoom; config: MeshConfig }) {
  const { name, setName } = useNamedPeer(config, room);
  const clock = useMemo(() => createClockSync(room.provider), [room]);
  useEffect(() => () => clock.destroy(), [clock]);
  const slot = useMeshSlot(clock, SLOT_MS);

  const fairRng = useFairRng(room, "blitz-salts");
  const takesLog = useEventLog<Take>(room, "takes");
  const reactions = useReactions(room, "take-reactions");
  const { phase, transition } = usePhase<"writing" | "streaming" | "done">(
    room,
    "phase",
    "writing",
  );

  const state = room.doc.getMap<number>("state");
  const baselineSlot = state.get("baselineSlot") ?? 0;
  const draft = useDraft<string>(`${config.storagePrefix}:draft`, "");
  const takes = takesLog.events;
  const shuffled = useMemo(
    () => fairRng.shuffle(takes.map((t) => t.id)),
    [fairRng.seed, takes.length],
  );

  let currentTake: Take | null = null;
  if (phase === "streaming" && takes.length > 0) {
    const i =
      (((slot.slotId - baselineSlot) % shuffled.length) + shuffled.length) % shuffled.length;
    currentTake = takes.find((t) => t.id === shuffled[i]) ?? null;
  }
  const trimmed = name.trim();

  const addTake = () => {
    const text = draft.value.trim();
    if (!text || !trimmed) return;
    takesLog.push({
      id: Math.random().toString(36).slice(2, 12),
      peerId: room.peerId,
      text,
      ts: Date.now(),
    });
    draft.setValue("");
  };

  const startBlitz = () => {
    if (takes.length === 0) return;
    room.doc.transact(() => {
      state.set("baselineSlot", slot.slotId);
      transition("streaming", { from: "writing" });
    });
  };

  const stopBlitz = () => transition("done");

  const counts = currentTake ? reactions.countsFor(currentTake.id) : {};
  const remaining = Math.ceil(slot.slotMsRemaining / 100) / 10;

  return (
    <div className="blitz-screen" data-phase={phase}>
      <header className="blitz-head">
        <h1>hot takes blitz</h1>
        <input
          className="blitz-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="your name"
          maxLength={32}
          aria-label="your name"
        />
        <p className="blitz-status">
          {room.peerCount + 1} peer(s) · {takes.length} take(s)
        </p>
      </header>

      {phase === "writing" && (
        <section className="blitz-write">
          <textarea
            className="blitz-draft"
            value={draft.value}
            onChange={(e) => draft.setValue(e.target.value)}
            placeholder="drop a hot take"
            maxLength={200}
            rows={3}
            disabled={!trimmed}
          />
          <div className="blitz-row">
            <button
              type="button"
              className="blitz-add"
              aria-label="add take"
              onClick={addTake}
              disabled={!trimmed || !draft.value.trim()}
            >
              add take
            </button>
            <button
              type="button"
              className="blitz-start"
              aria-label="start blitz"
              onClick={startBlitz}
              disabled={takes.length === 0}
            >
              start blitz
            </button>
          </div>
          <ul className="blitz-list">
            {takes.map((t) => (
              <li key={t.id}>{t.text}</li>
            ))}
          </ul>
        </section>
      )}

      {phase === "streaming" && currentTake && (
        <section className="blitz-stream">
          <div className="blitz-current">{currentTake.text}</div>
          <div className="blitz-bar" style={{ opacity: 0.4 + 0.6 * (1 - slot.progress) }}>
            next in {remaining.toFixed(1)}s
          </div>
          <div
            className="blitz-tally"
            data-rocket={counts.rocket ?? 0}
            data-think={counts.think ?? 0}
            data-trash={counts.trash ?? 0}
          >
            <span>🚀 {counts.rocket ?? 0}</span>
            <span>🤔 {counts.think ?? 0}</span>
            <span>🚮 {counts.trash ?? 0}</span>
          </div>
          <div className="blitz-react">
            {(
              [
                ["rocket", "🚀"],
                ["think", "🤔"],
                ["trash", "🚮"],
              ] as const
            ).map(([k, e]) => (
              <button
                key={k}
                type="button"
                className={`blitz-${k}`}
                aria-label={`react ${k}`}
                onClick={() => reactions.toggle(currentTake!.id, k)}
              >
                {e}
              </button>
            ))}
          </div>
          <button type="button" className="blitz-stop" onClick={stopBlitz}>
            end blitz
          </button>
        </section>
      )}

      {phase === "done" && (
        <section className="blitz-board">
          <h2>scoreboard</h2>
          <ol className="blitz-rank">
            {[...takes]
              .map((t) => ({ t, r: reactions.countsFor(t.id).rocket ?? 0 }))
              .sort((a, b) => b.r - a.r)
              .map(({ t, r }, i) => (
                <li key={t.id}>
                  <strong>#{i + 1}</strong> {t.text} · 🚀 {r}
                </li>
              ))}
          </ol>
        </section>
      )}
    </div>
  );
}
