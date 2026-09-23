'use client';
import { useState } from 'react';
import { useTrip } from '@/lib/tripData';
import { uid } from '@/lib/utils';
import type { Task } from '@/lib/types';
import { Avatar, Field, Icon, Sheet } from './ui';

const IDEAS = ['Playing cards 🃏', 'Bluetooth speaker 🔊', 'Snacks 🍿', 'Power bank 🔋', 'First-aid kit 🩹', 'Sunscreen 🧴', 'Cash for tips 💵', 'Board game 🎲', 'Water bottles 💧', 'Extension board 🔌'];

/** "Who's bringing what": assign tasks to people; assignees tick off their own. */
export default function Tasks() {
  const t = useTrip();
  const canAssign = t.can('members_can_assign_tasks');
  const [sheet, setSheet] = useState<Task | 'new' | null>(null);
  const done = t.tasks.filter((x) => x.done).length;
  const groups = [
    ...t.members.map((m) => ({ id: m.id as string | null, m, list: t.tasks.filter((x) => x.assignee_id === m.id) })),
    { id: null as string | null, m: undefined, list: t.tasks.filter((x) => !x.assignee_id || !t.members.some((m) => m.id === x.assignee_id)) },
  ].filter((g) => g.list.length > 0);

  return (
    <div className="stack">
      <section className="glass pad-lg stack-sm">
        <div className="row between"><h2 className="serif big">Who’s bringing what</h2></div>
        <p className="muted small">Assign things to people. They get a notification, and can tick them off themselves.</p>
        {t.tasks.length > 0 && (
          <div className="stack-sm">
            <div className="bar"><i style={{ width: `${(done / t.tasks.length) * 100}%`, background: 'var(--grad)' }} /></div>
            <span className="tiny muted">{done} of {t.tasks.length} done</span>
          </div>
        )}
        {canAssign ? <button className="btn primary" onClick={() => setSheet('new')}><Icon n="plus" size={18} /> Add a task</button>
          : <p className="tiny faint"><Icon n="lock" size={14} /> Only people the admin allows can assign tasks. You can tick off tasks given to you.</p>}
      </section>

      {groups.length === 0 && <div className="glass empty stack-sm"><span style={{ fontSize: 30 }}>🎒</span>No tasks yet.<br />Add “speaker → Yash” or “cards → Riya”.</div>}

      {groups.map((g) => (
        <section key={g.id ?? 'none'} className="glass pad stack-sm">
          <div className="row">
            {g.m ? <Avatar m={g.m} size={34} /> : <span className="emoji-tile" style={{ width: 34, height: 34 }}>🙋</span>}
            <b className="grow">{g.m ? (g.m.id === t.me?.id ? 'You' : g.m.name) : 'Anyone'}</b>
            <span className="tiny muted">{g.list.filter((x) => x.done).length}/{g.list.length}</span>
          </div>
          {g.list.map((x) => {
            const mine = x.assignee_id === t.me?.id;
            return (
              <div key={x.id} className="card-li" style={{ padding: '10px 12px' }}>
                <button className={`check ${x.done ? 'on' : ''}`} aria-label={x.done ? 'Mark not done' : 'Mark done'} onClick={() => (mine || canAssign) ? t.toggleTask(x.id) : t.notify('Only the person it’s assigned to can tick this.')}>{x.done && <Icon n="check" size={15} />}</button>
                <span className="grow" style={{ textDecoration: x.done ? 'line-through' : 'none', opacity: x.done ? 0.55 : 1 }}>{x.title}</span>
                {canAssign && <button className="icon-btn sm" aria-label="Edit task" onClick={() => setSheet(x)}><Icon n="edit" size={14} /></button>}
              </div>
            );
          })}
        </section>
      ))}
      {sheet && <TaskSheet key={sheet === 'new' ? 'new' : sheet.id} initial={sheet === 'new' ? null : sheet} onClose={() => setSheet(null)} />}
    </div>
  );
}

function TaskSheet({ initial, onClose }: { initial: Task | null; onClose: () => void }) {
  const t = useTrip();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [who, setWho] = useState<string | null>(initial?.assignee_id ?? null);
  return (
    <Sheet open onClose={onClose} title={initial ? 'Edit task' : 'New task'} actions={
      <>
        {initial && <button className="btn danger" onClick={async () => { await t.deleteTask(initial.id); onClose(); }}><Icon n="trash" size={17} /></button>}
        <button className="btn primary" disabled={!title.trim()} onClick={async () => { await t.saveTask({ id: initial?.id ?? uid(), title: title.trim(), assignee_id: who }); onClose(); }}>{initial ? 'Save' : 'Add task'}</button>
      </>
    }>
      <Field label="What needs to be brought or done?"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Bluetooth speaker" autoFocus /></Field>
      {!initial && <div className="chips wrap">{IDEAS.map((i) => <button key={i} className="chip" onClick={() => setTitle(i)}>{i}</button>)}</div>}
      <div className="stack-sm"><span className="field-label">Who’s doing it?</span>
        <div className="chips wrap">
          <button className={`chip ${who === null ? 'on' : ''}`} onClick={() => setWho(null)}>Anyone</button>
          {t.members.map((m) => <button key={m.id} className={`chip ${who === m.id ? 'on' : ''}`} onClick={() => setWho(m.id)}><Avatar m={m} size={20} /> {m.id === t.me?.id ? 'Me' : m.name}</button>)}
        </div>
      </div>
    </Sheet>
  );
}
