"use client";

import { useState } from "react";
import { LocalTime } from "@/components/local-time";
import type { CustomerNote } from "@/lib/admin/customers";
import { ActionMessage, useAdminAction, useUnsavedGuard } from "../../use-admin-action";
import { addNoteAction, deleteNoteAction, editNoteAction } from "../actions";

const field = "rounded-lg border border-navy/30 bg-white px-3 py-2 outline-none focus:border-navy";

/** Private admin notes about a customer. Any admin adds; only the author edits or deletes. */
export function CustomerNotes({ customerId, notes, me }: { customerId: string; notes: CustomerNote[]; me: string }) {
  const { pending, message, run } = useAdminAction();
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const editDirty = !!editing && editing.body.trim() !== notes.find((n) => n.id === editing.id)?.body;
  useUnsavedGuard(!!draft.trim() || editDirty, "notes");

  return (
    <section aria-labelledby="notes-heading" className="flex flex-col gap-3">
      <div>
        <h2 id="notes-heading" className="font-serif text-2xl font-medium">
          Notes
        </h2>
        <p className="text-[13px] opacity-65">Only admins see these. The latest also show on this customer’s orders.</p>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="new-note" className="sr-only">
          New note
        </label>
        <textarea
          id="new-note"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="e.g. Prefers delivery to the site office. Pays by bank transfer."
          className={field}
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={pending || !draft.trim()}
            className="h-10 rounded-lg bg-navy px-4 font-semibold text-cream-2 disabled:opacity-50"
            onClick={() => run(() => addNoteAction(customerId, draft), () => setDraft(""))}
          >
            Add note
          </button>
          <ActionMessage message={message} />
        </div>
      </div>

      {notes.length > 0 && (
        <ul className="flex flex-col gap-2">
          {notes.map((n) => (
            <li key={n.id} className="rounded-xl border border-navy/12 bg-white/50 px-3 py-2.5">
              {editing?.id === n.id ? (
                <div className="flex flex-col gap-2">
                  <label htmlFor={`edit-${n.id}`} className="sr-only">
                    Edit note
                  </label>
                  <textarea
                    id={`edit-${n.id}`}
                    value={editing.body}
                    onChange={(e) => setEditing({ id: n.id, body: e.target.value })}
                    rows={3}
                    maxLength={2000}
                    className={field}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={pending || !editing.body.trim()}
                      className="h-9 rounded-lg bg-navy px-3 font-semibold text-cream-2 disabled:opacity-50"
                      onClick={() => run(() => editNoteAction(n.id, editing.body), () => setEditing(null))}
                    >
                      Save
                    </button>
                    <button type="button" className="h-9 px-2 underline" onClick={() => setEditing(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="break-words whitespace-pre-line">{n.body}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 text-[12px]">
                    <span className="opacity-60">
                      {n.author} · <LocalTime iso={n.created_at} withTime />
                      {n.edited && " · edited"}
                    </span>
                    {n.author_id === me && (
                      <>
                        <button type="button" disabled={pending} className="underline" onClick={() => setEditing({ id: n.id, body: n.body })}>
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          className="text-red-800 underline"
                          onClick={() => {
                            if (confirm("Delete this note?")) run(() => deleteNoteAction(n.id));
                          }}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
