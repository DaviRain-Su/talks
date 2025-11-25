# bun-react-tailwind-template

To install dependencies:

```bash
bun install
```

To start a development server:

```bash
bun dev
```

To run for production:

```bash
bun start
```

This project was created using `bun init` in bun v1.3.1. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

## 提供知乎登录态以抓取更多回答

匿名接口只能返回极少回答。若你已在浏览器登录知乎，可以复制请求头里的敏感字段并通过环境变量传给本服务，键名格式为 `ZHIHU_HEADER_<HEADER_NAME>`（会自动转为小写中划线）。例如：

```bash
ZHIHU_HEADER_COOKIE='z_c0=xxxx; session_id=xxxx' \
ZHIHU_HEADER_X_ZSE_96='2.0_xxx' \
bun run dev
```

或者把同样的键值写到 `data/zhihu-headers.json`（已被 `.gitignore` 忽略），例如：

```json
{
  "cookie": "z_c0=xxxx; ...",
  "x-zse-96": "2.0_xxx",
  "x-zst-81": "3_2.0Axxx",
  "referer": "https://www.zhihu.com/question/800718032",
  "user-agent": "Mozilla/5.0 ..."
}
```

服务启动时会自动读取文件与环境变量（文件优先级更高），日志中会提示加载结果。请勿把真实凭据提交到 Git。
