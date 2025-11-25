import { readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { serve } from "bun";
import index from "./index.html";

const ZHIHU_QUESTION_ID = "800718032";
const ZHIHU_FEED_URL = `https://www.zhihu.com/api/v4/questions/${ZHIHU_QUESTION_ID}/feeds`;
const ZHIHU_INCLUDE_FIELDS = "data[*].target.content";
const CUSTOM_HEADER_ENV_PREFIX = "ZHIHU_HEADER_";
const BASE_ZHIHU_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  Referer: `https://www.zhihu.com/question/${ZHIHU_QUESTION_ID}`,
};
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const log = (...args: unknown[]) => console.log("[zhihu]", ...args);
const HEADER_FILE = fileURLToPath(new URL("../data/zhihu-headers.json", import.meta.url));
const CUSTOM_ZHIHU_HEADERS = loadCustomZhihuHeaders();
if (Object.keys(CUSTOM_ZHIHU_HEADERS).length) {
  log(`including custom auth headers: ${Object.keys(CUSTOM_ZHIHU_HEADERS).join(", ")}`);
}
const ZHIHU_HEADERS = {
  ...BASE_ZHIHU_HEADERS,
  ...CUSTOM_ZHIHU_HEADERS,
};
const QUESTION_FALLBACK = {
  id: ZHIHU_QUESTION_ID,
  title: "你最近在读的书是哪一本？",
  url: `https://www.zhihu.com/question/${ZHIHU_QUESTION_ID}`,
};
const PAGE_SIZE = 10;
const MAX_PAGES = 8;
const PAGE_FETCH_DELAY_MS = 1500;
const REFRESH_INTERVAL_MS = 1000 * 60 * 15; // 15 minutes between background syncs
const DATA_DIR = fileURLToPath(new URL("../data/", import.meta.url));
const DB_FILE = fileURLToPath(new URL("../data/zhihu-comments.json", import.meta.url));

function loadCustomZhihuHeaders() {
  const headers: Record<string, string> = {};
  const applyEntry = (key: string, value: string) => {
    headers[key.toLowerCase()] = value;
  };
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith(CUSTOM_HEADER_ENV_PREFIX) || !value) {
      continue;
    }
    const headerName = key
      .slice(CUSTOM_HEADER_ENV_PREFIX.length)
      .toLowerCase()
      .replace(/_/g, "-");
    applyEntry(headerName, value);
  }

  for (const [key, value] of Object.entries(loadHeadersFromFile())) {
    if (value) {
      applyEntry(key, value);
    }
  }
  return headers;
}

function loadHeadersFromFile(): Record<string, string> {
  try {
    const raw = readFileSync(HEADER_FILE, "utf8");
    const parsed = JSON.parse(raw) as Record<string, string>;
    log(`loaded ${Object.keys(parsed).length} header overrides from data/zhihu-headers.json`);
    return parsed;
  } catch (error) {
    if (!isEnoent(error)) {
      console.warn("[zhihu] failed to parse data/zhihu-headers.json", error);
    }
    return {};
  }
}

type ZhihuAuthor = {
  name: string;
  headline?: string;
  avatar_url?: string;
  url?: string;
  url_token?: string;
};

type ZhihuQuestion = {
  id: string;
  title: string;
  url?: string;
};

type ZhihuAnswer = {
  id: string;
  excerpt?: string;
  content?: string;
  comment_count?: number;
  voteup_count?: number;
  thanks_count?: number;
  created_time?: number;
  url: string;
  author?: ZhihuAuthor;
  question?: ZhihuQuestion;
};

type ZhihuFeedItem = {
  target_type: string;
  target: ZhihuAnswer;
};

type ZhihuFeedResponse = {
  data: ZhihuFeedItem[];
  paging?: {
    is_end?: boolean;
    next?: string;
    need_force_login?: boolean;
  };
};

type ZhihuErrorResponse = {
  error: {
    message: string;
    code?: number;
  };
};

type ZhihuCommentsResponse = {
  question: {
    id: string;
    title: string;
    url: string;
  };
  comments: Array<{
    id: string;
    author: {
      name: string;
      headline: string;
      avatarUrl: string;
      profileUrl: string;
    };
    excerpt: string;
    contentText: string;
    voteupCount: number;
    commentCount: number;
    thanksCount: number;
    createdAt: number;
    answerUrl: string;
  }>;
  fetchedAt: string;
  total: number;
};

let latestData: ZhihuCommentsResponse | null = null;
let refreshPromise: Promise<void> | null = null;
let initPromise: Promise<void> | null = null;
let lastRefreshTime = 0;

const server = serve({
  routes: {
    // Serve index.html for all unmatched routes.
    "/*": index,

    "/api/zhihu/comments": {
      async GET() {
        await ensureInitialized();
        const payload = await getStoredComments();
        if (!payload) {
          return Response.json(
            {
              error: "暂时没有缓存的知乎数据，请稍后再试。",
            },
            { status: 503 },
          );
        }
        return Response.json(payload, {
          headers: {
            "Cache-Control": "public, max-age=120",
          },
        });
      },
    },

    "/api/zhihu/refresh": {
      async POST() {
        await ensureInitialized();
        try {
          await refreshFromZhihu(true);
          return Response.json({
            ok: true,
            refreshedAt: latestData?.fetchedAt ?? new Date().toISOString(),
            total: latestData?.total ?? 0,
          });
        } catch (error) {
          console.error("[zhihu] manual refresh failed", error);
          return Response.json(
            {
              error: "刷新知乎数据失败，请稍后重试。",
            },
            { status: 502 },
          );
        }
      },
    },
  },

  development: process.env.NODE_ENV !== "production" && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
});

ensureInitialized().catch(error => {
  console.error("[zhihu] failed to initialize data store", error);
});

async function ensureInitialized() {
  if (!initPromise) {
    log("initializing data store…");
    initPromise = initDataStore();
  }
  return initPromise;
}

async function initDataStore() {
  log("preparing cache directory", DATA_DIR);
  await ensureDataDir();
  try {
    const stored = await loadFromDisk();
    if (stored) {
      latestData = stored;
      lastRefreshTime = Date.parse(stored.fetchedAt) || 0;
      log(`loaded ${stored.comments.length} cached answers from disk`);
    }
  } catch (error) {
    console.error("[zhihu] cannot read cached data", error);
  }

  try {
    log("performing initial fetch from Zhihu…");
    await refreshFromZhihu(true);
  } catch (error) {
    console.error("[zhihu] initial refresh failed", error);
  }

  const interval = setInterval(() => {
    refreshFromZhihu().catch(err => console.error("[zhihu] background refresh failed", err));
  }, REFRESH_INTERVAL_MS);
  const maybeInterval = interval as unknown as { unref?: () => void };
  maybeInterval.unref?.();
  log(`background refresh scheduled every ${Math.round(REFRESH_INTERVAL_MS / 60000)} minutes`);
}

async function getStoredComments(): Promise<ZhihuCommentsResponse | null> {
  if (latestData) {
    log("serving comments from memory cache");
    return latestData;
  }
  const stored = await loadFromDisk();
  if (stored) {
    latestData = stored;
    lastRefreshTime = Date.parse(stored.fetchedAt) || lastRefreshTime;
    log("memory cache cold, loaded data from disk");
  }
  return stored;
}

async function refreshFromZhihu(force = false) {
  const now = Date.now();
  if (!force && latestData && now - lastRefreshTime < REFRESH_INTERVAL_MS - 60_000) {
    log("refresh skipped (recently synced)");
    return;
  }

  if (refreshPromise) {
    log("refresh already in progress, awaiting existing run");
    return refreshPromise;
  }

  log(force ? "manual refresh triggered" : "starting background refresh");
  refreshPromise = (async () => {
    const feed = await fetchZhihuFeed();
    const payload = buildCommentsResponse(feed);
    latestData = payload;
    lastRefreshTime = Date.now();
    log(`fetched ${payload.comments.length} answers, writing to disk`);
    await persistToDisk(payload);
  })();

  try {
    await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true });
}

async function loadFromDisk(): Promise<ZhihuCommentsResponse | null> {
  try {
    const raw = await readFile(DB_FILE, "utf8");
    return JSON.parse(raw) as ZhihuCommentsResponse;
  } catch (error) {
    if (isEnoent(error)) {
      log("no cache file on disk yet");
      return null;
    }
    console.error("[zhihu] failed to load cache file", error);
    return null;
  }
}

function isEnoent(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "ENOENT");
}

async function persistToDisk(data: ZhihuCommentsResponse) {
  await ensureDataDir();
  log(`saving ${data.comments.length} answers to ${DB_FILE}`);
  await writeFile(DB_FILE, JSON.stringify(data, null, 2), "utf8");
}

async function fetchZhihuFeed(): Promise<ZhihuFeedResponse> {
  const aggregated: ZhihuFeedResponse = { data: [] };
  let nextUrl: string | null = null;

  for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex++) {
    const requestUrl = buildFeedUrl(nextUrl);
    log(`fetching Zhihu page ${pageIndex + 1}${nextUrl ? " via cursor" : ""}`);
    const response = await fetch(requestUrl, {
      headers: ZHIHU_HEADERS,
    });

    if (!response.ok) {
      throw new Error(`Zhihu API error: ${response.status} ${response.statusText}`);
    }

    const chunk = (await response.json()) as ZhihuFeedResponse | ZhihuErrorResponse;
    if (isZhihuError(chunk)) {
      throw new Error(`Zhihu API error: ${chunk.error.message}`);
    }

    aggregated.data.push(...chunk.data);
    log(`page ${pageIndex + 1} returned ${chunk.data.length} items (accumulated ${aggregated.data.length})`);

    const paging = chunk.paging;
    if (!paging || paging.is_end || !paging.next) {
      if (paging?.need_force_login) {
        console.warn("[zhihu] paging requires login, stopped fetching further pages");
      }
      log("no more pages available from Zhihu API");
      break;
    }

    if (paging.need_force_login) {
      console.warn("[zhihu] paging requires login, stopped fetching further pages");
      break;
    }

    nextUrl = paging.next;
    log(`queued next page cursor, waiting ${PAGE_FETCH_DELAY_MS}ms before continuing`);
    await delay(PAGE_FETCH_DELAY_MS);
  }

  return aggregated;
}

function buildFeedUrl(nextUrl: string | null) {
  if (nextUrl) {
    return nextUrl;
  }
  const url = new URL(ZHIHU_FEED_URL);
  url.searchParams.set("include", ZHIHU_INCLUDE_FIELDS);
  url.searchParams.set("limit", `${PAGE_SIZE}`);
  url.searchParams.set("offset", "0");
  url.searchParams.set("platform", "desktop");
  return url.toString();
}

function isZhihuError(data: ZhihuFeedResponse | ZhihuErrorResponse): data is ZhihuErrorResponse {
  return "error" in data;
}

function buildCommentsResponse(feed: ZhihuFeedResponse): ZhihuCommentsResponse {
  const seen = new Set<string>();
  const comments = feed.data
    .filter(item => item.target_type === "answer" && item.target)
    .map(item => item.target)
    .filter(answer => {
      if (!answer || seen.has(answer.id)) {
        return false;
      }
      seen.add(answer.id);
      return true;
    })
    .map(answer => {
      const questionId = answer.question?.id ?? QUESTION_FALLBACK.id;
      return {
        id: answer.id,
        author: {
          name: answer.author?.name ?? "知乎用户",
          headline: answer.author?.headline ?? "",
          avatarUrl: answer.author?.avatar_url ?? "",
          profileUrl: buildAuthorProfileUrl(answer.author),
        },
        excerpt: answer.excerpt?.trim() ?? "",
        contentText: htmlToPlainText(answer.content ?? answer.excerpt ?? ""),
        voteupCount: answer.voteup_count ?? 0,
        commentCount: answer.comment_count ?? 0,
        thanksCount: answer.thanks_count ?? 0,
        createdAt: answer.created_time ?? 0,
        answerUrl: `https://www.zhihu.com/question/${questionId}/answer/${answer.id}`,
      };
    });

  const questionSource = feed.data.find(item => item.target?.question)?.target.question;
  const question = questionSource
    ? {
        id: questionSource.id,
        title: questionSource.title,
        url: `https://www.zhihu.com/question/${questionSource.id}`,
      }
    : QUESTION_FALLBACK;

  return {
    question,
    comments,
    fetchedAt: new Date().toISOString(),
    total: comments.length,
  };
}

function buildAuthorProfileUrl(author?: ZhihuAuthor) {
  if (!author) {
    return "";
  }
  if (author.url_token) {
    return `https://www.zhihu.com/people/${author.url_token}`;
  }
  return author.url ?? "";
}

function htmlToPlainText(html: string): string {
  if (!html) {
    return "";
  }

  const withoutScripts = html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "");
  const withLineBreaks = withoutScripts
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n");

  const stripped = withLineBreaks.replace(/<[^>]+>/g, " ");

  return decodeEntities(stripped)
    .replace(/\u00a0/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function decodeEntities(text: string): string {
  const entities: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };

  return text.replace(/&(#\d+|#x[0-9a-fA-F]+|\w+);/g, (match, entity) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      const code = parseInt(entity.slice(2), 16);
      return String.fromCharCode(code);
    }
    if (entity.startsWith("#")) {
      const code = parseInt(entity.slice(1), 10);
      return String.fromCharCode(code);
    }
    return entities[entity] ?? match;
  });
}

console.log(`🚀 Server running at ${server.url}`);
