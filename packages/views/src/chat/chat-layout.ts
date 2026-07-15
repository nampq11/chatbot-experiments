/** Shared chat rail used to align the transcript, composer, and empty-state hero. */
export const CHAT_CONTENT_WIDTH_CLASS = "mx-auto w-full max-w-3xl";

/** Inner rail inset that keeps assistant transcript text readable on narrow screens. */
export const CHAT_TRANSCRIPT_INSET_CLASS = "px-4 md:px-2";

/** Inner rail inset for the composer, which should stay wider than transcript text on mobile. */
export const CHAT_COMPOSER_INSET_CLASS = "px-0 md:px-2";

/** Narrow rail used by the empty chat hero, matching Claude-style start screens. */
export const CHAT_HERO_RAIL_CLASS = "mx-auto w-full max-w-2xl";

/** Main content shell that owns viewport height and background for chat routes. */
export const CHAT_MAIN_CONTENT_CLASS =
  "relative h-full min-w-0 flex-1 bg-background pt-[env(safe-area-inset-top)] print:!h-auto";

/** Vertical app-shell stack used inside the semantic chat main region. */
export const CHAT_VERTICAL_LAYOUT_CLASS = "flex h-full flex-col";

/** Flexible content region that allows transcript scrolling without resizing the shell. */
export const CHAT_FLEX_REGION_CLASS = "min-h-0 flex flex-1 flex-col";

/** Empty-state canvas that places the hero in the same optical zone as Claude-style chat starts. */
export const CHAT_EMPTY_STATE_CANVAS_CLASS =
  "mx-auto flex h-full w-full max-w-7xl flex-col items-center gap-6 px-4 pt-[8vh] md:px-14 md:pt-[9vh] xl:px-20 max-sm:px-3";

/** Reserved greeting zone that keeps the empty composer aligned without magic negative margins. */
export const CHAT_EMPTY_STATE_GREETING_ZONE_CLASS =
  "mx-auto flex min-h-20 w-full max-w-2xl items-end justify-center md:min-h-24";

/** Display treatment for the empty-state greeting above the composer. */
export const CHAT_HERO_GREETING_CLASS =
  "mb-0 text-3xl font-light leading-10 tracking-[-0.03em] text-foreground/85 sm:text-[34px] sm:leading-[48px] md:whitespace-nowrap md:text-[36px] md:leading-[54px]";
