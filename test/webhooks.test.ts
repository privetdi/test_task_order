import { describe, expect, it } from "vitest";
import { apiOrder, postWebhook, setupTestApp } from "./helpers.js";

const ctx = setupTestApp();

describe("POST /webhooks/order", () => {
  it("создаёт заказ", async () => {
    const res = await postWebhook(ctx.app, apiOrder());
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ result: "created" });
  });

  it("повтор того же события ничего не меняет", async () => {
    const o = apiOrder();
    await postWebhook(ctx.app, o);
    expect((await postWebhook(ctx.app, o)).json()).toEqual({ result: "stale" });
  });

  it("устаревшее событие после нового игнорируется", async () => {
    const o = apiOrder({ status: "paid", updatedAt: "2026-02-10T12:00:00Z" });
    await postWebhook(ctx.app, { ...o, status: "refunded", updatedAt: "2026-02-11T12:00:00Z" });
    expect((await postWebhook(ctx.app, o)).json()).toEqual({ result: "stale" });
    const { rows } = await ctx.db.query(`SELECT status FROM orders WHERE id = $1`, [o.id]);
    expect(rows[0].status).toBe("refunded");
  });

  it("новое событие обновляет заказ", async () => {
    const o = apiOrder({ status: "pending" });
    await postWebhook(ctx.app, o);
    const res = await postWebhook(ctx.app, { ...o, status: "paid", updatedAt: "2026-02-11T00:00:00Z" });
    expect(res.json()).toEqual({ result: "updated" });
  });

  it("невалидное тело — 400", async () => {
    const res = await postWebhook(ctx.app, { id: "x" });
    expect(res.statusCode).toBe(400);
  });
});


describe("concurrent order versions", () => {
  it("сохраняет новейшую версию при конкурентной доставке", async () => {
    const order = apiOrder({ amount: 100, amountPaid: 90 });
    const responses = await Promise.all(Array.from({ length: 20 }, (_, index) => postWebhook(ctx.app, {
      ...order, amountPaid: 90 - index,
      updatedAt: new Date(Date.UTC(2026, 1, 10, 12, index)).toISOString(),
    })));
    expect(responses.every((response) => response.statusCode === 200)).toBe(true);
    const { rows } = await ctx.db.query("SELECT amount_paid_kop FROM orders WHERE id = $1", [order.id]);
    expect(Number(rows[0].amount_paid_kop)).toBe(7100);
  });

  it("одновременные повторы создают заказ один раз", async () => {
    const order = apiOrder();
    const responses = await Promise.all(Array.from({ length: 10 }, () => postWebhook(ctx.app, order)));
    expect(responses.filter((response) => response.json().result === "created")).toHaveLength(1);
    expect(responses.filter((response) => response.json().result === "stale")).toHaveLength(9);
  });

  it.each([
    { amountPaid: -1 }, { amountPaid: "" }, { discountPercent: 101 },
    { discountPercent: -1 }, { amountPaid: 1001 }, { amount: " " },
    { amount: Number.MAX_SAFE_INTEGER },
  ])("отклоняет невалидные суммы и скидки %j", async (fields) => {
    expect((await postWebhook(ctx.app, apiOrder(fields))).statusCode).toBe(400);
  });
});
