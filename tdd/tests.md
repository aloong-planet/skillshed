# 好测试与坏测试(样例)

> 基于 mattpocock/skills 的 tests.md,与上游的差异:多出假通过形态的样例。

## 好测试

**集成风格**:走真实接口,不 mock 内部件。

```typescript
// GOOD: 测可观察行为
test("user can checkout with valid cart", async () => {
  const cart = createCart();
  cart.add(product);
  const result = await checkout(cart, paymentMethod);
  expect(result.status).toBe("confirmed");
});
```

特征:测调用方在乎的行为;只用公开 API;内部重构后存活;描述 WHAT 不描述 HOW;一个逻辑断言。

## 坏测试

**实现细节耦合**:

```typescript
// BAD: 断言内部协作细节
test("checkout calls paymentService.process", async () => {
  const mockPayment = jest.mock(paymentService);
  await checkout(cart, payment);
  expect(mockPayment.process).toHaveBeenCalledWith(cart.total);
});
```

红旗:mock 内部协作者;测私有方法;断言调用次数/顺序;重构没改行为测试却碎;测试名描述 HOW 不描述 WHAT;绕过接口验证——

```typescript
// BAD: 旁路验证(绕过接口查库)
test("createUser saves to database", async () => {
  await createUser({ name: "Alice" });
  const row = await db.query("SELECT * FROM users WHERE name = ?", ["Alice"]);
  expect(row).toBeDefined();
});

// GOOD: 经接口读回验证
test("createUser makes user retrievable", async () => {
  const user = await createUser({ name: "Alice" });
  const retrieved = await getUser(user.id);
  expect(retrieved.name).toBe("Alice");
});
```

**同义反复**(期望值复述实现,构造性恒真):

```typescript
// BAD: 期望值按实现同款算法重算
test("calculateTotal sums line items", () => {
  const items = [{ price: 10 }, { price: 5 }];
  const expected = items.reduce((sum, i) => sum + i.price, 0);
  expect(calculateTotal(items)).toBe(expected);
});

// GOOD: 期望值是独立的已知字面量
test("calculateTotal sums line items", () => {
  expect(calculateTotal([{ price: 10 }, { price: 5 }])).toBe(15);
});
```

## 假通过形态(逐个防;清单开放,新形态照此补)

**① 恒真断言**——数据量撑不满阈值:

```typescript
// BAD: 只插了 5 条,5 ≤ 200 恒真;把钳制逻辑删掉照样绿
const r = store.list({ limit: 99999 });
expect(r.length).toBeLessThanOrEqual(LIST_MAX_LIMIT);

// GOOD: 插到 206 条,断言精确契约值(独立字面量)
expect(r.length).toBe(200);
expect(r[0].id).toBe("m7"); // 且验证取的是最新 200 条
```

**② 期望值=输入别名**:

```typescript
// BAD: 实现若原地改写 previous 再返回,变成 x equals x 恒真
const merged = mergeAssets(previous, updates);
expect(merged).toEqual(previous);

// GOOD: 独立字面量快照
expect(merged).toEqual({ "11": { name: "a.dmg", downloads: 7 } });
```

**③ 断言 import 的同一常量**:

```typescript
// BAD: 实现就是返回该常量;常量改错测试照样绿
expect(info.version).toBe(PROTOCOL_VERSION);

// GOOD: 协议规定值写死(外部契约作独立真值)
expect(info.version).toBe("2.0");
```

**④ 守旧路径**——测试锁着废弃常量/已被取代的行为,真不变量裸奔。修法:核对断言对象是否仍是生产代码的**活路径**(grep 生产引用),把护栏挪到现行为上。

变异检验自身的假绿形态(变异没到达被测路径)及其样例见 [review-tests/mutation-testing.md](../review-tests/mutation-testing.md),适用条件以该文开头为准。

**检验法(通用)**:说不出"这个测试在什么情况下会红",它就是嫌疑假通过。
