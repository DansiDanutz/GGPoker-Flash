import React, { useEffect, useId, useRef, useState } from 'react';
import { WaitlistQueue } from '../lib/api';
import { useApp } from '../lib/store';
import { chipCount, queueName, queuePositionLabel, waitlistChipLabel } from '../lib/waitlist';
import { useWaitlist } from '../lib/waitlistState';

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Please try again.');

/**
 * Header "Waiting List · n" chip (P0 slice W4b). Hidden while the player has no queues.
 * The popover lists each queue with its position and a Leave button; positions update
 * live from the `waitlist_update` stream via the wait-list provider.
 */
export function WaitlistChip() {
  const { toast } = useApp();
  const { queues, leaveQueue } = useWaitlist();
  const [isOpen, setIsOpen] = useState(false);
  const [leaving, setLeaving] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();
  const titleId = useId();
  const active = queues.filter((q) => q.position > 0);
  const count = chipCount(active);

  // Close on Esc (focus returns to the chip) and on a click outside.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setIsOpen(false);
      triggerRef.current?.focus();
    };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    popoverRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, [isOpen]);

  useEffect(() => { if (count === 0) setIsOpen(false); }, [count]);

  if (count === 0) return null;

  const leave = async (q: WaitlistQueue) => {
    setLeaving(q.queueKey);
    try {
      await leaveQueue(q);
      toast({ kind: 'info', title: 'Left waiting list', body: queueName(q) });
    } catch (e) {
      toast({ kind: 'error', title: 'Could not leave waiting list', body: errorMessage(e) });
    } finally { setLeaving(null); }
  };

  return (
    <div className="waitlist-chip-wrap" onClick={(e) => e.stopPropagation()}>
      <button
        ref={triggerRef}
        type="button"
        className={'waitlist-chip' + (isOpen ? ' open' : '')}
        aria-expanded={isOpen}
        aria-controls={popoverId}
        aria-label={`Waiting List: ${waitlistChipLabel(count)}`}
        onClick={() => setIsOpen((v) => !v)}
      >
        Waiting List · <b>{count}</b>
      </button>
      {isOpen && (
        <div ref={popoverRef} id={popoverId} className="waitlist-popover" role="dialog" aria-labelledby={titleId}>
          <div id={titleId} className="waitlist-popover-title">Waiting List</div>
          <ul>
            {active.map((q) => (
              <li key={q.queueKey} className="waitlist-popover-row">
                <span className="wl-name">{queueName(q)}</span>
                <span className="wl-pos">{queuePositionLabel(q)}</span>
                <button
                  type="button"
                  className="btn btn-dark btn-sm"
                  disabled={leaving === q.queueKey}
                  aria-label={`Leave waiting list for ${queueName(q)}`}
                  onClick={() => leave(q)}
                >
                  Leave
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
