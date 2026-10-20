import { createAsyncThunk } from "@reduxjs/toolkit";
import { setActive, setInactive } from "../slices/sessionSlice";
import { ThunkApiType } from "../store";

export const streamAcpInput = createAsyncThunk<
  void,
  {
    prompt: string;
  },
  ThunkApiType
>("chat/streamAcpInput", async ({ prompt }, { dispatch, extra, getState }) => {
  dispatch(setActive());
  const state = getState();
  // In the future, we can add a way to abort this request if messenger supports it
  try {
    await extra.ideMessenger.request("acp/streamChat", {
      prompt,
      mode: state.session.mode,
      model: state.session.currentAgentModel,
      agentId: state.session.activeAgentId,
      conversationId: state.session.id,
    });
  } catch (e) {
    console.error("Failed to stream ACP input", e);
  } finally {
    dispatch(setInactive()); // IT"S DANGEROUS
    // In Phase 1, the end of stream might not be explicitly signaled back.
    // But we can keep it active until the agent finishes.
    // For now we'll rely on the agent sending updates.
  }
});
