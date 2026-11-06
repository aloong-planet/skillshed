# 好测试与坏测试(样例)

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

此例命中 SKILL.md「反模式」节「实现耦合」一条:mock 了内部协作者并断言它被调用,测试名描述的也是 HOW 而非 WHAT。同一条里的旁路验证——

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

## 假通过形态(规则见 SKILL.md「反模式」节「假通过」一条)

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
