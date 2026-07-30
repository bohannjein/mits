import { canAdminister } from "@/lib/auth/roles";
import { getSessionUserFor } from "@/lib/auth/session";
import { getFormSchema } from "@/lib/form-schemas";

/* Loads one schema into the builder. Admin only — a form definition names internal
   categories and routing hints, and only admins may edit them anyway. */

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUserFor(request);
  if (!user) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }
  if (!canAdminister(user.role)) {
    return Response.json({ error: "Keine Berechtigung." }, { status: 403 });
  }

  const { id } = await params;
  const schema = getFormSchema(id);
  if (!schema) {
    return Response.json({ error: "Schema nicht gefunden." }, { status: 404 });
  }

  return Response.json({ schema });
}
