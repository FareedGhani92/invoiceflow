import { settings, AppError, errorResponse, isPublicDemo } from "@/lib/server";
import { dispatchDueReminders, remindersConfigured } from "@/lib/reminders";

export const dynamic = "force-dynamic";
function authorized(req: Request, secret: string) {
  const header = req.headers.get("authorization") || "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = new TextEncoder().encode(secret);
  const b = new TextEncoder().encode(provided);
  let difference = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ (b[i] || 0);
  return difference === 0;
}

export async function POST(req: Request) {
  try {
    if (isPublicDemo()) throw new AppError("Reminders are disabled in the public demo.", 403);
    const secret = settings().REMINDER_JOB_SECRET || "";
    if (secret.length < 32 || !authorized(req, secret))
      throw new AppError("Unauthorized.", 401);
    if (!remindersConfigured())
      throw new AppError("Reminder scheduling is not configured.", 503);
    return Response.json(await dispatchDueReminders(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(req: Request) {
  try {
    if (isPublicDemo())
      return Response.json({ paused: true, reason: "Reminders are disabled in the public demo." }, { headers: { "Cache-Control": "no-store" } });
    const secret = settings().CRON_SECRET || "";
    if (!secret || secret.length < 32)
      return Response.json({ paused: true, reason: "Cron authorization is not configured." }, { headers: { "Cache-Control": "no-store" } });
    if (!authorized(req, secret))
      throw new AppError("Unauthorized.", 401);
    if (!remindersConfigured())
      return Response.json({ paused: true, reason: "Reminder delivery is not configured." }, { headers: { "Cache-Control": "no-store" } });
    return Response.json(await dispatchDueReminders(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
