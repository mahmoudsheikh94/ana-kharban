type JordanPlace = {
  city: string;
  area: string;
  latitude: number;
  longitude: number;
};

const knownPlaces: JordanPlace[] = [
  { city: "عمان", area: "وسط عمان", latitude: 31.9539, longitude: 35.9106 },
  { city: "إربد", area: "وسط إربد", latitude: 32.5556, longitude: 35.85 },
  { city: "الزرقاء", area: "وسط الزرقاء", latitude: 32.0728, longitude: 36.087 },
  { city: "السلط", area: "وسط السلط", latitude: 32.0392, longitude: 35.7272 },
  { city: "الكرك", area: "وسط الكرك", latitude: 31.1801, longitude: 35.7047 },
  { city: "العقبة", area: "وسط العقبة", latitude: 29.5321, longitude: 35.0063 },
  { city: "جرش", area: "وسط جرش", latitude: 32.2787, longitude: 35.8993 },
  { city: "مادبا", area: "وسط مادبا", latitude: 31.7195, longitude: 35.7933 }
];

function distanceSquared(latitude: number, longitude: number, place: JordanPlace) {
  return (latitude - place.latitude) ** 2 + (longitude - place.longitude) ** 2;
}

export function inferJordanArea(latitude: number, longitude: number) {
  return knownPlaces.reduce((nearest, place) =>
    distanceSquared(latitude, longitude, place) < distanceSquared(latitude, longitude, nearest) ? place : nearest
  );
}
