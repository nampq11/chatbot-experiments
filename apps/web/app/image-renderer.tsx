import type { ImageRendererProps } from "@chatbot-experiments/views";
import Image from "next/image";

/** Renders shared view images through Next.js image optimization. */
export function NextImageRenderer({
  priority,
  preload,
  ...props
}: ImageRendererProps) {
  return <Image {...props} preload={preload ?? priority} />;
}
