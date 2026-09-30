export async function POST() {
  return Response.json(
    { error: "Sample invoices are displayed locally in the no-database preview." },
    { status: 410 },
  );
}
