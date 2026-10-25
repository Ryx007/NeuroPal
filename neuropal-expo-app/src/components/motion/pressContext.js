import { createContext } from "react";

// A pressed-progress shared value (0 = up, 1 = pressed) handed from a
// PressTile to the Signal panel directly inside it, which then sinks into
// its own hard shadow. No provider (the default) = panels render exactly as
// they always have.
export const PanelPressContext = createContext(null);
