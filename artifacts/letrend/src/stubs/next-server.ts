export class NextResponse {
  static json(data: any, init?: any) { return new Response(JSON.stringify(data), init); }
  static redirect(url: any, status?: any) { return new Response(null, { status: status ?? 302, headers: { Location: String(url) } }); }
  static next() { return new Response(null); }
}
export class NextRequest extends Request {}
export type { NextRequest as NextRequestType };
