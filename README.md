# Milky Tea

[![CI](https://github.com/SaltifyDev/milky-tea/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/SaltifyDev/milky-tea/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2FSaltifyDev%2Fmilky-tea%2Fbadges%2Fcoverage-badge.json)](https://github.com/SaltifyDev/milky-tea/actions/workflows/ci.yml)

Milky 的 TypeScript SDK，提供类型安全的 API 调用和事件解析。

## 安装

```bash
pnpm add @saltify/milky-tea zod
```

## 使用方法

### 调用 API

下面是一个使用 `createMilkyClient` 创建客户端并调用 API 的示例：

```ts
import { createMilkyClient } from '@saltify/milky-tea'

const client = createMilkyClient({
  baseURL: 'https://milky.example.com',
  token: process.env.MILKY_TOKEN,
})

const login = await client.system.getLoginInfo()
const friend = await client.system.getFriendInfo({ user_id: 10001 })

console.log(login.nickname)
console.log(friend.friend.nickname)
```

通过 `createMilkyClient` 创建一个客户端实例，传入 `baseURL` 和 `token`，之后就可以通过 `client.{category}.{endpoint}(params)` 的方式调用 API 了。例如，调用 `quit_group` API：

```ts
await client.group.quitGroup({ group_id: 10001 }, { timeout: false })
```

在这里，第二个参数是可选的，可以覆盖默认的 `baseURL`、`token`、`timeout` 等设置。

### 解析事件

SDK 不负责创建或管理事件连接。通过 SSE、WebSocket、WebHook 或其他方式收到事件后，将反序列化后的对象传给 `resolveMilkyEvent`：

```ts
import { resolveMilkyEvent } from '@saltify/milky-tea/event'

const event = await resolveMilkyEvent(JSON.parse(payload))

switch (event.event_type) {
  case 'message_receive':
    console.log(event.data)
    break
  case 'bot_offline':
    console.log(event.data.reason)
    break
}
```

也可以从包根入口导入。推荐使用 `@saltify/milky-tea/event`，以便打包器完全隔离客户端代码和 API schema。

`resolveMilkyEvent` 使用生成的 Zod schema 校验输入。校验结果会移除未知字段并返回深拷贝，但不会冻结返回对象；校验失败时会抛出带有 Zod 错误原因的异常。

### `createMilkyFetch`

`createMilkyFetch` 提供了一个更底层的 fetch 封装，允许直接调用原始的 API endpoint。

```ts
import { createMilkyFetch } from '@saltify/milky-tea'

const milkyFetch = createMilkyFetch({
  baseURL: 'https://milky.example.com',
  zod: false,
})

const login = await milkyFetch('get_login_info', undefined)
console.log(login.uin)
```

`zod` 默认为 `true`。关闭后会跳过请求参数和响应数据的 Zod 校验；也可以在单次请求的 override 里单独设置。

## 示例

- [`examples/client.ts`](./examples/client.ts)：收到好友私聊事件后，将其中的文本消息 echo 给发送者
- [`examples/fetch.ts`](./examples/fetch.ts)：使用底层 `createMilkyFetch` 调用原始 endpoint
- [`examples/event.ts`](./examples/event.ts)：解析事件并通过 `event_type` 缩窄事件数据类型

## 开发

```bash
pnpm install
pnpm generate-api
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm build
```
