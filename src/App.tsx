import "./index.css";
import { ZhihuComments } from "./ZhihuComments";

export function App() {
  return (
    <div className="min-h-screen w-full px-4 py-10 sm:py-16 lg:py-20">
      <div className="max-w-6xl mx-auto space-y-10">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 glass px-6 py-10 sm:px-10 sm:py-14 shadow-2xl shadow-black/40">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute -left-24 -top-24 h-52 w-52 rounded-full bg-[#ff7eb6]/30 blur-3xl" />
            <div className="absolute right-10 -bottom-20 h-44 w-44 rounded-full bg-[#7dd6ff]/25 blur-3xl" />
          </div>
          <div className="relative grid gap-10 lg:grid-cols-[1.2fr_1fr] items-center">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.25em] text-white/70">
                Reading Radar
                <span className="h-2 w-2 rounded-full bg-gradient-to-r from-[#ff7eb6] to-[#7dd6ff] shadow-[0_0_0_6px_rgba(255,255,255,0.06)]" />
              </div>
              <h1 className="text-4xl sm:text-5xl font-bold text-white leading-[1.15]">知乎网友最近在读的书</h1>
              <p className="text-white/70 text-lg max-w-2xl">
                抓取并整理「你最近在读的书是哪一本？」下的公开回答，用一个优雅的阅读界面帮你找到下一本想读的书。
              </p>
              <div className="flex flex-wrap gap-3">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  实时缓存
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80">
                  <span className="h-2 w-2 rounded-full bg-amber-300" />
                  高对比阅读
                </span>
              </div>
            </div>
            <div className="relative grid grid-cols-2 gap-3 text-center">
              <StatCard title="刷新策略" value="每 15 分钟" subtitle="后台自动同步" />
              <StatCard title="问题 ID" value="800718032" subtitle="知乎问答源" />
              <StatCard title="模式" value="Answers" subtitle="直连知乎接口" />
              <StatCard title="风格" value="夜读" subtitle="深色玻璃风" />
          </div>
          </div>
        </div>
        <ZhihuComments />
      </div>
    </div>
  );
}

function StatCard({ title, value, subtitle }: { title: string; value: string; subtitle: string }) {
  return (
    <div className="glass card-hover rounded-2xl border border-white/10 px-4 py-5 shadow-lg shadow-black/30">
      <p className="text-xs uppercase tracking-[0.28em] text-white/60">{title}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      <p className="text-sm text-white/60">{subtitle}</p>
    </div>
  );
}
