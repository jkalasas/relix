export type MobilePane = "hosts" | "session";

export type FormMode = { type: "add" } | { type: "edit"; id: string } | null;

export type ForwardFormMode =
  | { type: "add" }
  | { type: "edit"; id: string }
  | null;
