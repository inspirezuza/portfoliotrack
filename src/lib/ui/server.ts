import { cookies } from "next/headers";
import { LANGUAGE_COOKIE_KEY, parseUiLanguage } from "@/lib/ui/translations";

export async function getServerUiLanguage() {
  const cookieStore = await cookies();

  return parseUiLanguage(cookieStore.get(LANGUAGE_COOKIE_KEY)?.value);
}
