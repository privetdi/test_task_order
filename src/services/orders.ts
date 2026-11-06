import { z } from "zod";
import { ValidationError } from "../errors.js";
import type { Order, OrdersRepository } from "../repositories/orders.js";
import { parseRub, toKop, roundKop, discountedKop } from "../utils/money.js";
import { parseUtc } from "../utils/time.js";

const ExternalOrder = z.object({
  id: z.string().min(1),
  customerId: z.string().min(1),
  amount: z.union([z.number(), z.string()]),
  amountPaid: z.union([z.number(), z.string()]).optional(),
  discountPercent: z.union([z.number(), z.string()]).optional(),
  status: z.enum(["pending", "paid", "refunded"]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ApplyResult = "created" | "updated" | "stale";

export class OrdersService {
  constructor(private readonly orders: OrdersRepository) {}

  normalize(raw: unknown): Order {
    const parsed = ExternalOrder.safeParse(raw);
    if (!parsed.success) throw new ValidationError(`invalid order: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`);
    const o = parsed.data;
    try {
      const amountKop = toKop(parseRub(o.amount));
      const discount = o.discountPercent === undefined ? 0 : parseRub(o.discountPercent);
      if (discount > 100) throw new Error("invalid discountPercent");
      const amountPaidKop = o.amountPaid === undefined
        ? discountedKop(amountKop, discount)
        : roundKop(parseRub(o.amountPaid));
      if (amountPaidKop > amountKop) throw new Error("amountPaid exceeds amount");
      return {
        id: o.id,
        customerId: o.customerId,
        amountKop,
        amountPaidKop,
        status: o.status,
        createdAt: parseUtc(o.createdAt),
        updatedAt: parseUtc(o.updatedAt),
      };
    } catch (e) {
      throw new ValidationError((e as Error).message);
    }
  }

  async apply(raw: unknown): Promise<ApplyResult> {
    const incoming = this.normalize(raw);
    return this.orders.apply(incoming);
  }
}
