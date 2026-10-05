export type Coordinates = {
  latitude: number;
  longitude: number;
};

export type PlaceResult = {
  placeId?: string;
  name: string;
  address: string;
  types: string[];
  website?: string;
  imageUrl?: string;
  location?: Coordinates | null;
};

export type LocationSuggestion = {
  placeId: string;
  description: string;
  mainText?: string;
  secondaryText?: string;
};

export type SelectedLocation = {
  name: string;
  latitude: number;
  longitude: number;
};

type GoogleLocationBias = {
  circle?: {
    center: Coordinates;
    radius: number;
  };
};

type GooglePlace = {
  id?: string;
  displayName?: {
    text?: string;
  };
  formattedAddress?: string;
  shortFormattedAddress?: string;
  types?: string[];
  websiteUri?: string;
  photos?: Array<{
    name?: string;
  }>;
  location?: Coordinates | null;
};

type GooglePlacesResponse = {
  places?: GooglePlace[];
  nextPageToken?: string;
};

export type PlaceSearchPage = {
  results: PlaceResult[];
  nextPageToken?: string;
};

type GoogleAutocompleteSuggestion = {
  placePrediction?: {
    placeId?: string;
    text?: {
      text?: string;
    };
    structuredFormat?: {
      mainText?: {
        text?: string;
      };
      secondaryText?: {
        text?: string;
      };
    };
  };
};

type GoogleAutocompleteResponse = {
  suggestions?: GoogleAutocompleteSuggestion[];
};

type GooglePlaceDetailResponse = {
  id?: string;
  displayName?: {
    text?: string;
  };
  formattedAddress?: string;
  types?: string[];
  websiteUri?: string;
  photos?: Array<{
    name?: string;
  }>;
  location?: Coordinates | null;
};

function getApiKey(): string {
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;

  if (!apiKey) {
    throw new Error(
      "Missing EXPO_PUBLIC_GOOGLE_PLACES_API_KEY. Add it to your .env or .env.local file.",
    );
  }

  return apiKey;
}

function buildImageUrl(apiKey: string, photoName?: string): string | undefined {
  if (!photoName) {
    return undefined;
  }

  return `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=400&key=${apiKey}`;
}

async function requestGooglePlaces<T>(
  endpoint: string,
  payload: Record<string, unknown>,
  fieldMask: string,
): Promise<T> {
  const apiKey = getApiKey();

  const response = await fetch(`https://places.googleapis.com/v1/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": fieldMask,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Google Places API request failed (${response.status}): ${errorText}`,
    );
  }

  return (await response.json()) as T;
}

export async function searchPlaces(
  textQuery: string,
  options: {
    pageSize?: number;
    languageCode?: string;
    locationBias?: GoogleLocationBias;
  } = {},
): Promise<PlaceResult[]> {
  const query = textQuery.trim();
  if (!query) {
    return [];
  }

  const data = await requestGooglePlaces<GooglePlacesResponse>(
    "places:searchText",
    {
      textQuery: query,
      pageSize: options.pageSize ?? 5,
      languageCode: options.languageCode ?? "en",
      ...(options.locationBias ? { locationBias: options.locationBias } : {}),
    },
    "places.id,places.displayName,places.formattedAddress,places.types,places.websiteUri,places.photos,places.location",
  );

  const apiKey = getApiKey();

  return (data.places ?? []).map((place) => ({
    placeId: place.id,
    name: place.displayName?.text ?? "Unknown place",
    address: place.formattedAddress ?? "Address not available",
    types: place.types ?? [],
    website: place.websiteUri ?? undefined,
    imageUrl: buildImageUrl(apiKey, place.photos?.[0]?.name),
    location: place.location ?? null,
  }));
}

export async function searchNearbyPlaces(
  category: string,
  location: Coordinates,
  options: {
    pageSize?: number;
    languageCode?: string;
    radius?: number;
    pageToken?: string;
  } = {},
): Promise<PlaceSearchPage> {
  const query = category.trim();
  if (!query) {
    return { results: [] };
  }

  const radius = options.radius ?? 1500;
  const data = await requestGooglePlaces<GooglePlacesResponse>(
    "places:searchText",
    {
      textQuery: query,
      includedType: query,
      strictTypeFiltering: true,
      pageSize: options.pageSize ?? 5,
      rankPreference: "DISTANCE",
      ...(options.pageToken ? { pageToken: options.pageToken } : {}),
      locationBias: {
        circle: {
          center: {
            latitude: location.latitude,
            longitude: location.longitude,
          },
          radius,
        },
      },
      languageCode: options.languageCode ?? "en",
    },
    "places.id,places.displayName,places.formattedAddress,places.types,places.websiteUri,places.photos,places.location,nextPageToken",
  );

  const apiKey = getApiKey();

  const results = (data.places ?? [])
    .map((place) => ({
      placeId: place.id,
      name: place.displayName?.text ?? "Unknown place",
      address: place.formattedAddress ?? "Address not available",
      types: place.types ?? [],
      website: place.websiteUri ?? undefined,
      imageUrl: buildImageUrl(apiKey, place.photos?.[0]?.name),
      location: place.location ?? null,
    }))
    .filter((place) => {
      if (!place.location) {
        return false;
      }

      const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
      const latitudeDelta = toRadians(
        place.location.latitude - location.latitude,
      );
      const longitudeDelta = toRadians(
        place.location.longitude - location.longitude,
      );
      const originLatitude = toRadians(location.latitude);
      const placeLatitude = toRadians(place.location.latitude);
      const haversine =
        Math.sin(latitudeDelta / 2) ** 2 +
        Math.cos(originLatitude) *
          Math.cos(placeLatitude) *
          Math.sin(longitudeDelta / 2) ** 2;
      const distance =
        6371000 *
        2 *
        Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));

      return distance <= radius;
    });

  return { results, nextPageToken: data.nextPageToken };
}

export async function resolveLocationName(
  location: Coordinates,
  options: {
    languageCode?: string;
    radius?: number;
    fallbackName?: string;
  } = {},
): Promise<string> {
  const fallbackName = options.fallbackName ?? "Current location";

  try {
    const data = await requestGooglePlaces<GooglePlacesResponse>(
      "places:searchNearby",
      {
        maxResultCount: 1,
        rankPreference: "DISTANCE",
        languageCode: options.languageCode ?? "en",
        locationRestriction: {
          circle: {
            center: {
              latitude: location.latitude,
              longitude: location.longitude,
            },
            radius: options.radius ?? 150,
          },
        },
      },
      "places.displayName,places.formattedAddress,places.shortFormattedAddress",
    );

    const nearestPlace = data.places?.[0];
    return (
      nearestPlace?.shortFormattedAddress ??
      nearestPlace?.formattedAddress ??
      nearestPlace?.displayName?.text ??
      fallbackName
    );
  } catch {
    return fallbackName;
  }
}

export async function searchPlaceSuggestions(
  text: string,
  options: {
    languageCode?: string;
    locationBias?: GoogleLocationBias;
  } = {},
): Promise<LocationSuggestion[]> {
  const input = text.trim();
  if (!input) {
    return [];
  }

  const data = await requestGooglePlaces<GoogleAutocompleteResponse>(
    "places:autocomplete",
    {
      input,
      languageCode: options.languageCode ?? "en",
      ...(options.locationBias ? { locationBias: options.locationBias } : {}),
    },
    "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat",
  );

  return (data.suggestions ?? []).flatMap((suggestion) => {
    const placePrediction = suggestion.placePrediction;
    if (!placePrediction?.placeId) {
      return [];
    }

    const description =
      placePrediction.text?.text ??
      placePrediction.structuredFormat?.mainText?.text ??
      "Location";

    return [
      {
        placeId: placePrediction.placeId,
        description,
        mainText: placePrediction.structuredFormat?.mainText?.text,
        secondaryText: placePrediction.structuredFormat?.secondaryText?.text,
      },
    ];
  });
}

export async function getPlaceDetails(
  placeId: string,
  options: {
    languageCode?: string;
  } = {},
): Promise<
  SelectedLocation & {
    address: string;
    types: string[];
    website?: string;
    imageUrl?: string;
  }
> {
  const trimmedId = placeId.trim();
  if (!trimmedId) {
    throw new Error("A Google Place ID is required.");
  }

  const apiKey = getApiKey();
  const query = new URLSearchParams({
    languageCode: options.languageCode ?? "en",
  });
  const response = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(trimmedId)}?${query}`,
    {
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "id,displayName,formattedAddress,types,websiteUri,photos,location",
      },
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Google Places API request failed (${response.status}): ${errorText}`,
    );
  }

  const data = (await response.json()) as GooglePlaceDetailResponse;

  if (
    !data.location ||
    typeof data.location.latitude !== "number" ||
    typeof data.location.longitude !== "number"
  ) {
    throw new Error("Selected location did not include valid coordinates.");
  }

  return {
    name: data.displayName?.text ?? "Selected location",
    latitude: data.location.latitude,
    longitude: data.location.longitude,
    address: data.formattedAddress ?? "Address not available",
    types: data.types ?? [],
    website: data.websiteUri ?? undefined,
    imageUrl: buildImageUrl(apiKey, data.photos?.[0]?.name),
  };
}
