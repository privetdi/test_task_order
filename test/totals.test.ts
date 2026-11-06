import { describe, expect, it, vi } from "vitest";
import { apiOrder, dailyTotals, postWebhook, setupTestApp } from "./helpers.js";

const ctx = setupTestApp();

describe("GET /customers/:id/daily-totals", () => {
  it("суммирует оплаченные заказы по дням в таймзоне клиента", async () => {
    await postWebhook(ctx.app, apiOrder({ amount: 1000, createdAt: "2026-02-10T20:30:00Z" }));
    await postWebhook(ctx.app, apiOrder({ amount: 250, createdAt: "2026-02-10T21:30:00Z" }));
    await postWebhook(ctx.app, apiOrder({ amount: "99", createdAt: "2026-02-11T10:00:00Z" }));

    const res = await dailyTotals(ctx.app, "c_1", "2026-02-09", "2026-02-11");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([
      { date: "2026-02-09", total: 0, gross: 0, discount: 0, net: 0 },
      { date: "2026-02-10", total: 1000, gross: 1000, discount: 0, net: 1000 },
      { date: "2026-02-11", total: 349, gross: 349, discount: 0, net: 349 },
    ]);
  });

  it("не учитывает pending и refunded", async () => {
    await postWebhook(ctx.app, apiOrder({ amount: 500 }));
    await postWebhook(ctx.app, apiOrder({ amount: 700, status: "pending" }));
    await postWebhook(ctx.app, apiOrder({ amount: 900, status: "refunded" }));
    const res = await dailyTotals(ctx.app, "c_1", "2026-02-10", "2026-02-10");
    expect(res.json()).toEqual([{ date: "2026-02-10", total: 500, gross: 500, discount: 0, net: 500 }]);
  });

  it("учитывает только заказы этого клиента", async () => {
    ctx.api.customers.set("c_2", "Asia/Novosibirsk");
    await postWebhook(ctx.app, apiOrder({ amount: 500 }));
    await postWebhook(ctx.app, apiOrder({ amount: 800, customerId: "c_2" }));
    const res = await dailyTotals(ctx.app, "c_2", "2026-02-10", "2026-02-10");
    expect(res.json()).toEqual([{ date: "2026-02-10", total: 800, gross: 800, discount: 0, net: 800 }]);
  });

  it("таймзона клиента берётся из API один раз", async () => {
    await dailyTotals(ctx.app, "c_1", "2026-02-10", "2026-02-10");
    ctx.api.customers.set("c_1", "UTC");
    await dailyTotals(ctx.app, "c_1", "2026-02-10", "2026-02-10");
    const { rows } = await ctx.db.query(`SELECT timezone FROM customers WHERE id = 'c_1'`);
    expect(rows[0].timezone).toBe("Europe/Moscow");
  });

  it("валидирует даты", async () => {
    expect((await dailyTotals(ctx.app, "c_1", "2026-02-30", "2026-03-01")).statusCode).toBe(400);
    expect((await dailyTotals(ctx.app, "c_1", "2026-03-02", "2026-03-01")).statusCode).toBe(400);
  });

  it("неизвестный клиент — 404", async () => {
    const res = await dailyTotals(ctx.app, "nobody", "2026-02-10", "2026-02-10");
    expect(res.statusCode).toBe(404);
  });
});


describe("discounts and historical timezones", () => {
  it("использует amountPaid и сохраняет total равным gross", async () => {
    await postWebhook(ctx.app, apiOrder({ amount: "2500.00", discountPercent: "15", amountPaid: "2087.50" }));
    const res = await dailyTotals(ctx.app, "c_1", "2026-02-10", "2026-02-10");
    expect(res.json()).toEqual([{ date: "2026-02-10", total: 2500, gross: 2500, discount: 412.5, net: 2087.5 }]);
  });

  it("округляет фактическую оплату каждого заказа до копейки", async () => {
    await postWebhook(ctx.app, apiOrder({ amount: 1.15, amountPaid: 1.005, discountPercent: 10 }));
    await postWebhook(ctx.app, apiOrder({ amount: 1.15, amountPaid: 1.005, discountPercent: 10 }));
    expect((await dailyTotals(ctx.app, "c_1", "2026-02-10", "2026-02-10")).json()).toEqual([
      { date: "2026-02-10", total: 2.3, gross: 2.3, discount: 0.28, net: 2.02 },
    ]);
  });

  it("считает net по скидке, когда amountPaid отсутствует", async () => {
    await postWebhook(ctx.app, apiOrder({ amount: 100, discountPercent: "15" }));
    expect((await dailyTotals(ctx.app, "c_1", "2026-02-10", "2026-02-10")).json()[0]).toMatchObject({ gross: 100, discount: 15, net: 85 });
  });

  it("учитывает переход Берлина на летнее время и не зависит от текущей даты", async () => {
    ctx.api.customers.set("c_7", "Europe/Berlin");
    for (const [createdAt, amount] of [
      ["2026-03-27T22:30:00Z", 10],
      ["2026-03-27T23:30:00Z", 20],
      ["2026-03-28T22:30:00Z", 30],
      ["2026-03-28T23:30:00Z", 40],
      ["2026-03-29T21:59:59Z", 50],
      ["2026-03-29T22:00:00Z", 60],
      ["2026-03-31T22:00:00Z", 70],
    ] as const) {
      await postWebhook(ctx.app, apiOrder({ customerId: "c_7", createdAt, amount }));
    }
    for (const now of ["2026-01-01T12:00:00Z", "2026-07-01T12:00:00Z"]) {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(now));
      try {
        const res = await dailyTotals(ctx.app, "c_7", "2026-03-27", "2026-03-31");
        expect(res.json()).toEqual([10, 50, 90, 60, 0].map((total, index) => ({
          date: `2026-03-${27 + index}`, total, gross: total, discount: 0, net: total,
        })));
      } finally {
        vi.useRealTimers();
      }
    }
  });

  it("учитывает осенний переход времени", async () => {
    ctx.api.customers.set("c_7", "Europe/Berlin");
    await postWebhook(ctx.app, apiOrder({ customerId: "c_7", createdAt: "2026-10-24T22:30:00Z", amount: 10 }));
    await postWebhook(ctx.app, apiOrder({ customerId: "c_7", createdAt: "2026-10-25T22:30:00Z", amount: 20 }));
    const res = await dailyTotals(ctx.app, "c_7", "2026-10-24", "2026-10-26");
    expect(res.json().map((row: { total: number }) => row.total)).toEqual([0, 30, 0]);
  });
});
