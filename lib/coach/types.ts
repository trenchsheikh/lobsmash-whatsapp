export type CoachMode = "solo" | "duo_pre" | "duo_post";

export type CoachContext = {
  waId: string;
  coachMode: CoachMode;
  /** Compact text block for prompt injection */
  memoryBlock: string;
};
