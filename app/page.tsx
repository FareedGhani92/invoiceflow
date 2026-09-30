import Workspace from "./workspace";
import { isPublicDemo, requireUser } from "./auth";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await requireUser("/");
  return (
    <Workspace
      userName={user.fullName || user.email.split("@")[0]}
      publicDemo={isPublicDemo()}
    />
  );
}
