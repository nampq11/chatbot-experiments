"use client";

import { createContext, type ReactNode, useContext } from "react";
import { DefaultImageRenderer, type ImageRenderer } from "./image-renderer";

const ImageRendererContext = createContext<ImageRenderer>(DefaultImageRenderer);

/** Provides the platform image renderer to client-side shared views. */
export function ImageRendererProvider({
  children,
  renderer,
}: {
  children: ReactNode;
  renderer: ImageRenderer;
}) {
  return (
    <ImageRendererContext.Provider value={renderer}>
      {children}
    </ImageRendererContext.Provider>
  );
}

/** Resolves the platform image renderer for client-side shared views. */
export function useImageRenderer(): ImageRenderer {
  return useContext(ImageRendererContext);
}
