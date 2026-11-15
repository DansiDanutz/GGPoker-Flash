import { memo } from 'react';
import { useSeatFx, type TableChatStore } from '../../lib/useTableChat';
import { ReactionArt } from './ReactionPicker';
import { reactionFx } from '../../game/reactionFx';

type Props = {
  store: TableChatStore;
  userId: number;
  showBubbles: boolean;
  showReactions: boolean;
};

/**
 * A seat's chat bubble (4.5 s) and reaction artwork (4 s). It subscribes to the chat
 * store on its own, so a new line re-renders this overlay and nothing else at the seat.
 */
export const SeatReaction = memo(function SeatReaction({ store, userId, showBubbles, showReactions }: Props) {
  const { reaction, bubble } = useSeatFx(store, userId);
  return (
    <>
      {showReactions && reaction && (
        <div key={reaction.key} className="seat-reaction" role="img" aria-label={`Reaction: ${reaction.label}`}>
          <span className={`reaction-fx reaction-fx-${reactionFx(reaction.id).anim}`}>
            <ReactionArt id={reaction.id} label={reaction.label} size="seat" />
          </span>
        </div>
      )}
      {showBubbles && bubble && (
        <div key={bubble.key} className="chat-bubble">{bubble.text}</div>
      )}
    </>
  );
});
