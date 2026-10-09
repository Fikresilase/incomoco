"use client";

import { ChatApp, type ComposerToolsContext } from "@/features/chat";
import { DictationButton, LiveTalkButton } from "@/features/voice";

/** Voice feature controls placed in the chat composer. */
function VoiceTools({ ctx }: { ctx: ComposerToolsContext }) {
  return (
    <>
      <DictationButton
        onText={ctx.insertText}
        conversationId={ctx.conversationId}
        disabled={ctx.disabled}
      />
      <LiveTalkButton
        conversationId={ctx.conversationId}
        disabled={ctx.disabled}
        onEnded={ctx.onLiveTalkEnded}
      />
    </>
  );
}

/** Composes the chat feature with the voice feature (features never import each other). */
export function ChatScreen() {
  return <ChatApp ComposerTools={VoiceTools} />;
}
