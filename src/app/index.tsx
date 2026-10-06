import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";

import Card from "@/components/Card";
import {
  getPlaceDetails,
  resolveLocationName,
  searchNearbyPlaces,
  searchPlaceSuggestions,
  type LocationSuggestion,
  type PlaceResult,
  type SelectedLocation,
} from "@/services/places";

const DEFAULT_LOCATION: SelectedLocation = {
  name: "Current location",
  latitude: 37.7749,
  longitude: -122.4194,
};

const CATEGORY_OPTIONS = [
  "cafe",
  "restaurant",
  "park",
  "hospital",
  "temple",
  "gym",
  "spa",
  "landmark",
] as const;

const PLACE_TYPES: Record<(typeof CATEGORY_OPTIONS)[number], string> = {
  cafe: "cafe",
  restaurant: "restaurant",
  park: "park",
  hospital: "hospital",
  temple: "hindu_temple",
  gym: "gym",
  spa: "spa",
  landmark: "tourist_attraction",
};

export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const columns = width >= 1100 ? 3 : width >= 700 ? 2 : 1;
  const cardWidth = (width - 60 - (columns - 1) * 12) / columns;
  const [category, setCategory] =
    useState<(typeof CATEGORY_OPTIONS)[number]>("cafe");
  const [selectedLocation, setSelectedLocation] =
    useState<SelectedLocation | null>(null);
  const [locationDraft, setLocationDraft] = useState("");
  const [locationSuggestions, setLocationSuggestions] = useState<
    LocationSuggestion[]
  >([]);
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRequestIdRef = useRef(0);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    void loadCurrentLocation();
  }, []);

  useEffect(() => {
    if (!isEditingLocation) {
      return;
    }

    const trimmedInput = locationDraft.trim();
    if (!trimmedInput) {
      setLocationSuggestions([]);
      return;
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      void fetchLocationSuggestions(trimmedInput);
    }, 350);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [isEditingLocation, locationDraft, selectedLocation]);

  const fetchLocationSuggestions = async (input: string) => {
    try {
      const suggestions = await searchPlaceSuggestions(input, {
        languageCode: "en",
        ...(selectedLocation
          ? {
              locationBias: {
                circle: {
                  center: {
                    latitude: selectedLocation.latitude,
                    longitude: selectedLocation.longitude,
                  },
                  radius: 50000,
                },
              },
            }
          : {}),
      });
      setLocationSuggestions(suggestions);
    } catch (err) {
      setLocationSuggestions([]);
      setError(
        err instanceof Error
          ? err.message
          : "Unable to fetch suggested locations.",
      );
    }
  };

  const loadNearbyResults = async (
    location: SelectedLocation,
    categoryToSearch = category,
  ) => {
    const requestId = ++listRequestIdRef.current;
    setLoading(true);
    setError(null);
    setResults([]);
    setNextPageToken(null);

    try {
      const page = await searchNearbyPlaces(
        PLACE_TYPES[categoryToSearch],
        location,
        {
          pageSize: 5,
          languageCode: "en",
          radius: 1500,
        },
      );
      if (requestId === listRequestIdRef.current) {
        setResults(page.results);
        setNextPageToken(page.nextPageToken ?? null);
      }
    } catch (err) {
      if (requestId === listRequestIdRef.current) {
        setError(
          err instanceof Error ? err.message : "Unable to load nearby places.",
        );
      }
    } finally {
      if (requestId === listRequestIdRef.current) {
        setLoading(false);
      }
    }
  };

  const loadMorePlaces = async () => {
    if (
      !selectedLocation ||
      !nextPageToken ||
      loading ||
      loadingMoreRef.current
    ) {
      return;
    }

    const requestId = listRequestIdRef.current;
    const pageToken = nextPageToken;
    loadingMoreRef.current = true;
    setLoadingMore(true);

    try {
      const page = await searchNearbyPlaces(
        PLACE_TYPES[category],
        selectedLocation,
        {
          pageSize: 5,
          languageCode: "en",
          radius: 1500,
          pageToken,
        },
      );

      if (requestId === listRequestIdRef.current) {
        setResults((currentResults) => {
          const existingKeys = new Set(
            currentResults.map(
              (place) => place.placeId ?? `${place.name}-${place.address}`,
            ),
          );
          return [
            ...currentResults,
            ...page.results.filter(
              (place) =>
                !existingKeys.has(
                  place.placeId ?? `${place.name}-${place.address}`,
                ),
            ),
          ];
        });
        setNextPageToken(page.nextPageToken ?? null);
      }
    } catch (err) {
      if (requestId === listRequestIdRef.current) {
        setError(
          err instanceof Error ? err.message : "Unable to load more places.",
        );
      }
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  };

  const loadCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== "granted") {
        const fallbackLocation = {
          ...DEFAULT_LOCATION,
          name: "Default location",
        };
        setSelectedLocation(fallbackLocation);
        setLocationDraft(fallbackLocation.name);
        setLocationError(
          "Location permission denied. Nearby results will use a default location.",
        );
        await loadNearbyResults(fallbackLocation);
        return;
      }

      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const coordinates = {
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
      };
      const locationName = await resolveLocationName(coordinates, {
        languageCode: "en",
        fallbackName: DEFAULT_LOCATION.name,
      });

      const nextLocation: SelectedLocation = {
        name: locationName,
        ...coordinates,
      };

      setSelectedLocation(nextLocation);
      setLocationDraft(nextLocation.name);
      setLocationError(null);
      await loadNearbyResults(nextLocation);
    } catch (err) {
      const fallbackLocation = { ...DEFAULT_LOCATION };
      setSelectedLocation(fallbackLocation);
      setLocationDraft(fallbackLocation.name);
      setLocationError(
        err instanceof Error
          ? err.message
          : "Current location is unavailable. Make sure location services are enabled.",
      );
      await loadNearbyResults(fallbackLocation);
    } finally {
      setInitialLoading(false);
    }
  };

  const handleCategoryChange = async (
    nextCategory: (typeof CATEGORY_OPTIONS)[number],
  ) => {
    setCategory(nextCategory);

    if (!selectedLocation) {
      return;
    }

    await loadNearbyResults(selectedLocation, nextCategory);
  };

  const handleSuggestionSelect = async (suggestion: LocationSuggestion) => {
    try {
      setLoading(true);
      const details = await getPlaceDetails(suggestion.placeId, {
        languageCode: "en",
      });
      const nextLocation: SelectedLocation = {
        name: details.name || suggestion.description,
        latitude: details.latitude,
        longitude: details.longitude,
      };

      setSelectedLocation(nextLocation);
      setLocationDraft(nextLocation.name);
      setLocationSuggestions([]);
      setIsEditingLocation(false);
      await loadNearbyResults(nextLocation);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to use the selected place.",
      );
    } finally {
      setLoading(false);
    }
  };

  const currentLocationName = selectedLocation?.name ?? DEFAULT_LOCATION.name;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Nearby places</Text>

      <View style={styles.locationHeader}>
        <View style={styles.locationEditorWrap}>
          <TextInput
            value={isEditingLocation ? locationDraft : currentLocationName}
            onFocus={() => {
              if (!isEditingLocation) {
                setLocationDraft(currentLocationName);
                setIsEditingLocation(true);
              }
            }}
            onChangeText={setLocationDraft}
            placeholder="Search for a location"
            style={styles.locationInput}
            onSubmitEditing={() => {
              if (!locationDraft.trim()) {
                setLocationSuggestions([]);
                return;
              }

              void fetchLocationSuggestions(locationDraft.trim());
            }}
          />
          {isEditingLocation ? (
            <Pressable
              accessibilityLabel="Clear location search"
              accessibilityRole="button"
              onPress={() => {
                setLocationDraft("");
                setLocationSuggestions([]);
              }}
              style={styles.clearLocationButton}
            >
              <Text style={styles.clearLocationText}>×</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {isEditingLocation && locationSuggestions.length > 0 ? (
        <View style={styles.suggestionList}>
          {locationSuggestions.map((suggestion) => (
            <Pressable
              key={suggestion.placeId}
              onPress={() => void handleSuggestionSelect(suggestion)}
              style={styles.suggestionItem}
            >
              <Text style={styles.suggestionText}>
                {suggestion.description}
              </Text>
              {suggestion.secondaryText ? (
                <Text style={styles.suggestionMeta}>
                  {suggestion.secondaryText}
                </Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.categoryRow}>
        {CATEGORY_OPTIONS.map((option) => (
          <Pressable
            key={option}
            onPress={() => void handleCategoryChange(option)}
            style={[
              styles.categoryChip,
              category === option && styles.categoryChipActive,
            ]}
          >
            <Text
              style={[
                styles.categoryChipText,
                category === option && styles.categoryChipTextActive,
              ]}
            >
              {option}
            </Text>
          </Pressable>
        ))}
      </View>

      {(loading || initialLoading) && (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>
            {initialLoading
              ? "Getting your location..."
              : "Loading nearby places..."}
          </Text>
        </View>
      )}

      {locationError ? <Text style={styles.error}>{locationError}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <ScrollView
        contentContainerStyle={styles.list}
        scrollEventThrottle={300}
        onScroll={({ nativeEvent }) => {
          const { contentOffset, contentSize, layoutMeasurement } = nativeEvent;
          if (
            contentOffset.y + layoutMeasurement.height >=
            contentSize.height - 200
          ) {
            void loadMorePlaces();
          }
        }}
      >
        <View style={styles.cardGrid}>
          {results.map((place) => (
            <View
              key={`${place.placeId ?? place.name}-${place.address}`}
              style={{ width: cardWidth }}
            >
              <Card place={place} />
            </View>
          ))}
        </View>
        {loadingMore ? (
          <View style={styles.loadMoreIndicator}>
            <ActivityIndicator size="small" color="#2563eb" />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#d3d3ff",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    marginTop: 20,
    marginBottom: 16,
    color: "#111827",
  },
  locationHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  locationEditorWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#dbe3f0",
  },
  locationInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    paddingRight: 48,
    fontSize: 16,
    color: "#111827",
    width: "100%",
  },
  clearLocationButton: {
    position: "absolute",
    right: 4,
    width: 40,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  clearLocationText: {
    color: "#6b7280",
    fontSize: 24,
    lineHeight: 28,
  },
  suggestionList: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#dbe3f0",
    overflow: "hidden",
    marginBottom: 12,
  },
  suggestionItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eef2f7",
  },
  suggestionText: {
    fontSize: 15,
    color: "#111827",
    fontWeight: "600",
  },
  suggestionMeta: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 4,
  },
  categoryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 12,
  },
  categoryChip: {
    backgroundColor: "#a1d0ff",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 8,
  },
  categoryChipActive: {
    backgroundColor: "#a1ffff",
  },
  categoryChipText: {
    color: "#00004a",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  categoryChipTextActive: {
    color: "#00004a",
  },
  loadingBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    marginBottom: 12,
  },
  loadingText: {
    color: "#1f2937",
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 12,
  },
  error: {
    color: "#b91c1c",
    marginBottom: 12,
  },
  list: {
    paddingBottom: 24,
  },
  cardGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 12,
  },
  loadMoreIndicator: {
    paddingVertical: 16,
  },
});
