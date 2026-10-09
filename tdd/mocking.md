# 何时 mock

> 基于 mattpocock/skills 的 mocking.md,与上游的差异:多出"真实注入优先于 mock"一节。

只在**系统边界** mock:

- 外部 API(支付、邮件等)
- 数据库(有时——优先真实测试库/`:memory:`)
- 时间/随机数
- 文件系统(有时)

**不 mock**:

- 项目自己的类/模块(**永不**——全仓用测试框架的模块替身 API(如 Vitest 的 `vi.mock`/`vi.spyOn`、Jest 的 `jest.mock`/`jest.spyOn`)指向自有代码即红旗;检索前先确认本项目实际用的是哪个框架,拿别的框架的 API 去检索,零命中不证明干净)
- 内部协作者
- 任何你能控制的东西

## 真实注入优先于 mock(边界也一样)

能用真实手段制造边界条件的,优先真实手段——它顺带验证了错误处理的真实路径:

```typescript
// BAD: mock 自己的模块伪造失败
vi.spyOn(settings, "setDeviceAlias").mockReturnValue(false);

// GOOD: 目录改只读,让 persist 真实 EACCES → 走真 catch+回滚路径
chmodSync(setDir, 0o555);
try {
  expect(core.setRemoteAlias("fp-A", "x")).toEqual({ ok: false });
} finally {
  chmodSync(setDir, 0o755); // 恢复,afterEach 清理需要写权限
}
```

**改了环境或文件来制造边界的,恢复必须可逆且只还原自己改的那一处**:用版本控制的还原命令(checkout/restore)去"恢复"会连带抹掉工作区里未提交的正身,其后所有测试都跑在一个缺了被测代码的世界里——而那时的红与绿都毫无意义。用等价替换、显式改回、或 finally 块恢复。

同类手法:时钟注入 `now: () => clock`;`:memory:` SQLite;临时目录 `mkdtempSync`;假驱动经构造参数注入(FakeTimers/sender 假件)。

## 为可 mock 性设计接口

**1. 依赖注入**——外部依赖传进来,不在内部创建:

```typescript
// 易 mock
function processPayment(order, paymentClient) {
  return paymentClient.charge(order.total);
}

// 难 mock
function processPayment(order) {
  const client = new StripeClient(process.env.STRIPE_KEY);
  return client.charge(order.total);
}
```

**2. SDK 式接口优于泛用 fetcher**——每个外部操作一个具名函数:

```typescript
// GOOD: 每个函数独立可 mock,mock 返回单一形状
const api = {
  getUser: (id) => fetch(`/users/${id}`),
  getOrders: (userId) => fetch(`/users/${userId}/orders`),
};

// BAD: mock 里要写条件分支
const api = { fetch: (endpoint, options) => fetch(endpoint, options) };
```
