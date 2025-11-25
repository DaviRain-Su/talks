import { kv } from "@vercel/kv";
import { readFileSync } from "node:fs";
import path from "node:path";

// --- Configuration Loading ---

export type ZhihuConfig = {
  questionId?: string;
  endpoint?: "feeds" | "answers";
  include?: string;
  sortBy?: string;
  pageSize?: number;
  maxPages?: number;
  pageDelayMs?: number;
  refreshIntervalMs?: number;
};

const readPositiveInt = (value: unknown, fallback: number) => {
  if (value === undefined || value === null) return fallback;
  const num = Number(value);
  return !Number.isFinite(num) || num <= 0 ? fallback : num;
};

const isEnoent = (error: unknown): boolean =>
  !!(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "ENOENT");

const loadJsonFile = <T>(filePath: string): T | null => {
  try {
    const raw = readFileSync(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    if (!isEnoent(error)) {
      console.warn(`[serverless-zhihu] failed to parse ${filePath}`, error);
    }
    return null;
  }
};

const CONFIG_FILE = path.join(process.cwd(), "data", "zhihu-config.json");
const HEADER_FILE = path.join(process.cwd(), "data", "zhihu-headers.json");

const USER_CONFIG = loadJsonFile<ZhihuConfig>(CONFIG_FILE) ?? {};
const log = (...args: unknown[]) => console.log("[serverless-zhihu]", ...args);

log(`loaded config overrides from data/zhihu-config.json: ${Object.keys(USER_CONFIG).join(", ")}`);

// --- Zhihu API Constants & Headers ---

const ZHIHU_QUESTION_ID = USER_CONFIG.questionId || "800718032";
const endpointSetting = USER_CONFIG.endpoint ?? (process.env.ZHIHU_ENDPOINT ?? "feeds");
const ZHIHU_ENDPOINT = endpointSetting.toLowerCase() === "answers" ? "answers" : "feeds";
const ZHIHU_API_URL = `https://www.zhihu.com/api/v4/questions/${ZHIHU_QUESTION_ID}/${ZHIHU_ENDPOINT}`;
const FEEDS_INCLUDE = "data[*].is_normal,admin_closed_comment,reward_info,is_collapsed,annotation_action,annotation_detail,collapse_reason,is_sticky,collapsed_by,suggest_edit,comment_count,can_comment,content,editable_content,attachment,voteup_count,reshipment_settings,comment_permission,created_time,updated_time,review_info,relevant_info,question,excerpt,is_labeled,paid_info,paid_info_content,reaction_instruction,segment_infos,allow_segment_interaction,relationship.is_authorized,is_author,voting,is_thanked,is_nothelp;data[*].author.follower_count,vip_info,kvip_info,badge[*].topics;data[*].settings.table_of_content.enabled";
const ANSWERS_INCLUDE = "data[*].is_normal,content,comment_count,voteup_count,created_time,updated_time,question,excerpt,author";
const DEFAULT_INCLUDE = ZHIHU_ENDPOINT === "answers" ? ANSWERS_INCLUDE : FEEDS_INCLUDE;
const ZHIHU_INCLUDE_FIELDS = USER_CONFIG.include ?? process.env.ZHIHU_INCLUDE ?? DEFAULT_INCLUDE;
const ZHIHU_SORT_BY = USER_CONFIG.sortBy ?? process.env.ZHIHU_SORT_BY ?? "created";
const CUSTOM_HEADER_ENV_PREFIX = "ZHIHU_HEADER_";

const loadCustomZhihuHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = {};
  const applyEntry = (key: string, value: string) => {
    headers[key.toLowerCase()] = value;
  };
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith(CUSTOM_HEADER_ENV_PREFIX) && value) {
      const headerName = key.slice(CUSTOM_HEADER_ENV_PREFIX.length).toLowerCase().replace(/_/g, "-");
      applyEntry(headerName, value);
    }
  }
  const fileHeaders = loadJsonFile<Record<string, string>>(HEADER_FILE);
  if (fileHeaders) {
    log(`loaded ${Object.keys(fileHeaders).length} header overrides from data/zhihu-headers.json`);
    for (const [key, value] of Object.entries(fileHeaders)) {
      if (value) applyEntry(key, value);
    }
  }
  return headers;
};

const CUSTOM_ZHIHU_HEADERS = loadCustomZhihuHeaders();
const ZHIHU_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  Referer: `https://www.zhihu.com/question/${ZHIHU_QUESTION_ID}`,
  ...CUSTOM_ZHIHU_HEADERS,
};
if (Object.keys(CUSTOM_ZHIHU_HEADERS).length) {
    log(`including custom auth headers: ${Object.keys(CUSTOM_ZHIHU_HEADERS).join(", ")}`);
}

const QUESTION_FALLBACK = {
  id: ZHIHU_QUESTION_ID,
  title: "你最近在读的书是哪一本？",
  url: `https://www.zhihu.com/question/${ZHIHU_QUESTION_ID}`,
};
const PAGE_SIZE = readPositiveInt(USER_CONFIG.pageSize ?? process.env.ZHIHU_PAGE_SIZE, 10);
const MAX_PAGES = readPositiveInt(USER_CONFIG.maxPages ?? process.env.ZHIHU_MAX_PAGES, 5); // Default to 5 pages for serverless
const PAGE_FETCH_DELAY_MS = readPositiveInt(USER_CONFIG.pageDelayMs ?? process.env.ZHIHU_PAGE_DELAY_MS, 1000);
const REFRESH_INTERVAL_MS = readPositiveInt(USER_CONFIG.refreshIntervalMs ?? process.env.ZHIHU_REFRESH_INTERVAL_MS, 1000 * 60 * 15);
const KV_KEY = `zhihu:comments:${ZHIHU_QUESTION_ID}`;


// --- Data Types ---

type ZhihuAuthor = { name: string; headline?: string; avatar_url?: string; url?: string; url_token?: string; };
type ZhihuQuestion = { id: string; title: string; url?: string; };
type ZhihuAnswer = { id: string; excerpt?: string; content?: string; comment_count?: number; voteup_count?: number; thanks_count?: number; created_time?: number; url: string; author?: ZhihuAuthor; question?: ZhihuQuestion; };
type ZhihuFeedItem = { target_type?: string; target?: ZhihuAnswer; } & Partial<ZhihuAnswer>;
type ZhihuFeedResponse = { data: ZhihuFeedItem[]; paging?: { is_end?: boolean; next?: string; need_force_login?: boolean; }; };
type ZhihuErrorResponse = { error: { message: string; code?: number; }; };
export type ZhihuCommentsResponse = { question: { id: string; title: string; url: string; }; comments: Array<{ id: string; author: { name: string; headline: string; avatarUrl: string; profileUrl: string; }; excerpt: string; contentText: string; voteupCount: number; commentCount: number; thanksCount: number; createdAt: number; answerUrl: string; }>; fetchedAt: string; total: number; };

// --- Core Logic for Fetching and Caching ---

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

const fetchZhihuFeed = async (): Promise<ZhihuFeedResponse> => {
  const aggregated: ZhihuFeedResponse = { data: [] };
  let nextUrl: string | null = null;
  for (let i = 0; i < MAX_PAGES; i++) {
    const requestUrl = nextUrl || new URL(ZHIHU_API_URL).toString();
    log(`fetching Zhihu page ${i + 1}`);
    const res = await fetch(requestUrl, {
      headers: { ...ZHIHU_HEADERS, 'Referer': `https://www.zhihu.com/question/${ZHIHU_QUESTION_ID}/` }
    });
    if (!res.ok) throw new Error(`Zhihu API error: ${res.status}`);
    const chunk = (await res.json()) as ZhihuFeedResponse | ZhihuErrorResponse;
    if ("error" in chunk) throw new Error(`Zhihu API error: ${chunk.error.message}`);
    aggregated.data.push(...chunk.data);
    if (!chunk.paging || chunk.paging.is_end || !chunk.paging.next) break;
    nextUrl = chunk.paging.next;
    await delay(PAGE_FETCH_DELAY_MS);
  }
  return aggregated;
};

const buildCommentsResponse = (feed: ZhihuFeedResponse): ZhihuCommentsResponse => {
    const seen = new Set<string>();
    const answers = feed.data
      .map(item => "target" in item && item.target ? item.target : item as ZhihuAnswer)
      .filter(answer => {
        if (!answer || !answer.id || seen.has(answer.id)) return false;
        seen.add(answer.id);
        return true;
      });

    const comments = answers.map(answer => ({
      id: answer.id,
      author: {
        name: answer.author?.name ?? "知乎用户",
        headline: answer.author?.headline ?? "",
        avatarUrl: answer.author?.avatar_url ?? "",
        profileUrl: `https://www.zhihu.com/people/${answer.author?.url_token ?? ''}`,
      },
      excerpt: answer.excerpt?.trim() ?? "",
      contentText: (answer.content ?? answer.excerpt ?? "").replace(/<[^>]+>/g, " "),
      voteupCount: answer.voteup_count ?? 0,
      commentCount: answer.comment_count ?? 0,
      thanksCount: answer.thanks_count ?? 0,
      createdAt: answer.created_time ?? 0,
      answerUrl: `https://www.zhihu.com/question/${answer.question?.id ?? ZHIHU_QUESTION_ID}/answer/${answer.id}`,
    }));

    const questionSource = answers.find(a => a.question)?.question;
    const question = questionSource ? { id: questionSource.id, title: questionSource.title, url: `https://www.zhihu.com/question/${questionSource.id}` } : QUESTION_FALLBACK;

    return {
      question,
      comments,
      fetchedAt: new Date().toISOString(),
      total: comments.length,
    };
};

const loadFromKV = async (): Promise<ZhihuCommentsResponse | null> => {
  try {
    return await kv.get(KV_KEY);
  } catch (error) {
    console.error("[serverless-zhihu] failed to load from KV", error);
    return null;
  }
};

const persistToKV = async (data: ZhihuCommentsResponse) => {
  try {
    await kv.set(KV_KEY, data, { ex: Math.round(REFRESH_INTERVAL_MS / 1000) * 2 });
  } catch (error) {
    console.error("[serverless-zhihu] failed to save to KV", error);
  }
};

let refreshPromise: Promise<void> | null = null;
const refreshFromZhihu = async (force = false) => {
    if (refreshPromise) return refreshPromise;

    if (!force) {
        const currentCache = await loadFromKV();
        if (currentCache && Date.now() - Date.parse(currentCache.fetchedAt) < REFRESH_INTERVAL_MS) {
            log("refresh skipped (cache is fresh)");
            return;
        }
    }

    log(force ? "manual refresh triggered" : "starting background refresh");
    refreshPromise = (async () => {
        const feed = await fetchZhihuFeed();
        const payload = buildCommentsResponse(feed);
        await persistToKV(payload);
        log(`fetched ${payload.comments.length} answers`);
    })();

    try {
        await refreshPromise;
    } finally {
        refreshPromise = null;
    }
};


// --- Serverless Handler ---

export default async function handler(req: Request) {
  const url = new URL(req.url);
  const path = url.pathname;

  if (path === '/api/zhihu/comments' && req.method === 'GET') {
    let payload = await loadFromKV();
    if (!payload) {
      await refreshFromZhihu(true); // Initial fetch if no cache
      payload = await loadFromKV();
    } else if (Date.now() - Date.parse(payload.fetchedAt) > REFRESH_INTERVAL_MS) {
        // Trigger a refresh but don't wait for it
        refreshFromZhihu().catch(console.error);
    }

     if (!payload) {
        return new Response(JSON.stringify({ error: "No data available, please try again later." }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    }
    
    const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);
    const limit = parseInt(url.searchParams.get("limit") ?? "10", 10);
    const paginatedComments = payload.comments.slice(offset, offset + limit);

    return new Response(JSON.stringify({ ...payload, comments: paginatedComments }), {
      headers: { 
        'Content-Type': 'application/json',
        "Cache-Control": "public, max-age=120, s-maxage=120",
      },
    });
  }

  if (path === '/api/zhihu/refresh' && req.method === 'POST') {
    try {
      await refreshFromZhihu(true);
      const payload = await loadFromKV();
      return new Response(JSON.stringify({
        ok: true,
        refreshedAt: payload?.fetchedAt ?? new Date().toISOString(),
        total: payload?.total ?? 0,
      }), { headers: { 'Content-Type': 'application/json' } });
    } catch (error) {
      console.error("[serverless-zhihu] manual refresh failed", error);
      return new Response(JSON.stringify({ error: "Failed to refresh data." }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }
  }

  return new Response("Not Found", { status: 404 });
}
