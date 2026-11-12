import { memo, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { CHAT_MAX_CHARS, chatCounter, senderRole, type ChatLine, type ReactionId } from '../../lib/tableChat';
import { useTableChat, type TableChatStore } from '../../lib/useTableChat';
import { ReactionArt, ReactionPicker } from './ReactionPicker';

type Props = {
  store: TableChatStore;
  selfId: number | null;
  /** Observers read chat but cannot write (DanGG default until capture C0). */
  readOnly: boolean;
  onSend: (text: string) => void;
  onReact: (id: ReactionId) => void;
  onMute: (line: ChatLine) => void;
  onReport: (line: ChatLine) => void;
};

const PIN_SLACK_PX = 24;
const COUNTER_WARN_AT = 10;

type LineProps = {
  line: ChatLine;
  role: 'self' | 'other';
  active: boolean;
  onToggle: (id: string) => void;
  onMute: (line: ChatLine) => void;
  onReport: (line: ChatLine) => void;
};

function ChatLogLine({ line, role, active, onToggle, onMute, onReport }: LineProps) {
  const canModerate = role === 'other';
  return (
    <li className={`tchat-line tchat-${line.kind}${active ? ' active' : ''}`}
      onClick={() => canModerate && onToggle(line.id)}>
      <span className={`tchat-nick tchat-${role}`}>{line.nick}</span>
      {line.kind === 'reaction' && line.reactionId
        ? <span className="tchat-text"><ReactionArt id={line.reactionId} label={line.text} size="inline" /></span>
        : <span className="tchat-text">{line.text}</span>}
      {canModerate && (
        <span className="tchat-line-actions">
          <button type="button" onClick={(e) => { e.stopPropagation(); onMute(line); }}
            aria-label={`Mute ${line.nick}`}>Mute</button>
          <button type="button" onClick={(e) => { e.stopPropagation(); onReport(line); }}
            aria-label={`Report ${line.nick}`}>Report</button>
        </span>
      )}
    </li>
  );
}

/** Docked table chat: collapsed button with unread badge, 300 px panel, reaction picker. */
export const TableChat = memo(function TableChat({ store, selfId, readOnly, onSend, onReact, onMute, onReport }: Props) {
  const { lines, unread, open } = useTableChat(store);
  const [draft, setDraft] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeLine, setActiveLine] = useState<string | null>(null);
  const logRef = useRef<HTMLOListElement>(null);
  const pinned = useRef(true);

  // Stay at the bottom only while the reader is there; otherwise keep their scroll position.
  useLayoutEffect(() => {
    const el = logRef.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [lines, open]);

  const onScroll = () => {
    const el = logRef.current;
    if (el) pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < PIN_SLACK_PX;
  };

  const closePicker = useCallback(() => setPickerOpen(false), []);
  const toggleLine = useCallback((id: string) => setActiveLine((cur) => (cur === id ? null : id)), []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || readOnly) return;
    onSend(text);
    setDraft('');
    pinned.current = true;
  };

  const counter = chatCounter(draft);
  const unreadLabel = unread > 99 ? '99+' : String(unread);

  return (
    <div className={`tchat-dock${open ? ' open' : ''}`}>
      {open && (
        <section className="tchat-panel" aria-label="Table chat">
          <header className="tchat-head">
            <span>Table chat</span>
            <button type="button" className="tchat-close" onClick={store.close} aria-label="Close chat">✕</button>
          </header>
          <ol ref={logRef} className="tchat-log chat-log" onScroll={onScroll} aria-live="polite" aria-relevant="additions">
            {lines.map((line) => (
              <ChatLogLine key={line.id} line={line} role={senderRole(line, selfId)}
                active={activeLine === line.id} onToggle={toggleLine} onMute={onMute} onReport={onReport} />
            ))}
            {!lines.length && <li className="tchat-empty">No messages yet.</li>}
          </ol>
          <form className="tchat-form" onSubmit={submit}>
            <input value={draft} maxLength={CHAT_MAX_CHARS} disabled={readOnly}
              placeholder={readOnly ? 'Spectators can read chat only' : 'Type a message…'}
              aria-label="Chat message"
              onChange={(e) => setDraft(e.target.value)}
              // Enter sends the message; it must never reach the table's Enter-to-bet handler.
              onKeyDown={(e) => { if (e.key === 'Enter') e.nativeEvent.stopPropagation(); }} />
            {counter !== null && (
              <span className={'tchat-counter' + (counter <= COUNTER_WARN_AT ? ' warn' : '')} aria-live="polite">{counter}</span>
            )}
            <button type="submit" className="btn btn-ghost btn-sm" disabled={readOnly || !draft.trim()}>Send</button>
          </form>
        </section>
      )}
      <div className="tchat-buttons">
        <button type="button" className="tchat-toggle" aria-expanded={open}
          aria-label={unread ? `Chat, ${unread} unread` : 'Chat'}
          onClick={open ? store.close : store.open}>
          Chat
          {unread > 0 && !open && <span className="tchat-badge" aria-hidden="true">{unreadLabel}</span>}
        </button>
        <span className="tchat-react-wrap">
          <button type="button" className="tchat-toggle" disabled={readOnly} aria-haspopup="menu" aria-expanded={pickerOpen}
            title={readOnly ? 'Spectators cannot react' : 'Send a reaction'}
            onClick={() => setPickerOpen((v) => !v)}>React</button>
          {pickerOpen && <ReactionPicker onPick={onReact} onClose={closePicker} />}
        </span>
      </div>
    </div>
  );
});
