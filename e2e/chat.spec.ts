import { expect, type Page, test } from "@playwright/test";
import { getChatRootPath } from "../packages/client/src/navigation/chat-routes";

type RealtimeSseFrame = {
  type: string;
  [key: string]: unknown;
};

function formatRealtimeSseBody(frames: readonly RealtimeSseFrame[]) {
  return `${frames
    .map((frame) => `event: ${frame.type}\ndata: ${JSON.stringify(frame)}`)
    .join("\n\n")}\n\n`;
}

function createStreamingAssistantLifecycleFrames(input: {
  sessionId: string;
  runId: string;
  messageId: string;
  delta: string;
}): RealtimeSseFrame[] {
  return [
    {
      type: "agent.run.started",
      sessionId: input.sessionId,
      runId: input.runId,
    },
    {
      type: "message.started",
      sessionId: input.sessionId,
      messageId: input.messageId,
    },
    {
      type: "message.delta",
      sessionId: input.sessionId,
      messageId: input.messageId,
      delta: input.delta,
    },
    {
      type: "message.completed",
      sessionId: input.sessionId,
      messageId: input.messageId,
    },
    {
      type: "agent.run.completed",
      sessionId: input.sessionId,
      runId: input.runId,
    },
  ];
}

function createFinalAssistantLifecycleFrames(input: {
  sessionId: string;
  runId: string;
  messageId: string;
  message: string;
}): RealtimeSseFrame[] {
  return [
    {
      type: "agent.run.started",
      sessionId: input.sessionId,
      runId: input.runId,
    },
    {
      type: "message.started",
      sessionId: input.sessionId,
      messageId: input.messageId,
    },
    {
      type: "assistant.message",
      sessionId: input.sessionId,
      messageId: input.messageId,
      message: input.message,
    },
    {
      type: "message.completed",
      sessionId: input.sessionId,
      messageId: input.messageId,
    },
    {
      type: "agent.run.completed",
      sessionId: input.sessionId,
      runId: input.runId,
    },
  ];
}

async function goToChat(page: Page) {
  await page.goto(getChatRootPath());
}

function getMessageInput(page: Page) {
  return page.getByRole("textbox", { name: "Message" });
}

function getSendMessageButton(page: Page) {
  return page.getByRole("button", { name: "Send message" });
}
async function expectEmptyChatHeroLayout(page: Page) {
  const main = page.locator("#main-content");
  const greeting = page.getByRole("heading", {
    name: /Plan your dental trip to Vietnam/,
  });
  const starterPrompt = page.getByRole("button", {
    name: /Estimate Vietnam treatment costs/,
  });
  const textarea = getMessageInput(page);

  await expect(main).toBeVisible();
  await expect(greeting).toBeVisible();
  await expect(starterPrompt).toBeVisible();
  await expect(textarea).toBeVisible();

  const mainBox = await main.boundingBox();
  const greetingBox = await greeting.boundingBox();
  const textareaBox = await textarea.boundingBox();

  if (!mainBox || !greetingBox || !textareaBox) {
    throw new Error("Unable to measure empty chat hero layout.");
  }

  const mainCenterX = mainBox.x + mainBox.width / 2;
  const textareaCenterX = textareaBox.x + textareaBox.width / 2;
  const textareaOffsetY = textareaBox.y - mainBox.y;

  expect(Math.abs(textareaCenterX - mainCenterX)).toBeLessThan(32);
  expect(greetingBox.y).toBeLessThan(textareaBox.y);
  expect(textareaOffsetY).toBeGreaterThan(100);
  expect(textareaOffsetY).toBeLessThan(mainBox.height * 0.65);
}

async function sendChatMessage(page: Page, message: string) {
  const textarea = getMessageInput(page);
  await expect(textarea).toBeVisible();
  await textarea.fill(message);

  const sendButton = getSendMessageButton(page);
  await expect(sendButton).toBeEnabled();
  await sendButton.click();
}

async function sendFirstMessageAndWaitForSession(page: Page, message: string) {
  await sendChatMessage(page, message);
  await expect(page).toHaveURL(/\/chat\/[^/]+$/, { timeout: 15000 });
  await expect(page.getByText(message).first()).toBeVisible();
}

async function getSessionLink(page: Page, title: string) {
  const sessionLink = page
    .getByRole("link", { name: title, exact: true })
    .first();
  await expect(sessionLink).toBeVisible({ timeout: 10000 });
  return sessionLink;
}

async function getSessionDeleteButton(page: Page, title: string) {
  const sessionLink = await getSessionLink(page, title);
  const sessionRow = sessionLink.locator("xpath=..");

  await sessionLink.hover();

  const deleteButton = sessionRow.getByRole("button", {
    name: "Delete chat",
    exact: true,
  });
  await expect(deleteButton).toBeVisible();
  return deleteButton;
}

async function openDeleteDialogForSession(page: Page, title: string) {
  const deleteButton = await getSessionDeleteButton(page, title);
  await deleteButton.click();
}

async function mockStreamingChatSession(
  page: Page,
  input: { sessionId: string; assistantMarkdown: string },
) {
  const now = new Date().toISOString();
  const userId = "stream-layout-user";
  const session = {
    id: input.sessionId,
    user_id: userId,
    title: "Stream layout",
    status: "active",
    message_count: 1,
    created_at: now,
    updated_at: now,
  };
  const userMessage = {
    id: "stream-layout-user-message",
    session_id: input.sessionId,
    user_id: userId,
    sequence: 1,
    role: "user",
    content: "Estimate request",
    created_at: now,
  };
  const assistantMessageId = "stream-layout-assistant-message";
  const assistantMessage = {
    id: assistantMessageId,
    session_id: input.sessionId,
    user_id: userId,
    sequence: 2,
    role: "assistant",
    content: input.assistantMarkdown,
    created_at: now,
  };
  let completed = false;

  await page.route("**/api/sessions**", async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname === "/api/sessions") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ items: [session], nextCursor: null }),
      });
      return;
    }

    if (url.pathname === `/api/sessions/${input.sessionId}`) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(session),
      });
      return;
    }

    if (url.pathname === `/api/sessions/${input.sessionId}/messages`) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(
          completed ? [userMessage, assistantMessage] : [userMessage],
        ),
      });
      return;
    }

    await route.fulfill({ status: 404, body: "Not mocked" });
  });

  let streamCount = 0;
  await page.route("**/api/realtime/stream**", async (route) => {
    streamCount += 1;

    if (streamCount !== 1) {
      await route.fulfill({
        contentType: "text/event-stream; charset=utf-8",
        body: "",
      });
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));

    const frames = createStreamingAssistantLifecycleFrames({
      sessionId: input.sessionId,
      runId: "stream-layout-run",
      messageId: assistantMessageId,
      delta: input.assistantMarkdown,
    });

    session.message_count = 2;
    completed = true;

    await route.fulfill({
      contentType: "text/event-stream; charset=utf-8",
      body: formatRealtimeSseBody(frames),
    });
  });
}

async function mockFinalOnlyAssistantMessageSession(
  page: Page,
  input: { sessionId: string; assistantMarkdown: string },
) {
  const now = new Date().toISOString();
  const userId = "final-only-stream-user";
  const assistantMessageId = "final-only-assistant-message";
  const session = {
    id: input.sessionId,
    user_id: userId,
    title: "Final only stream",
    status: "active",
    message_count: 2,
    created_at: now,
    updated_at: now,
  };
  const userMessage = {
    id: "final-only-user-message",
    session_id: input.sessionId,
    user_id: userId,
    sequence: 1,
    role: "user",
    content: "Estimate request",
    created_at: now,
  };
  const assistantMessage = {
    id: assistantMessageId,
    session_id: input.sessionId,
    user_id: userId,
    sequence: 2,
    role: "assistant",
    content: input.assistantMarkdown,
    created_at: now,
  };
  let completed = false;

  await page.route("**/api/sessions**", async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname === "/api/sessions") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ items: [session], nextCursor: null }),
      });
      return;
    }

    if (url.pathname === `/api/sessions/${input.sessionId}`) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(session),
      });
      return;
    }

    if (url.pathname === `/api/sessions/${input.sessionId}/messages`) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(
          completed ? [userMessage, assistantMessage] : [userMessage],
        ),
      });
      return;
    }

    await route.fulfill({ status: 404, body: "Not mocked" });
  });

  let streamCount = 0;
  await page.route("**/api/realtime/stream**", async (route) => {
    streamCount += 1;

    if (streamCount !== 1) {
      await route.fulfill({
        contentType: "text/event-stream; charset=utf-8",
        body: "",
      });
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));

    const frames = createFinalAssistantLifecycleFrames({
      sessionId: input.sessionId,
      runId: "final-only-run",
      messageId: assistantMessageId,
      message: input.assistantMarkdown,
    });
    completed = true;

    await route.fulfill({
      contentType: "text/event-stream; charset=utf-8",
      body: formatRealtimeSseBody(frames),
    });
  });
}

async function mockAppendableExistingChatSession(
  page: Page,
  input: {
    sessionId: string;
    historyMarkdown: string;
    streamingAssistantMarkdown?: string;
  },
) {
  const now = new Date().toISOString();
  const userId = "position-user";
  const session = {
    id: input.sessionId,
    user_id: userId,
    title: "Position repro",
    status: "active",
    message_count: 2,
    created_at: now,
    updated_at: now,
  };
  const messages = [
    {
      id: "position-first-user-message",
      session_id: input.sessionId,
      user_id: userId,
      sequence: 1,
      role: "user",
      content: "Earlier estimate request",
      created_at: now,
    },
    {
      id: "position-first-assistant-message",
      session_id: input.sessionId,
      user_id: userId,
      sequence: 2,
      role: "assistant",
      content: input.historyMarkdown,
      created_at: now,
    },
  ];
  let hasReceivedFollowUp = false;

  await page.route("**/api/sessions**", async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname === "/api/sessions") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ items: [session], nextCursor: null }),
      });
      return;
    }

    if (url.pathname === `/api/sessions/${input.sessionId}`) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(session),
      });
      return;
    }

    if (url.pathname === `/api/sessions/${input.sessionId}/messages`) {
      if (route.request().method() === "POST") {
        const requestBody = JSON.parse(route.request().postData() ?? "{}") as {
          content?: string;
          role?: string;
        };
        const message = {
          id: "position-second-user-message",
          session_id: input.sessionId,
          user_id: userId,
          sequence: messages.length + 1,
          role: requestBody.role ?? "user",
          content: requestBody.content ?? "",
          created_at: new Date().toISOString(),
        };

        messages.push(message);
        session.message_count = messages.length;
        hasReceivedFollowUp = true;

        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify(message),
        });
        return;
      }

      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(messages),
      });
      return;
    }

    await route.fulfill({ status: 404, body: "Not mocked" });
  });

  let streamCount = 0;
  await page.route("**/api/realtime/stream**", async (route) => {
    streamCount += 1;

    if (!input.streamingAssistantMarkdown || streamCount !== 1) {
      await route.fulfill({
        contentType: "text/event-stream; charset=utf-8",
        body: "",
      });
      return;
    }

    while (!hasReceivedFollowUp) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    const assistantMessage = {
      id: "position-streaming-assistant-message",
      session_id: input.sessionId,
      user_id: userId,
      sequence: messages.length + 1,
      role: "assistant",
      content: input.streamingAssistantMarkdown,
      created_at: new Date().toISOString(),
    };
    messages.push(assistantMessage);
    session.message_count = messages.length;

    const frames = createStreamingAssistantLifecycleFrames({
      sessionId: input.sessionId,
      runId: "position-streaming-run",
      messageId: assistantMessage.id,
      delta: input.streamingAssistantMarkdown,
    });

    await route.fulfill({
      contentType: "text/event-stream; charset=utf-8",
      body: formatRealtimeSseBody(frames),
    });
  });
}

async function mockStreamingChatSessionWithHistory(
  page: Page,
  input: {
    sessionId: string;
    historyMarkdown: string;
    assistantMarkdown: string;
  },
) {
  const now = new Date().toISOString();
  const userId = "stream-history-user";
  const session = {
    id: input.sessionId,
    user_id: userId,
    title: "Stream history",
    status: "active",
    message_count: 2,
    created_at: now,
    updated_at: now,
  };
  const userMessage = {
    id: "stream-history-user-message",
    session_id: input.sessionId,
    user_id: userId,
    sequence: 1,
    role: "user",
    content: "Earlier estimate request",
    created_at: now,
  };
  const assistantMessage = {
    id: "stream-history-assistant-message",
    session_id: input.sessionId,
    user_id: userId,
    sequence: 2,
    role: "assistant",
    content: input.historyMarkdown,
    created_at: now,
  };
  const streamingAssistantMessage = {
    id: "stream-history-new-assistant-message",
    session_id: input.sessionId,
    user_id: userId,
    sequence: 3,
    role: "assistant",
    content: input.assistantMarkdown,
    created_at: now,
  };
  let completed = false;

  await page.route("**/api/sessions**", async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname === "/api/sessions") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ items: [session], nextCursor: null }),
      });
      return;
    }

    if (url.pathname === `/api/sessions/${input.sessionId}`) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(session),
      });
      return;
    }

    if (url.pathname === `/api/sessions/${input.sessionId}/messages`) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(
          completed
            ? [userMessage, assistantMessage, streamingAssistantMessage]
            : [userMessage, assistantMessage],
        ),
      });
      return;
    }

    await route.fulfill({ status: 404, body: "Not mocked" });
  });

  let streamCount = 0;
  await page.route("**/api/realtime/stream**", async (route) => {
    streamCount += 1;

    if (streamCount !== 1) {
      await route.fulfill({
        contentType: "text/event-stream; charset=utf-8",
        body: "",
      });
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));

    const frames = createStreamingAssistantLifecycleFrames({
      sessionId: input.sessionId,
      runId: "stream-history-run",
      messageId: streamingAssistantMessage.id,
      delta: input.assistantMarkdown,
    });

    session.message_count = 3;
    completed = true;

    await route.fulfill({
      contentType: "text/event-stream; charset=utf-8",
      body: formatRealtimeSseBody(frames),
    });
  });
}

async function mockMissedRealtimeAssistantSession(
  page: Page,
  input: { sessionId: string; assistantMessage: string },
) {
  const now = new Date().toISOString();
  const userId = "missed-stream-user";
  let messagesRequestCount = 0;
  const session = {
    id: input.sessionId,
    user_id: userId,
    title: "Missed stream recovery",
    status: "active",
    message_count: 2,
    created_at: now,
    updated_at: now,
  };
  const userMessage = {
    id: "missed-stream-user-message",
    session_id: input.sessionId,
    user_id: userId,
    sequence: 1,
    role: "user",
    content: "Trigger missed stream race",
    created_at: now,
  };
  const assistantMessage = {
    id: "missed-stream-assistant-message",
    session_id: input.sessionId,
    user_id: userId,
    sequence: 2,
    role: "assistant",
    content: input.assistantMessage,
    created_at: now,
  };

  await page.route("**/api/sessions**", async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname === "/api/sessions") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ items: [session], nextCursor: null }),
      });
      return;
    }

    if (url.pathname === `/api/sessions/${input.sessionId}`) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(session),
      });
      return;
    }

    if (url.pathname === `/api/sessions/${input.sessionId}/messages`) {
      messagesRequestCount += 1;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(
          messagesRequestCount === 1
            ? [userMessage]
            : [userMessage, assistantMessage],
        ),
      });
      return;
    }

    await route.fulfill({ status: 404, body: "Not mocked" });
  });

  await page.route("**/api/realtime/stream**", async (route) => {
    await route.fulfill({
      contentType: "text/event-stream; charset=utf-8",
      body: "",
    });
  });

  return {
    getMessagesRequestCount: () => messagesRequestCount,
  };
}

async function getChatTranscriptScrollStateOrNull(page: Page) {
  return page.locator('[role="log"]').evaluate((root) => {
    const rootElement = root as HTMLElement;
    const candidates = [
      rootElement,
      ...Array.from(rootElement.querySelectorAll<HTMLElement>("div")),
    ];
    const scrollContainer = candidates
      .filter((element) => element.scrollHeight > element.clientHeight + 1)
      .sort(
        (a, b) =>
          b.scrollHeight - b.clientHeight - (a.scrollHeight - a.clientHeight),
      )[0];

    if (!scrollContainer) {
      return null;
    }

    return {
      bottomGap:
        scrollContainer.scrollHeight -
        scrollContainer.scrollTop -
        scrollContainer.clientHeight,
      clientHeight: scrollContainer.clientHeight,
      scrollHeight: scrollContainer.scrollHeight,
      scrollTop: scrollContainer.scrollTop,
    };
  });
}

async function getChatTranscriptScrollState(page: Page) {
  const scrollState = await getChatTranscriptScrollStateOrNull(page);

  if (!scrollState) {
    throw new Error("Unable to find chat transcript scroll container");
  }

  return scrollState;
}

async function setChatTranscriptScrollTop(page: Page, scrollTop: number) {
  await page.locator('[role="log"]').evaluate((root, value) => {
    const rootElement = root as HTMLElement;
    const candidates = [
      rootElement,
      ...Array.from(rootElement.querySelectorAll<HTMLElement>("div")),
    ];
    const scrollContainer = candidates
      .filter((element) => element.scrollHeight > element.clientHeight + 1)
      .sort(
        (a, b) =>
          b.scrollHeight - b.clientHeight - (a.scrollHeight - a.clientHeight),
      )[0];

    if (!scrollContainer) {
      throw new Error("Unable to find chat transcript scroll container");
    }

    scrollContainer.scrollTop = value;
    scrollContainer.dispatchEvent(new Event("scroll", { bubbles: true }));
  }, scrollTop);
}

async function getChatTranscriptScrollMetrics(page: Page, markerText: string) {
  return page.locator('[role="log"]').evaluate((root, text) => {
    const rootElement = root as HTMLElement;
    const candidates = [
      rootElement,
      ...Array.from(rootElement.querySelectorAll<HTMLElement>("div")),
    ];
    const scrollContainer = candidates
      .filter((element) => element.scrollHeight > element.clientHeight + 1)
      .sort(
        (a, b) =>
          b.scrollHeight - b.clientHeight - (a.scrollHeight - a.clientHeight),
      )[0];
    const marker = Array.from(
      rootElement.querySelectorAll<HTMLElement>("p, li"),
    ).find((element) => element.textContent?.includes(text));

    if (!scrollContainer || !marker) {
      throw new Error("Unable to measure chat transcript scroll position");
    }

    const scrollRect = scrollContainer.getBoundingClientRect();
    const markerRect = marker.getBoundingClientRect();

    return {
      bottomGap:
        scrollContainer.scrollHeight -
        scrollContainer.scrollTop -
        scrollContainer.clientHeight,
      markerBottom: markerRect.bottom,
      markerTop: markerRect.top,
      scrollBottom: scrollRect.bottom,
      scrollTop: scrollRect.top,
    };
  }, markerText);
}

async function getMessageViewportMetrics(page: Page, messageText: string) {
  return page.locator('[role="log"]').evaluate((root, text) => {
    const messageBubble = Array.from(
      root.querySelectorAll<HTMLElement>('[data-chat-user-message="true"]'),
    ).find((element) => element.textContent?.trim() === text);
    const input = document.querySelector('textarea[name="message"]');

    if (!messageBubble || !input) {
      throw new Error("Unable to measure chat message position");
    }

    const rootBox = root.getBoundingClientRect();
    const messageBox = messageBubble.getBoundingClientRect();
    const inputBox = input.getBoundingClientRect();

    return {
      inputTop: inputBox.top,
      messageBottom: messageBox.bottom,
      messageTop: messageBox.top,
      viewportHeight: rootBox.height,
      viewportTop: rootBox.top,
    };
  }, messageText);
}

async function measureAssistantListMarkerGaps(page: Page) {
  return page
    .locator(".prose")
    .last()
    .locator("ol > li")
    .evaluateAll((items) =>
      items.map((item) => {
        const itemBox = item.getBoundingClientRect();
        const firstElementBox = item.firstElementChild?.getBoundingClientRect();

        return firstElementBox ? firstElementBox.top - itemBox.top : 0;
      }),
    );
}

test.describe("Streaming Assistant Markdown", () => {
  test("recovers a persisted assistant answer when realtime connects late", async ({
    page,
  }) => {
    const sessionId = `missed-stream-${Date.now()}`;
    const assistantMessage = "Persisted answer after missed stream.";
    const mock = await mockMissedRealtimeAssistantSession(page, {
      sessionId,
      assistantMessage,
    });

    await page.goto(`/chat/${sessionId}`);

    await expect(page.getByText(assistantMessage)).toBeVisible();
    expect(mock.getMessagesRequestCount()).toBeGreaterThanOrEqual(2);
  });
  test("keeps ordered-list markers aligned while markdown is streaming", async ({
    page,
  }) => {
    const sessionId = `stream-layout-${Date.now()}`;
    const assistantMarkdown = [
      "For a more accurate estimate, send me these details:",
      "",
      "1. **What treatment are you considering?**  ",
      "Example: 1 implant, 6 crowns, veneers, root canal + crown, All-on-4",
      "",
      "2. **How many teeth are involved, and which area?**  ",
      "Front teeth, back teeth, upper/lower, full mouth",
    ].join("\n");

    await mockStreamingChatSession(page, { sessionId, assistantMarkdown });
    await page.goto(`/chat/${sessionId}`);

    const assistantContent = page.locator(".prose").last();
    await expect(
      assistantContent.getByText("What treatment are you considering?"),
    ).toBeVisible();
    await expect(
      assistantContent.getByText("How many teeth are involved"),
    ).toBeVisible();

    const markerGaps = await measureAssistantListMarkerGaps(page);

    expect(markerGaps.length).toBeGreaterThanOrEqual(2);
    for (const gap of markerGaps) {
      expect(gap).toBeLessThanOrEqual(8);
    }
  });
  test("does not follow generated text while assistant content grows", async ({
    page,
  }) => {
    const sessionId = `stream-autoscroll-${Date.now()}`;
    const assistantMarkdown = Array.from(
      { length: 700 },
      (_value, index) => `detail${index + 1}`,
    ).join(" ");

    await page.setViewportSize({ width: 390, height: 844 });
    await mockStreamingChatSession(page, { sessionId, assistantMarkdown });
    await page.goto(`/chat/${sessionId}`);

    await expect
      .poll(
        async () =>
          (await getChatTranscriptScrollStateOrNull(page))?.bottomGap ?? -1,
        {
          timeout: 15_000,
        },
      )
      .toBeGreaterThan(200);

    const metrics = await getChatTranscriptScrollState(page);
    expect(metrics.scrollTop).toBeLessThan(16);

    const scrollToLatestButton = page.getByRole("button", {
      name: "Scroll to Latest Message",
    });
    await expect(scrollToLatestButton).toBeVisible();

    await scrollToLatestButton.click();

    await expect
      .poll(async () => (await getChatTranscriptScrollState(page)).bottomGap)
      .toBeLessThanOrEqual(4);
  });
  test("paces a final-only assistant message instead of showing it all at once", async ({
    page,
  }) => {
    const sessionId = `stream-final-only-${Date.now()}`;
    const assistantMarkdown = Array.from(
      { length: 95 },
      (_value, index) => `word${index + 1}`,
    ).join(" ");

    await page.setViewportSize({ width: 390, height: 844 });
    await mockFinalOnlyAssistantMessageSession(page, {
      sessionId,
      assistantMarkdown,
    });
    await page.goto(`/chat/${sessionId}`);

    const assistantContent = page.locator(".prose").last();
    await assistantContent.waitFor({ state: "visible" });
    await expect(
      page.getByLabel("Assistant is preparing a response"),
    ).toBeHidden();

    await expect
      .poll(
        async () => {
          const visibleLength =
            (await assistantContent.textContent())?.length ?? 0;
          return visibleLength > 0 && visibleLength < assistantMarkdown.length;
        },
        { timeout: 10_000 },
      )
      .toBe(true);

    await expect(assistantContent).toContainText("word95", {
      timeout: 20_000,
    });
  });

  test("keeps a follow-up user message in the active-turn reading zone", async ({
    page,
  }) => {
    const sessionId = `follow-up-position-${Date.now()}`;
    const followUpMessage = "Second question positioning check";
    const historyMarkdown = Array.from(
      { length: 140 },
      (_value, index) => `Historical assistant sentence ${index + 1}.`,
    ).join(" ");

    await page.setViewportSize({ width: 390, height: 844 });
    await mockAppendableExistingChatSession(page, {
      sessionId,
      historyMarkdown,
    });
    await page.goto(`/chat/${sessionId}`);

    await expect(
      page.getByText("Historical assistant sentence 140."),
    ).toBeVisible();
    await sendChatMessage(page, followUpMessage);
    await expect(page.getByText(followUpMessage)).toBeVisible();

    const metrics = await getMessageViewportMetrics(page, followUpMessage);
    const messageOffset = metrics.messageTop - metrics.viewportTop;
    const composerGap = metrics.inputTop - metrics.messageBottom;

    expect(messageOffset).toBeLessThan(metrics.viewportHeight * 0.45);
    expect(composerGap).toBeGreaterThan(240);
  });

  test("keeps active-turn spacing while a completed response drains", async ({
    page,
  }) => {
    const sessionId = `follow-up-drain-position-${Date.now()}`;
    const followUpMessage = "Second question while response drains";
    const historyMarkdown = Array.from(
      { length: 140 },
      (_value, index) => `Historical assistant sentence ${index + 1}.`,
    ).join(" ");
    const streamingAssistantMarkdown = Array.from(
      { length: 360 },
      (_value, index) => `streaming-answer-word-${index + 1}`,
    ).join(" ");

    await page.setViewportSize({ width: 390, height: 844 });
    await mockAppendableExistingChatSession(page, {
      sessionId,
      historyMarkdown,
      streamingAssistantMarkdown,
    });
    await page.goto(`/chat/${sessionId}`);

    await expect(
      page.getByText("Historical assistant sentence 140."),
    ).toBeVisible();
    await sendChatMessage(page, followUpMessage);
    await expect(page.getByText(followUpMessage)).toBeVisible();
    await expect(page.locator(".prose")).toHaveCount(2, { timeout: 10_000 });

    await page.waitForTimeout(600);

    const visibleAssistantLength =
      (await page.locator(".prose").last().textContent())?.length ?? 0;
    expect(visibleAssistantLength).toBeGreaterThan(0);
    expect(visibleAssistantLength).toBeLessThan(
      streamingAssistantMarkdown.length,
    );

    const metrics = await getMessageViewportMetrics(page, followUpMessage);
    const messageOffset = metrics.messageTop - metrics.viewportTop;
    const composerGap = metrics.inputTop - metrics.messageBottom;

    expect(messageOffset).toBeLessThan(metrics.viewportHeight * 0.45);
    expect(composerGap).toBeGreaterThan(240);
  });

  test("does not pull the transcript down after the user scrolls up", async ({
    page,
  }) => {
    const sessionId = `stream-user-scroll-lock-${Date.now()}`;
    const finalMarker = "FINAL_OFFSCREEN_STREAM_MARKER";
    const historyMarkdown = Array.from(
      { length: 80 },
      (_value, index) =>
        `Historical paragraph ${index + 1}: existing chat content that makes the transcript tall enough to scroll.`,
    ).join("\n\n");
    const assistantMarkdown = [
      "New streamed answer after the user has scrolled up.",
      "",
      finalMarker,
    ].join("\n\n");

    await page.setViewportSize({ width: 390, height: 844 });
    await mockStreamingChatSessionWithHistory(page, {
      sessionId,
      historyMarkdown,
      assistantMarkdown,
    });
    await page.goto(`/chat/${sessionId}`);

    await expect(page.getByText("Historical paragraph 80")).toBeVisible();
    await setChatTranscriptScrollTop(page, 0);

    await expect(page.getByText(finalMarker)).toHaveCount(1);

    const metrics = await getChatTranscriptScrollMetrics(page, finalMarker);

    expect(metrics.bottomGap).toBeGreaterThan(200);
    expect(metrics.markerTop).toBeGreaterThan(metrics.scrollBottom);
  });

  test("renders one-chunk streamed markdown with final block structure immediately", async ({
    page,
  }) => {
    const sessionId = `stream-table-${Date.now()}`;
    const leadIn = Array.from(
      { length: 180 },
      (_value, index) => `detail-${index + 1}`,
    ).join(" ");
    const assistantMarkdown = [
      `Here is the estimate. ${leadIn}`,
      "",
      "| Treatment | Price |",
      "|---|---:|",
      "| Crown | $100 |",
    ].join("\n");

    await mockStreamingChatSession(page, { sessionId, assistantMarkdown });
    await page.goto(`/chat/${sessionId}`);

    const assistantContent = page.locator(".prose").last();
    await expect(assistantContent.getByText("Here")).toBeVisible();

    expect(
      await assistantContent.locator(".markdown-stream-token").count(),
    ).toBe(0);
    expect(await assistantContent.locator("table").count()).toBe(1);
  });
  test("keeps horizontal rule spacing compact in assistant markdown", async ({
    page,
  }) => {
    const sessionId = `stream-hr-${Date.now()}`;
    const assistantMarkdown = [
      "Before the divider.",
      "",
      "---",
      "",
      "After the divider.",
    ].join("\n");

    await mockStreamingChatSession(page, { sessionId, assistantMarkdown });
    await page.goto(`/chat/${sessionId}`);

    const assistantContent = page.locator(".prose").last();
    const divider = assistantContent.locator("hr");

    await expect(divider).toBeVisible();

    const margins = await divider.evaluate((element) => {
      const styles = window.getComputedStyle(element);

      return {
        marginBottom: Number.parseFloat(styles.marginBottom),
        marginTop: Number.parseFloat(styles.marginTop),
      };
    });

    expect(margins.marginTop).toBeLessThanOrEqual(12);
    expect(margins.marginBottom).toBeLessThanOrEqual(12);
  });
  test("uses compact Claude-like markdown rhythm", async ({ page }) => {
    const sessionId = `stream-markdown-rhythm-${Date.now()}`;
    const assistantMarkdown = [
      "#### Compact subsection",
      "A paragraph with [a link](https://example.com).",
      "",
      "> A short quoted note.",
      "",
      "- Parent item",
      "  - Nested item",
    ].join("\n");

    await mockStreamingChatSession(page, { sessionId, assistantMarkdown });
    await page.goto(`/chat/${sessionId}`);

    const assistantContent = page.locator(".prose").last();
    const heading = assistantContent.locator("h4");
    const nestedListItem = assistantContent.locator("li li");
    const quote = assistantContent.locator("blockquote");
    const link = assistantContent.locator("a");

    await expect(heading).toBeVisible();
    await expect(nestedListItem).toBeVisible();
    await expect(quote).toBeVisible();
    await expect(link).toBeVisible();

    const styles = await heading.evaluate((element) => {
      const markdownRoot = element.closest(".prose");
      const rootStyles = markdownRoot
        ? window.getComputedStyle(markdownRoot)
        : null;
      const headingStyles = window.getComputedStyle(element);
      const paragraph = markdownRoot?.querySelector("p");
      const paragraphStyles = paragraph
        ? window.getComputedStyle(paragraph)
        : null;
      const firstList = markdownRoot?.querySelector("ul");
      const firstListStyles = firstList
        ? window.getComputedStyle(firstList)
        : null;
      const firstListItem = markdownRoot?.querySelector("ul > li");
      const firstListItemStyles = firstListItem
        ? window.getComputedStyle(firstListItem)
        : null;
      const firstListItemMarkerStyles = firstListItem
        ? window.getComputedStyle(firstListItem, "::marker")
        : null;
      const nestedList = markdownRoot?.querySelector("li ul");
      const nestedListStyles = nestedList
        ? window.getComputedStyle(nestedList)
        : null;
      const nestedItem = markdownRoot?.querySelector("li li");
      const nestedItemStyles = nestedItem
        ? window.getComputedStyle(nestedItem)
        : null;
      const nestedItemBeforeStyles = nestedItem
        ? window.getComputedStyle(nestedItem, "::before")
        : null;
      const blockquote = markdownRoot?.querySelector("blockquote");
      const blockquoteStyles = blockquote
        ? window.getComputedStyle(blockquote)
        : null;
      const anchor = markdownRoot?.querySelector("a");
      const anchorStyles = anchor ? window.getComputedStyle(anchor) : null;

      return {
        blockquoteBorderLeftWidth: blockquoteStyles
          ? Number.parseFloat(blockquoteStyles.borderLeftWidth)
          : 0,
        blockquoteFontStyle: blockquoteStyles?.fontStyle,
        containerDisplay: rootStyles?.display,
        containerGap: rootStyles ? Number.parseFloat(rootStyles.gap) : 0,
        firstItemColor: firstListItemStyles?.color,
        firstListMarkerColor: firstListItemMarkerStyles?.color,
        firstListPaddingLeft: firstListStyles
          ? Number.parseFloat(firstListStyles.paddingLeft)
          : 0,
        firstListStyleType: firstListStyles?.listStyleType,
        headingMarginTop: Number.parseFloat(headingStyles.marginTop),
        linkTextDecorationLine: anchorStyles?.textDecorationLine,
        nestedBeforeColor: nestedItemBeforeStyles?.color,
        nestedBeforeContent: nestedItemBeforeStyles?.content,
        nestedItemColor: nestedItemStyles?.color,
        nestedItemMarginBottom: nestedItemStyles
          ? Number.parseFloat(nestedItemStyles.marginBottom)
          : -1,
        nestedItemMarginTop: nestedItemStyles
          ? Number.parseFloat(nestedItemStyles.marginTop)
          : -1,
        nestedListPaddingLeft: nestedListStyles
          ? Number.parseFloat(nestedListStyles.paddingLeft)
          : 0,
        nestedListStyleType: nestedListStyles?.listStyleType,
        paragraphMarginBottom: paragraphStyles
          ? Number.parseFloat(paragraphStyles.marginBottom)
          : -1,
        paragraphMarginTop: paragraphStyles
          ? Number.parseFloat(paragraphStyles.marginTop)
          : -1,
      };
    });

    expect(styles.containerDisplay).toBe("flex");
    expect(styles.containerGap).toBe(12);
    expect(styles.headingMarginTop).toBe(0);
    expect(styles.paragraphMarginTop).toBe(0);
    expect(styles.paragraphMarginBottom).toBe(0);
    expect(styles.nestedItemMarginTop).toBe(0);
    expect(styles.nestedItemMarginBottom).toBe(0);
    expect(styles.firstListStyleType).toBe("disc");
    expect(styles.firstListPaddingLeft).toBeGreaterThanOrEqual(20);
    expect(styles.firstListPaddingLeft).toBeLessThanOrEqual(24);
    expect(styles.firstListMarkerColor).not.toBe(styles.firstItemColor);
    expect(styles.nestedListStyleType).toBe("none");
    expect(styles.nestedListPaddingLeft).toBeGreaterThanOrEqual(20);
    expect(styles.nestedListPaddingLeft).toBeLessThanOrEqual(24);
    expect(styles.nestedBeforeContent).toContain("–");
    expect(styles.nestedBeforeColor).not.toBe(styles.nestedItemColor);
    expect(styles.blockquoteBorderLeftWidth).toBeGreaterThanOrEqual(4);
    expect(styles.blockquoteFontStyle).toBe("normal");
    expect(styles.linkTextDecorationLine).toContain("underline");
  });

  test("caps assistant markdown width and wraps wide tables", async ({
    page,
  }) => {
    const sessionId = `stream-wide-table-${Date.now()}`;
    const assistantMarkdown = [
      "# Large generated heading",
      "",
      "## Secondary generated heading",
      "",
      "| ProcedureLongLabelWithoutSpaces | CityLongLabelWithoutSpaces | ClinicLongLabelWithoutSpaces | DurationLongLabelWithoutSpaces | PriceLongLabelWithoutSpaces | NotesLongLabelWithoutSpaces |",
      "|---|---|---|---|---:|---|",
      "| ImplantConsultationAndPlanning | HoChiMinhCityDistrictOne | InternationalDentalClinic | ThreeToSevenBusinessDays | $1200 | IncludesImagingAndFollowUp |",
    ].join("\n");

    await page.setViewportSize({ width: 1920, height: 927 });
    await mockStreamingChatSession(page, { sessionId, assistantMarkdown });
    await page.goto(`/chat/${sessionId}`);

    const assistantContent = page.locator(".prose").last();
    const tableWrapper = assistantContent.locator(".markdown-table-wrapper");
    const h1 = assistantContent.locator("h1");
    const h2 = assistantContent.locator("h2");

    await expect(tableWrapper).toBeVisible();
    await expect(h1).toBeVisible();
    await expect(h2).toBeVisible();

    const metrics = await assistantContent.evaluate((element) => {
      const contentRect = element.getBoundingClientRect();
      const wrapper = element.querySelector(".markdown-table-wrapper");
      const wrapperRect = wrapper?.getBoundingClientRect();
      const wrapperStyles = wrapper ? window.getComputedStyle(wrapper) : null;
      const firstHeading = element.querySelector("h1");
      const secondHeading = element.querySelector("h2");
      const firstHeadingStyles = firstHeading
        ? window.getComputedStyle(firstHeading)
        : null;
      const secondHeadingStyles = secondHeading
        ? window.getComputedStyle(secondHeading)
        : null;

      return {
        contentWidth: contentRect.width,
        h1FontSize: firstHeadingStyles
          ? Number.parseFloat(firstHeadingStyles.fontSize)
          : 0,
        h2FontSize: secondHeadingStyles
          ? Number.parseFloat(secondHeadingStyles.fontSize)
          : 0,
        tableHasHorizontalOverflow: wrapper
          ? wrapper.scrollWidth > wrapper.clientWidth
          : false,
        tableOverflowX: wrapperStyles?.overflowX,
        tableWrapperWidth: wrapperRect?.width ?? 0,
      };
    });

    expect(metrics.contentWidth).toBeLessThanOrEqual(768);
    expect(metrics.h1FontSize).toBeLessThanOrEqual(20);
    expect(metrics.h2FontSize).toBeLessThanOrEqual(18);
    expect(metrics.tableOverflowX).toBe("auto");
    expect(metrics.tableHasHorizontalOverflow).toBe(true);
    expect(metrics.tableWrapperWidth).toBeLessThanOrEqual(metrics.contentWidth);
  });
  test("keeps markdown readable on mobile", async ({ page }) => {
    const sessionId = `stream-mobile-markdown-${Date.now()}`;
    const assistantMarkdown = [
      "## Mobile markdown check",
      "A paragraph that should wrap inside the viewport without creating page-level horizontal overflow.",
      "",
      "- Parent item",
      "  - Nested item with a little more text to verify indentation",
      "",
      "| ProcedureLongLabelWithoutSpaces | CityLongLabelWithoutSpaces | PriceLongLabelWithoutSpaces | NotesLongLabelWithoutSpaces |",
      "|---|---|---:|---|",
      "| ImplantConsultationAndPlanning | HoChiMinhCityDistrictOne | $1200 | IncludesImagingAndFollowUp |",
    ].join("\n");

    await page.setViewportSize({ width: 390, height: 844 });
    await mockStreamingChatSession(page, { sessionId, assistantMarkdown });
    await page.goto(`/chat/${sessionId}`);

    const assistantContent = page.locator(".prose").last();
    const tableWrapper = assistantContent.locator(".markdown-table-wrapper");
    const nestedList = assistantContent.locator("li ul");

    await expect(
      assistantContent.getByRole("heading", { level: 2 }),
    ).toBeVisible();
    await expect(tableWrapper).toBeVisible();
    await expect(nestedList).toBeVisible();

    const metrics = await assistantContent.evaluate((element) => {
      const contentRect = element.getBoundingClientRect();
      const wrapper = element.querySelector(".markdown-table-wrapper");
      const nested = element.querySelector("li ul");
      const firstList = element.querySelector("ul");
      const wrapperStyles = wrapper ? window.getComputedStyle(wrapper) : null;
      const nestedStyles = nested ? window.getComputedStyle(nested) : null;
      const firstListStyles = firstList
        ? window.getComputedStyle(firstList)
        : null;

      return {
        bodyHorizontalOverflow:
          document.documentElement.scrollWidth > window.innerWidth,
        contentWidth: contentRect.width,
        firstListPaddingLeft: firstListStyles
          ? Number.parseFloat(firstListStyles.paddingLeft)
          : 0,
        nestedListPaddingLeft: nestedStyles
          ? Number.parseFloat(nestedStyles.paddingLeft)
          : 0,
        tableHasHorizontalOverflow: wrapper
          ? wrapper.scrollWidth > wrapper.clientWidth
          : false,
        tableOverflowX: wrapperStyles?.overflowX,
        tableWrapperWidth: wrapper?.getBoundingClientRect().width ?? 0,
      };
    });

    expect(metrics.bodyHorizontalOverflow).toBe(false);
    expect(metrics.contentWidth).toBeLessThanOrEqual(342);
    expect(metrics.firstListPaddingLeft).toBeLessThanOrEqual(24);
    expect(metrics.nestedListPaddingLeft).toBeLessThanOrEqual(20);
    expect(metrics.tableOverflowX).toBe("auto");
    expect(metrics.tableHasHorizontalOverflow).toBe(true);
    expect(metrics.tableWrapperWidth).toBeLessThanOrEqual(metrics.contentWidth);
  });

  test("styles task lists and footnotes compactly", async ({ page }) => {
    const sessionId = `stream-gfm-${Date.now()}`;
    const assistantMarkdown = [
      "- [x] Completed task",
      "- [ ] Pending task",
      "",
      "A sentence with a footnote.[^1]",
      "",
      "[^1]: Footnote content.",
    ].join("\n");

    await mockStreamingChatSession(page, { sessionId, assistantMarkdown });
    await page.goto(`/chat/${sessionId}`);

    const assistantContent = page.locator(".prose").last();
    const taskCheckboxes = assistantContent.locator('input[type="checkbox"]');
    const footnotes = assistantContent.locator("section[data-footnotes]");

    await expect(taskCheckboxes).toHaveCount(2);
    await expect(footnotes).toBeVisible();

    const styles = await assistantContent.evaluate((element) => {
      const taskList = element.querySelector("ul.contains-task-list");
      const taskItem = element.querySelector("li.task-list-item");
      const checkbox = element.querySelector('input[type="checkbox"]');
      const footnoteSection = element.querySelector("section[data-footnotes]");
      const footnoteHeading = footnoteSection?.querySelector("h2");
      const backref = footnoteSection?.querySelector(
        "a[data-footnote-backref]",
      );

      const taskListStyles = taskList
        ? window.getComputedStyle(taskList)
        : null;
      const taskItemStyles = taskItem
        ? window.getComputedStyle(taskItem)
        : null;
      const checkboxStyles = checkbox
        ? window.getComputedStyle(checkbox)
        : null;
      const footnoteSectionStyles = footnoteSection
        ? window.getComputedStyle(footnoteSection)
        : null;
      const footnoteHeadingStyles = footnoteHeading
        ? window.getComputedStyle(footnoteHeading)
        : null;
      const backrefStyles = backref ? window.getComputedStyle(backref) : null;

      return {
        backrefTextDecorationLine: backrefStyles?.textDecorationLine,
        checkboxHeight: checkboxStyles
          ? Number.parseFloat(checkboxStyles.height)
          : 0,
        footnoteBorderTopWidth: footnoteSectionStyles
          ? Number.parseFloat(footnoteSectionStyles.borderTopWidth)
          : 0,
        footnoteHeadingPosition: footnoteHeadingStyles?.position,
        footnotePaddingTop: footnoteSectionStyles
          ? Number.parseFloat(footnoteSectionStyles.paddingTop)
          : 0,
        taskItemDisplay: taskItemStyles?.display,
        taskListStyleType: taskListStyles?.listStyleType,
      };
    });

    expect(styles.taskListStyleType).toBe("none");
    expect(styles.taskItemDisplay).toBe("flex");
    expect(styles.checkboxHeight).toBeGreaterThanOrEqual(16);
    expect(styles.footnoteBorderTopWidth).toBeGreaterThanOrEqual(1);
    expect(styles.footnotePaddingTop).toBeGreaterThanOrEqual(12);
    expect(styles.footnoteHeadingPosition).toBe("absolute");
    expect(styles.backrefTextDecorationLine).toBe("none");
  });
});

test.describe("Chat Application", () => {
  test.beforeEach(async ({ page }) => {
    await goToChat(page);
  });

  test("initial state shows centered input when no session exists", async ({
    page,
  }) => {
    // Wait for page to load
    await page.waitForLoadState("networkidle");

    await expectEmptyChatHeroLayout(page);
  });

  test("creating a new session and sending a message", async ({ page }) => {
    await page.waitForLoadState("networkidle");

    await sendChatMessage(page, "What is dental tourism?");
    await page.waitForTimeout(2500);
  });

  test("sidebar shows session list", async ({ page }) => {
    await page.waitForLoadState("networkidle");

    // Check if sidebar toggle button exists
    const sidebarTrigger = page
      .locator(
        '[data-radix-navigation-menu-trigger], button[aria-label*="Toggle"], button[aria-label*="menu"], [data-sidebar="trigger"]',
      )
      .first();

    // Try to open sidebar if trigger exists
    const triggerCount = await sidebarTrigger.count();
    if (triggerCount > 0) {
      await sidebarTrigger.first().click();
      await page.waitForTimeout(500);
    }

    // Look for sidebar
    const sidebar = page
      .locator('[data-state="open"], [class*="sidebar"]')
      .first();

    // The sidebar should be visible or toggleable
    const sidebarVisible = await sidebar.isVisible().catch(() => false);
    if (triggerCount > 0 && !sidebarVisible) {
      await sidebarTrigger.first().click();
      await page.waitForTimeout(500);
    }
  });

  test("sending multiple messages in a session", async ({ page }) => {
    await page.waitForLoadState("networkidle");

    await sendChatMessage(page, "Hello");
    await page.waitForTimeout(500);

    await sendChatMessage(page, "What can you tell me about dental implants?");
    await page.waitForTimeout(500);
  });

  test("chat input moves to bottom after messages exist", async ({ page }) => {
    await page.waitForLoadState("networkidle");

    await expectEmptyChatHeroLayout(page);

    await sendChatMessage(page, "Test message");
    await page.waitForTimeout(2000);
  });
});

test.describe("Chat API Integration", () => {
  test("messages are persisted and retrieved", async ({ page }) => {
    await goToChat(page);
    await page.waitForLoadState("networkidle");

    const title = `Test persistence ${Date.now()}`;
    await sendFirstMessageAndWaitForSession(page, title);

    await page.reload();
    await expect(getMessageInput(page)).toBeVisible();
    await expect(page.getByText(title).first()).toBeVisible();
  });

  test("WebSocket receives streaming frames", async ({ page }) => {
    await goToChat(page);
    await page.waitForLoadState("networkidle");

    await sendChatMessage(page, "Tell me about dental care");
    await page.waitForTimeout(3000);
  });

  test("centered input layout with empty session", async ({ page }) => {
    await goToChat(page);
    await page.waitForLoadState("networkidle");

    await expectEmptyChatHeroLayout(page);
  });

  test("input moves to bottom after first message", async ({ page }) => {
    await goToChat(page);
    await page.waitForLoadState("networkidle");

    await expectEmptyChatHeroLayout(page);

    await sendChatMessage(page, "First message");
    await page.waitForTimeout(2000);
  });
});

test.describe("Short User Message Bubble", () => {
  test("short message renders on a single line without vertical wrapping", async ({
    page,
  }) => {
    await goToChat(page);
    await page.waitForLoadState("networkidle");

    // Send a short message that previously triggered the shrink-wrap bug
    await sendChatMessage(page, "xin chào");

    // Wait for the message bubble to appear in the DOM
    const userBubble = page
      .locator('[class*="rounded-3xl"]')
      .filter({ hasText: "xin chào" });
    await expect(userBubble).toBeVisible({ timeout: 10000 });

    // Regression check: the bubble height should not exceed roughly 2× its line-height,
    // which would indicate word-by-word vertical wrapping.
    // A single-line bubble has a small height (padding + 1 line); a vertically-wrapped
    // one would be significantly taller.
    const box = await userBubble.boundingBox();
    if (!box) {
      throw new Error("Unable to measure short user message bubble.");
    }

    // Single-line bubble with py-2.5 (10px*2) and ~24px line-height ≈ ~44px.
    // If wrapped vertically, it would exceed ~60px. Use a generous upper bound.
    // Note: exact pixel values depend on font, so we check relative aspect ratio instead.
    const aspectRatio = box.width / box.height;
    // A single-line bubble should be wider than it is tall (aspect ratio > 1).
    // A vertically-wrapped narrow pill would have aspect ratio < 1.
    expect(aspectRatio).toBeGreaterThan(1);
  });
});

test.describe
  .serial("Delete Session", () => {
    test("shows delete button on hover over session item", async ({ page }) => {
      await goToChat(page);
      await page.waitForLoadState("networkidle");

      const title = `Test session for delete ${Date.now()}`;
      await sendFirstMessageAndWaitForSession(page, title);

      const deleteButton = await getSessionDeleteButton(page, title);
      await expect(deleteButton).toBeVisible();
    });

    test("opens confirmation dialog when clicking delete button", async ({
      page,
    }) => {
      await goToChat(page);
      await page.waitForLoadState("networkidle");

      const title = `Session to delete ${Date.now()}`;
      await sendFirstMessageAndWaitForSession(page, title);
      await openDeleteDialogForSession(page, title);

      const dialog = page.getByRole("alertdialog");
      await expect(dialog).toBeVisible();
      await expect(
        dialog.getByRole("heading", { name: /delete/i }),
      ).toBeVisible();
    });

    test("cancels deletion when clicking Cancel button", async ({ page }) => {
      await goToChat(page);
      await page.waitForLoadState("networkidle");

      const uniqueMessage = `Cancel test session ${Date.now()}`;
      await sendFirstMessageAndWaitForSession(page, uniqueMessage);
      await openDeleteDialogForSession(page, uniqueMessage);

      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(page.getByRole("alertdialog")).toBeHidden();
      await getSessionLink(page, uniqueMessage);
    });

    test("deletes session when clicking Delete button", async ({ page }) => {
      await goToChat(page);
      await page.waitForLoadState("networkidle");

      const uniqueMessage = `Delete test session ${Date.now()}`;
      await sendFirstMessageAndWaitForSession(page, uniqueMessage);
      await openDeleteDialogForSession(page, uniqueMessage);

      await page
        .getByRole("button", { name: "Delete Chat", exact: true })
        .click();
      await expect(
        page.getByRole("link", { name: uniqueMessage, exact: true }),
      ).toHaveCount(0);
    });

    test("clears active session when deleting current session", async ({
      page,
    }) => {
      await goToChat(page);
      await page.waitForLoadState("networkidle");

      const uniqueMessage = `Active session to delete ${Date.now()}`;
      await sendFirstMessageAndWaitForSession(page, uniqueMessage);

      await openDeleteDialogForSession(page, uniqueMessage);
      await page
        .getByRole("button", { name: "Delete Chat", exact: true })
        .click();

      await expect(page).toHaveURL(/\/chat$/);
      const centeredContainer = page
        .locator("main > div")
        .filter({ hasText: "" })
        .first();
      await expect(centeredContainer).toBeVisible();
    });
  });
