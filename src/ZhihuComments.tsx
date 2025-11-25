import { useEffect, useState } from "react";

type Comment = {
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
};

type ApiResponse = {
  question: {
    id: string;
    title: string;
    url: string;
  };
  comments: Comment[];
  fetchedAt: string;
  total: number;
  error?: string;
};

export function ZhihuComments() {
  const [questionTitle, setQuestionTitle] = useState("你最近在读的书是哪一本？");
  const [questionUrl, setQuestionUrl] = useState("https://www.zhihu.com/question/800718032");
  const [comments, setComments] = useState<Comment[]>([]);
  const [fetchedAt, setFetchedAt] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [totalComments, setTotalComments] = useState(0);

  const formattedTotal = totalComments.toLocaleString("zh-CN");
  const updatedText = fetchedAt ? new Date(fetchedAt).toLocaleString("zh-CN") : "";

  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadComments = async (offset = 0, limit = 10) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/zhihu/comments?offset=${offset}&limit=${limit}`);
      if (!res.ok) {
        throw new Error("服务器暂时不可用，请稍后再试。");
      }
      const data: ApiResponse = await res.json();
      if (data.error) {
        throw new Error(data.error ?? "知乎返回了一个错误。");
      }
      setComments(offset === 0 ? data.comments : [...comments, ...data.comments]);
      setQuestionTitle(data.question.title);
      setQuestionUrl(data.question.url);
      setFetchedAt(data.fetchedAt);
      setTotalComments(data.total);
      setHasMore(data.comments.length > 0 && comments.length + data.comments.length < data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载时出现未知错误。");
    } finally {
      setLoading(false);
    }
  };

  const loadMore = () => {
    if (hasMore && !loading) {
      loadComments(comments.length);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      const res = await fetch("/api/zhihu/refresh", { method: "POST" });
      if (!res.ok) {
        throw new Error("刷新失败，请稍后再试。");
      }
      // After refresh, reload the comments
      await loadComments(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "刷新时出现未知错误。");
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadComments(0);
  }, []);

  return (
    <section className="glass rounded-3xl border border-white/10 shadow-2xl shadow-black/40 p-6 sm:p-10 space-y-8">
      <header className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.25em] text-white/70">
            Zhihu Question
            <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-[#ff7eb6] to-[#7dd6ff]" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-semibold leading-tight text-white">{questionTitle}</h2>
          <div className="flex flex-wrap items-center gap-3 text-sm text-white/70">
            <a href={questionUrl} className="underline underline-offset-4 hover:text-white" target="_blank" rel="noreferrer">
              {questionUrl}
            </a>
            {updatedText && <span className="text-white/50">最近更新：{updatedText}</span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleRefresh}
            className="bg-gradient-to-r from-[#7dd6ff] via-[#8b7bff] to-[#ff7eb6] px-5 py-2 rounded-full font-semibold text-sm text-white shadow-lg shadow-[#7dd6ff]/30 hover:shadow-xl hover:scale-[1.01] transition disabled:opacity-60"
            disabled={loading || isRefreshing}
          >
            {isRefreshing ? "刷新中…" : "刷新列表"}
          </button>
          <a
            href={questionUrl}
            target="_blank"
            rel="noreferrer"
            className="px-4 py-2 rounded-full border border-white/15 text-sm text-white/80 hover:text-white hover:border-white/30 transition"
          >
            打开知乎原题
          </a>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat label="回答数" value={formattedTotal} />
        <MiniStat label="最近抓取" value={updatedText || "--"} />
        <MiniStat label="接口模式" value="Answers" />
        <MiniStat label="排序" value="时间序" />
      </div>

      {error && (
        <div className="text-center text-red-300 bg-red-500/10 border border-red-500/40 rounded-2xl px-4 py-3">
          {error} <button onClick={handleRefresh} className="underline underline-offset-4">
            重试
          </button>
        </div>
      )}

      <div className="space-y-6">
        {loading && comments.length === 0 && (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="animate-pulse rounded-2xl bg-white/5 h-40" />
            ))}
          </div>
        )}

        {!loading && !error && comments.length === 0 && <p className="text-center text-white/70">暂时还没有回答。</p>}

        {!error &&
          comments.map(comment => (
            <article
              key={comment.id}
              className="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-5 sm:p-7 space-y-5 shadow-inner shadow-black/30 card-hover"
            >
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition pointer-events-none bg-gradient-to-br from-white/5 via-transparent to-white/0" />
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex items-start gap-4 flex-1">
                  {comment.author.avatarUrl ? (
                    <img
                      src={comment.author.avatarUrl}
                      alt={comment.author.name}
                      className="w-14 h-14 rounded-2xl object-cover border border-white/20 shadow shadow-black/30"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center text-xl font-semibold text-white/90">
                      {comment.author.name.slice(0, 1)}
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="flex flex-wrap items-baseline gap-2 pr-2">
                      <h2 className="text-xl font-semibold text-white tracking-tight">{comment.author.name}</h2>
                      {comment.author.headline && <p className="text-sm text-white/60 line-clamp-1">{comment.author.headline}</p>}
                    </div>
                    <p className="text-xs text-white/50 mt-1">{formatDate(comment.createdAt)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <MiniStat label="赞同" value={comment.voteupCount} />
                  <MiniStat label="评论" value={comment.commentCount} />
                  <MiniStat label="感谢" value={comment.thanksCount} />
                </div>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white/90 leading-relaxed space-y-3">
                {renderParagraphs(comment.contentText || comment.excerpt)}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-white/60">
                  {comment.author.profileUrl && (
                    <a href={comment.author.profileUrl} className="hover:text-white underline underline-offset-4" target="_blank" rel="noreferrer">
                      访问作者主页
                    </a>
                  )}
                </div>
                <a
                  href={comment.answerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-semibold tracking-wide uppercase bg-gradient-to-r from-white/10 to-white/20 text-white px-4 py-2 rounded-full hover:scale-[1.02] transition"
                >
                  查看原文
                </a>
              </div>
            </article>
          ))}
        {hasMore && !loading && (
          <div className="text-center">
            <button
              onClick={loadMore}
              className="bg-gradient-to-r from-[#7dd6ff] via-[#8b7bff] to-[#ff7eb6] px-5 py-2 rounded-full font-semibold text-sm text-white shadow-lg shadow-[#7dd6ff]/30 hover:shadow-xl hover:scale-[1.01] transition disabled:opacity-60"
              disabled={loading}
            >
              加载更多
            </button>
          </div>
        )}
        {loading && comments.length > 0 && (
          <div className="space-y-4">
            <div className="animate-pulse rounded-2xl bg-white/5 h-40" />
          </div>
        )}
      </div>
    </section>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="inline-flex flex-col items-start justify-center min-w-[120px] rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-white">
      <span className="text-sm text-white/60 tracking-[0.18em] uppercase">{label}</span>
      <span className="text-xl font-semibold leading-tight">{value}</span>
    </span>
  );
}

function renderParagraphs(text: string) {
  if (!text) {
    return <p className="text-white/60">暂无内容</p>;
  }

  return text
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean)
    .map((line, index) => (
      <p key={index} className="first:before:text-white/60 first:before:content-['“'] last:after:content-['”'] last:after:text-white/60">
        {line}
      </p>
    ));
}

function formatDate(timestamp: number) {
  if (!timestamp) {
    return "";
  }
  try {
    return new Date(timestamp * 1000).toLocaleString("zh-CN", {
      hour12: false,
    });
  } catch {
    return "";
  }
}
