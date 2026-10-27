import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";

import { DEFAULT_TIME_ZONE, isTimeZone, TIME_ZONE_COOKIE } from "@/core";

/**
 * The viewer's time zone for this request: the device's zone from its
 * cookie, or UTC until the device has reported one. Read once per request.
 */
export const viewerZone = cache(async (): Promise<string> => {
  const value = (await cookies()).get(TIME_ZONE_COOKIE)?.value;
  return isTimeZone(value) ? value : DEFAULT_TIME_ZONE;
});
