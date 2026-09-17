import { getFinanceData } from "@/lib/finance-data";
export const dynamic = "force-dynamic";
export async function GET() {
  const result = await getFinanceData();
  return Response.json(result ?? { error: "Unauthorized" }, {
    status: result ? 200 : 401,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      Vary: "Cookie",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
    },
  });
}
