import "./index.css";
import { ZhihuComments } from "./ZhihuComments";

export function App() {
  return (
    <div className="min-h-screen w-full px-4 py-10 sm:py-16 lg:py-20">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="text-center space-y-4">
          <p className="text-sm tracking-[0.5em] uppercase text-white/70">阅读笔记</p>
          <h1 className="text-4xl sm:text-5xl font-bold text-white leading-tight">知乎网友最近在读的书</h1>
          <p className="text-white/70 max-w-2xl mx-auto">
            实时抓取知乎问题下的公开回答，帮你看看大家都在读什么书，也许能获得下一本书的灵感。
          </p>
        </div>
        <ZhihuComments />
      </div>
    </div>
  );
}
