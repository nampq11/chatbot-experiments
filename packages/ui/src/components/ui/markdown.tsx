import { marked } from "marked";
import {
  Children,
  memo,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { usePrefersReducedMotion } from "../../hooks/use-prefers-reduced-motion";
import { cn } from "../../lib/utils";
import { CodeBlock, CodeBlockCode } from "./code-block";

export type MarkdownProps = {
  children: string;
  id?: string;
  className?: string;
  components?: Partial<Components>;
  /** Animates newly streamed text tokens without changing markdown block parsing. */
  smoothStream?: boolean;
};

const STREAM_TOKEN_ANIMATION_LIMIT = 80;

function countMarkdownTextTokens(value: string) {
  return value.match(/\S+/gu)?.length ?? 0;
}

function AnimatedMarkdownText({ children }: { children: ReactNode }) {
  return (
    <>
      {Children.map(children, (child, childIndex) => {
        if (typeof child !== "string") {
          return child;
        }

        return child.split(/(\s+)/u).map((part, partIndex) => {
          if (part.length === 0 || /^\s+$/u.test(part)) {
            return part;
          }

          return (
            <span
              className="markdown-stream-token"
              key={`${childIndex}-${partIndex}`}
            >
              {part}
            </span>
          );
        });
      })}
    </>
  );
}

const ANIMATED_TEXT_COMPONENTS: Partial<Components> = {
  p: function ParagraphComponent({ children, node: _node, ...props }) {
    return (
      <p {...props}>
        <AnimatedMarkdownText>{children}</AnimatedMarkdownText>
      </p>
    );
  },
  li: function ListItemComponent({ children, node: _node, ...props }) {
    return (
      <li {...props}>
        <AnimatedMarkdownText>{children}</AnimatedMarkdownText>
      </li>
    );
  },
  h1: function HeadingOneComponent({ children, node: _node, ...props }) {
    return (
      <h1 {...props}>
        <AnimatedMarkdownText>{children}</AnimatedMarkdownText>
      </h1>
    );
  },
  h2: function HeadingTwoComponent({ children, node: _node, ...props }) {
    return (
      <h2 {...props}>
        <AnimatedMarkdownText>{children}</AnimatedMarkdownText>
      </h2>
    );
  },
  h3: function HeadingThreeComponent({ children, node: _node, ...props }) {
    return (
      <h3 {...props}>
        <AnimatedMarkdownText>{children}</AnimatedMarkdownText>
      </h3>
    );
  },
  h4: function HeadingFourComponent({ children, node: _node, ...props }) {
    return (
      <h4 {...props}>
        <AnimatedMarkdownText>{children}</AnimatedMarkdownText>
      </h4>
    );
  },
  strong: function StrongComponent({ children, node: _node, ...props }) {
    return (
      <strong {...props}>
        <AnimatedMarkdownText>{children}</AnimatedMarkdownText>
      </strong>
    );
  },
  em: function EmphasisComponent({ children, node: _node, ...props }) {
    return (
      <em {...props}>
        <AnimatedMarkdownText>{children}</AnimatedMarkdownText>
      </em>
    );
  },
  a: function AnchorComponent({ children, node: _node, ...props }) {
    return (
      <a {...props}>
        <AnimatedMarkdownText>{children}</AnimatedMarkdownText>
      </a>
    );
  },
  td: function TableCellComponent({ children, node: _node, ...props }) {
    return (
      <td {...props}>
        <AnimatedMarkdownText>{children}</AnimatedMarkdownText>
      </td>
    );
  },
  th: function TableHeaderCellComponent({ children, node: _node, ...props }) {
    return (
      <th {...props}>
        <AnimatedMarkdownText>{children}</AnimatedMarkdownText>
      </th>
    );
  },
};

function hasMarkdownFootnoteDefinitions(markdown: string) {
  return /(?:^|\n)\[\^[^\]]+\]:/u.test(markdown);
}

function parseMarkdownIntoBlocks(markdown: string): string[] {
  if (hasMarkdownFootnoteDefinitions(markdown)) {
    return [markdown];
  }

  const tokens = marked.lexer(markdown);
  return tokens.map((token) => token.raw);
}

/** Tracks whether the current streaming update is small enough to animate safely. */
function useShouldAnimateStreamTokens(children: string, smoothStream: boolean) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const previousChildrenRef = useRef("");
  const hasDisabledStreamMotionRef = useRef(false);
  const addedStreamText = children.startsWith(previousChildrenRef.current)
    ? children.slice(previousChildrenRef.current.length)
    : children;
  const addedTokenCount = countMarkdownTextTokens(addedStreamText);
  const isCurrentStreamTooLarge =
    addedTokenCount > STREAM_TOKEN_ANIMATION_LIMIT;
  const shouldAnimate =
    smoothStream &&
    !prefersReducedMotion &&
    !hasDisabledStreamMotionRef.current &&
    !isCurrentStreamTooLarge;

  useEffect(() => {
    if (!smoothStream) {
      hasDisabledStreamMotionRef.current = false;
      previousChildrenRef.current = children;
      return;
    }

    if (isCurrentStreamTooLarge) {
      hasDisabledStreamMotionRef.current = true;
    }

    previousChildrenRef.current = children;
  }, [children, isCurrentStreamTooLarge, smoothStream]);

  return shouldAnimate;
}

function extractLanguage(className?: string): string {
  if (!className) return "plaintext";
  const match = className.match(/language-(\w+)/);
  return match?.[1] ?? "plaintext";
}

const INITIAL_COMPONENTS: Partial<Components> = {
  table: function TableComponent({
    className,
    children,
    node: _node,
    ...props
  }) {
    return (
      <div className="markdown-table-wrapper w-full overflow-x-auto">
        <table className={cn("min-w-full", className)} {...props}>
          {children}
        </table>
      </div>
    );
  },

  code: function CodeComponent({ className, children, node, ...props }) {
    const isInline =
      !node?.position?.start.line ||
      node?.position?.start.line === node?.position?.end.line;

    if (isInline) {
      return (
        <span
          className={cn(
            "rounded-[0.4rem] border border-border/40 bg-muted/50 px-1 py-px font-mono text-[0.9em] text-foreground",
            className,
          )}
          {...props}
        >
          {children}
        </span>
      );
    }

    const language = extractLanguage(className);

    return (
      <CodeBlock className={className}>
        <CodeBlockCode code={children as string} language={language} />
      </CodeBlock>
    );
  },
  pre: function PreComponent({ children }) {
    return <>{children}</>;
  },
};

const MemoizedMarkdownBlock = memo(
  function MarkdownBlock({
    content,
    components = INITIAL_COMPONENTS,
    smoothStream = false,
  }: {
    content: string;
    components?: Partial<Components>;
    smoothStream?: boolean;
  }) {
    const markdownComponents = smoothStream
      ? { ...ANIMATED_TEXT_COMPONENTS, ...components }
      : components;

    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={markdownComponents}
      >
        {content}
      </ReactMarkdown>
    );
  },
  function propsAreEqual(prevProps, nextProps) {
    return (
      prevProps.content === nextProps.content &&
      prevProps.components === nextProps.components &&
      prevProps.smoothStream === nextProps.smoothStream
    );
  },
);

MemoizedMarkdownBlock.displayName = "MemoizedMarkdownBlock";

function MarkdownComponent({
  children,
  id,
  className,
  components = INITIAL_COMPONENTS,
  smoothStream = false,
}: MarkdownProps) {
  const generatedId = useId();
  const blockId = id ?? generatedId;
  const shouldSmoothStream = useShouldAnimateStreamTokens(
    children,
    smoothStream,
  );
  const blocks = useMemo(() => parseMarkdownIntoBlocks(children), [children]);

  return (
    <div className={className}>
      {blocks.map((block, index) => (
        <MemoizedMarkdownBlock
          key={`${blockId}-block-${index}`}
          content={block}
          components={components}
          smoothStream={shouldSmoothStream}
        />
      ))}
    </div>
  );
}

const Markdown = memo(MarkdownComponent);
Markdown.displayName = "Markdown";

export { Markdown };
