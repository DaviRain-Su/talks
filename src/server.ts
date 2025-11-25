import { serve } from "bun";
import index from "./index.html";
import { ensureInitialized, getStoredComments, refreshFromZhihu } from "./zhihu";

export function startServer() {
  const server = serve({
    routes: {
      // Serve index.html for all unmatched routes.
      "/*": index,

      "/api/zhihu/comments": {
        async GET(req) {
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

          const url = new URL(req.url);
          const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);
          const limit = parseInt(url.searchParams.get("limit") ?? "10", 10);
          const paginatedComments = payload.comments.slice(offset, offset + limit);

          return Response.json(
            {
              ...payload,
              comments: paginatedComments,
            },
            {
              headers: {
                "Cache-Control": "public, max-age=120",
              },
            },
          );
        },
      },

      "/api/zhihu/refresh": {
        async POST() {
          await ensureInitialized();
          try {
            await refreshFromZhihu(true);
            const payload = await getStoredComments();
            return Response.json({
              ok: true,
              refreshedAt: payload?.fetchedAt ?? new Date().toISOString(),
              total: payload?.total ?? 0,
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

  console.log(`🚀 Server running at ${server.url}`);
  return server;
}
