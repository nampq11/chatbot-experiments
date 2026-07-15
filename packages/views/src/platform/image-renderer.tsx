import type {
  ComponentType,
  CSSProperties,
  ImgHTMLAttributes,
  ReactElement,
} from "react";

type NativeImageProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "alt" | "height" | "loading" | "src" | "srcSet" | "width"
>;

/**
 * Platform-neutral props for rendering shared view images without depending on a
 * specific app framework.
 */
export interface ImageRendererProps extends NativeImageProps {
  readonly src: string;
  readonly alt: string;
  readonly width?: number | `${number}`;
  readonly height?: number | `${number}`;
  readonly fill?: boolean;
  readonly loading?: "eager" | "lazy";
  readonly priority?: boolean;
  readonly preload?: boolean;
  readonly sizes?: string;
}

/** Component contract used by shared views to delegate image rendering. */
export type ImageRenderer = ComponentType<ImageRendererProps>;

/**
 * Framework-agnostic image renderer used when an app does not inject an
 * optimized image component.
 */
export function DefaultImageRenderer({
  alt,
  fill = false,
  loading,
  preload = false,
  priority = false,
  src,
  style,
  ...imageProps
}: ImageRendererProps): ReactElement {
  const fillStyle: CSSProperties | undefined = fill
    ? {
        position: "absolute",
        inset: 0,
        height: "100%",
        width: "100%",
        ...style,
      }
    : style;
  const loadingStrategy = loading ?? (preload || priority ? "eager" : "lazy");

  return (
    // biome-ignore lint/performance/noImgElement: Default renderer must stay framework-neutral; apps can inject optimized image components.
    <img
      {...imageProps}
      src={src}
      alt={alt}
      loading={loadingStrategy}
      style={fillStyle}
    />
  );
}
