// Great-circle distance between two WGS84 coordinates, in metres. Used to verify a fix was
// submitted at (roughly) the same place as the report it claims to fix.

const EARTH_RADIUS_M = 6_371_000;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

// Default tolerance for "the fix is at the reported spot". Generous enough for GPS drift and
// a fixer standing across a street, tight enough to catch a fix submitted from a wrong area.
export const FIX_PROXIMITY_METERS = 150;

export function isWithinProximity(
  reportLat: number,
  reportLon: number,
  fixLat: number,
  fixLon: number,
  toleranceMeters: number = FIX_PROXIMITY_METERS
): boolean {
  return haversineMeters(reportLat, reportLon, fixLat, fixLon) <= toleranceMeters;
}
