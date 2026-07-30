import { canAdminister } from "@/lib/auth/roles";
import { requireApiUser } from "@/lib/auth/session";
import { getFormSchema } from "@/lib/form-schemas";

/* Loads one schema into the builder. Admin only — a form definition names internal
   categories and routing hints, and only admins may edit them anyway. */

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const user = auth.user;
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
