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

  const loadComments = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/zhihu/comments");
      if (!res.ok) {
        throw new Error("服务器暂时不可用，请稍后再试。");
      }
      const data: ApiResponse = await res.json();
      if (data.error) {
        throw new Error(data.error ?? "知乎返回了一个错误。");
      }
      setComments(data.comments);
      setQuestionTitle(data.question.title);
      setQuestionUrl(data.question.url);
      setFetchedAt(data.fetchedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载时出现未知错误。");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadComments();
  }, []);

  const updatedText = fetchedAt ? new Date(fetchedAt).toLocaleString("zh-CN") : "";

  return (
    <section className="bg-[#0f1119]/70 backdrop-blur rounded-3xl border border-white/10 shadow-2xl shadow-black/40 p-6 sm:p-10 space-y-8">
      <header className="space-y-3 text-center">
        <p className="text-sm uppercase tracking-[0.3em] text-[#fcb045]">Zhihu Question</p>
        <h1 className="text-3xl sm:text-4xl font-semibold leading-tight text-white">{questionTitle}</h1>
        <p className="text-sm text-white/70">
          来源：{" "}
          <a href={questionUrl} className="text-[#7dd6ff] underline-offset-4 hover:text-white" target="_blank" rel="noreferrer">
            {questionUrl}
          </a>
        </p>
        {updatedText && <p className="text-xs text-white/50">最近更新：{updatedText}</p>}
      </header>

      <div className="flex flex-wrap items-center gap-3 justify-center">
        <button
          onClick={loadComments}
          className="bg-gradient-to-r from-[#fcb045] via-[#fd1d1d] to-[#833ab4] px-5 py-2 rounded-full font-semibold text-sm text-white hover:opacity-90 transition disabled:opacity-60"
          disabled={loading}
        >
          {loading ? "加载中…" : "刷新列表"}
        </button>
        {!loading && !error && <span className="text-sm text-white/70">共 {comments.length} 条回答</span>}
      </div>

      {error && (
        <div className="text-center text-red-300 bg-red-500/10 border border-red-500/40 rounded-2xl px-4 py-3">
          {error} <button onClick={loadComments} className="underline underline-offset-4">
            重试
          </button>
        </div>
      )}

      <div className="space-y-6">
        {loading && (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="animate-pulse rounded-2xl bg-white/5 h-40" />
            ))}
          </div>
        )}

        {!loading && !error && comments.length === 0 && <p className="text-center text-white/70">暂时还没有回答。</p>}

        {!loading &&
          !error &&
          comments.map(comment => (
            <article key={comment.id} className="bg-white/3 border border-white/10 rounded-3xl p-5 sm:p-7 space-y-5 shadow-inner shadow-black/30">
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
                    <div className="flex flex-wrap items-baseline gap-2">
                      <h2 className="text-xl font-semibold text-white tracking-tight">{comment.author.name}</h2>
                      {comment.author.headline && <p className="text-sm text-white/60">{comment.author.headline}</p>}
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
      </div>
    </section>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex flex-col items-center justify-center min-w-[60px] bg-white/5 rounded-2xl px-2.5 py-1.5 border border-white/10 text-white">
      <span className="text-lg font-semibold leading-none">{value}</span>
      <span className="text-[11px] text-white/70 tracking-[0.2em] uppercase">{label}</span>
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
