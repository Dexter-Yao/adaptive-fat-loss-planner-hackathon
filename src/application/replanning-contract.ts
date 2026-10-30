// ABOUTME: Shared replanning commands and derived draft view, implemented by the root journey controller.
// ABOUTME: Session owns the candidate and archives; this view is never a separate persistent store.
import type { InitializationInput } from "../domain/initialization";
export interface ReplanningDraftView {
  id: string;
  sourceSessionId: string;
  status: "editing" | "generating" | "review" | "failed";
  input: InitializationInput;
  error: string | null;
}
export interface ReplanningCommands {
  beginReplanning(): Promise<void>;
  updateReplanningSetup(input: InitializationInput): Promise<void>;
  generateReplanning(): Promise<void>;
  acceptReplanning(): Promise<void>;
  cancelReplanning(): Promise<void>;
}
