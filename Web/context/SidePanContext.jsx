"use client";
import { createContext, useContext, useState } from "react";

const SidePanContext = createContext();

export function SidePanProvider({ children }) {
  const [isSidePanOpen, setIsSidePanOpen] = useState(false);

  return (
    <SidePanContext.Provider value={{ isSidePanOpen, setIsSidePanOpen }}>
      {children}
    </SidePanContext.Provider>
  );
}

export const useSidePan = () => useContext(SidePanContext);
