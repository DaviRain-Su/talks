// Import configuration files directly. This is a Cloudflare-friendly way.
import userConfig from "../data/zhihu-config.json";
import fileHeaders from "../data/zhihu-headers.json";

// --- Type Definitions for Cloudflare Environment ---

/**
 * Defines the environment variables and bindings available to the function.
 * - ZHIHU_CACHE: The binding for the Cloudflare Workers KV namespace.
 */
interface Env {
  ZHIHU_CACHE: KVNamespace;
}

/**
 * Defines the signature for a Cloudflare Pages function.
 */
type CloudflarePagesFunction = PagesFunction<Env>;

// --- Type Definitions for Zhihu API ---

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

type ZhihuAuthor = { name: string; headline?: string; avatar_url?: string; url?: string; url_token?: string; };
type ZhihuQuestion = { id: string; title: string; url?: string; };
type ZhihuAnswer = { id: string; excerpt?: string; content?: string; comment_count?: number; voteup_count?: number; thanks_count?: number; created_time?: number; url: string; author?: ZhihuAuthor; question?: ZhihuQuestion; };
type ZhihuFeedItem = { target_type?: string; target?: ZhihuAnswer; } & Partial<ZhihuAnswer>;
type ZhihuFeedResponse = { data: ZhihuFeedItem[]; paging?: { is_end?: boolean; next?: string; need_force_login?: boolean; }; };
type ZhihuErrorResponse = { error: { message: string; code?: number; }; };
export type ZhihuCommentsResponse = { question: { id: string; title: string; url: string; }; comments: Array<{ id: string; author: { name: string; headline: string; avatarUrl: string; profileUrl: string; }; excerpt: string; contentText: string; voteupCount: number; commentCount: number; thanksCount: number; createdAt: number; answerUrl: string; }>; fetchedAt: string; total: number; };

// --- Configuration Constants ---

const log = (...args: unknown[]) => console.log("[cloudflare-zhihu]", ...args);
const readPositiveInt = (value: unknown, fallback: number) => {
  if (value === undefined || value === null) return fallback;
  const num = Number(value);
  return !Number.isFinite(num) || num <= 0 ? fallback : num;
};

const ZHIHU_QUESTION_ID = userConfig.questionId || "800718032";
const endpointSetting = userConfig.endpoint ?? "feeds";
const ZHIHU_ENDPOINT = endpointSetting.toLowerCase() === "answers" ? "answers" : "feeds";
const ZHIHU_API_URL = `https://www.zhihu.com/api/v4/questions/${ZHIHU_QUESTION_ID}/${ZHIHU_ENDPOINT}`;

const FEEDS_INCLUDE = "data[*].is_normal,admin_closed_comment,reward_info,is_collapsed,annotation_action,annotation_detail,collapse_reason,is_sticky,collapsed_by,suggest_edit,comment_count,can_comment,content,editable_content,attachment,voteup_count,reshipment_settings,comment_permission,created_time,updated_time,review_info,relevant_info,question,excerpt,is_labeled,paid_info,paid_info_content,reaction_instruction,segment_infos,allow_segment_interaction,relationship.is_authorized,is_author,voting,is_thanked,is_nothelp;data[*].author.follower_count,vip_info,kvip_info,badge[*].topics;data[*].settings.table_of_content.enabled";
const ANSWERS_INCLUDE = "data[*].is_normal,content,comment_count,voteup_count,created_time,updated_time,question,excerpt,author";
const DEFAULT_INCLUDE = ZHIHU_ENDPOINT === "answers" ? ANSWERS_INCLUDE : FEEDS_INCLUDE;

const ZHIHU_INCLUDE_FIELDS = userConfig.include ?? DEFAULT_INCLUDE;
const ZHIHU_SORT_BY = userConfig.sortBy ?? "created";
const ZHIHU_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    ...fileHeaders,
    "Referer": `https://www.zhihu.com/question/${ZHIHU_QUESTION_ID}`,
};

const QUESTION_FALLBACK = {
  id: ZHIHU_QUESTION_ID,
  title: "你最近在读的书是哪一本？",
  url: `https://www.zhihu.com/question/${ZHIHU_QUESTION_ID}`,
};

const PAGE_SIZE = readPositiveInt(userConfig.pageSize, 10);
const MAX_PAGES = readPositiveInt(userConfig.maxPages, 5);
const PAGE_FETCH_DELAY_MS = readPositiveInt(userConfig.pageDelayMs, 1000);
const REFRESH_INTERVAL_MS = readPositiveInt(userConfig.refreshIntervalMs, 1000 * 60 * 15);
const KV_KEY = `zhihu:comments:${ZHIHU_QUESTION_ID}`;
const KV_EXPIRATION_TTL = REFRESH_INTERVAL_MS / 1000 * 2; // TTL in seconds

// --- Core Logic for Fetching and Caching ---

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

const fetchZhihuFeed = async (): Promise<ZhihuFeedResponse> => {
  const aggregated: ZhihuFeedResponse = { data: [] };
  let nextUrl: string | null = null;
  for (let i = 0; i < MAX_PAGES; i++) {
    const url = new URL(nextUrl || ZHIHU_API_URL);
    if (!nextUrl) {
        url.searchParams.set("include", ZHIHU_INCLUDE_FIELDS);
        url.searchParams.set("limit", `${PAGE_SIZE}`);
        url.searchParams.set("offset", "0");
        url.searchParams.set("platform", "desktop");
        if (ZHIHU_ENDPOINT === "answers") {
            url.searchParams.set("sort_by", ZHIHU_SORT_BY);
        }
    }
    log(`fetching Zhihu page ${i + 1}`);
    const res = await fetch(url.toString(), { headers: ZHIHU_HEADERS });
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

const refreshFromZhihu = async (kv: KVNamespace) => {
    log("starting zhihu data refresh");
    const feed = await fetchZhihuFeed();
    const payload = buildCommentsResponse(feed);
    await kv.put(KV_KEY, JSON.stringify(payload), { expirationTtl: KV_EXPIRATION_TTL });
    log(`fetched and cached ${payload.comments.length} answers`);
    return payload;
};

// --- Cloudflare Pages Function Handler ---

export const onRequest: CloudflarePagesFunction = async (context) => {
  const { request, env } = context;
  const kv = env.ZHIHU_CACHE;
  const url = new URL(request.url);
  const path = url.pathname;
  
  // --- Handle /api/zhihu/comments ---
  if (path.startsWith('/api/zhihu/comments') && request.method === 'GET') {
    let payload = await kv.get<ZhihuCommentsResponse>(KV_KEY, 'json');

    if (!payload) {
        log("KV cache miss, fetching from Zhihu...");
        payload = await refreshFromZhihu(kv);
    } else if (Date.now() - Date.parse(payload.fetchedAt) > REFRESH_INTERVAL_MS) {
        log("KV cache stale, refreshing in background...");
        // Do not `await` this, let it run in the background
        context.waitUntil(refreshFromZhihu(kv));
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

  // --- Handle /api/zhihu/refresh ---
  if (path.startsWith('/api/zhihu/refresh') && request.method === 'POST') {
    try {
      const payload = await refreshFromZhihu(kv);
      return new Response(JSON.stringify({
        ok: true,
        refreshedAt: payload?.fetchedAt ?? new Date().toISOString(),
        total: payload?.total ?? 0,
      }), { headers: { 'Content-Type': 'application/json' } });
    } catch (error: any) {
      console.error("[cloudflare-zhihu] manual refresh failed", error);
      return new Response(JSON.stringify({ error: "Failed to refresh data.", message: error.message }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }
  }

  // --- Fallback for other /api routes ---
  return new Response("Not Found", { status: 404 });
};
