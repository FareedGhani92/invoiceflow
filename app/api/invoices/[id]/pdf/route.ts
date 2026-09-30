import { owner, invoice, AppError, errorResponse } from "@/lib/server";
import { generatePdf } from "@/lib/pdf";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await owner();
    const { id } = await params;
    const inv = await invoice(user, id);
    if (inv.status === "draft")
      throw new AppError("Issue the invoice before downloading a PDF.");
    const headers = {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${inv.number}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    };
    const bytes = await generatePdf(inv);
    return new Response(bytes as unknown as BodyInit, { headers });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("This PDF font"))
      return errorResponse(new AppError(e.message));
    return errorResponse(e);
  }
}
