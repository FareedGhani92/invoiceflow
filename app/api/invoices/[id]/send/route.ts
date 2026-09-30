import { owner, body, errorResponse, AppError, isPublicDemo } from "@/lib/server";
import { sendInvoice } from "@/lib/delivery";
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await owner();
    if (isPublicDemo())
      throw new AppError("Email delivery is disabled in the public demo.", 403);
    await body(req);
    const { id } = await params;
    return Response.json(await sendInvoice(user, id));
  } catch (e) {
    return errorResponse(e);
  }
}
