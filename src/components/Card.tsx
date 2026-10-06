import { useState } from "react";
import {
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { PlaceResult } from "@/services/places";

type CardProps = {
  place: PlaceResult;
};

export default function Card({ place }: CardProps) {
  const [vote, setVote] = useState<"up" | "down" | null>(null);
  const website = place.website;
  const mapQuery = place.location
    ? `${place.location.latitude},${place.location.longitude}`
    : place.name;
  const mapUrl =
    place.location || place.placeId
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}${
          place.placeId
            ? `&query_place_id=${encodeURIComponent(place.placeId)}`
            : ""
        }`
      : null;

  return (
    <View style={styles.card}>
      {place.imageUrl ? (
        <Image
          source={{ uri: place.imageUrl }}
          style={styles.image}
          resizeMode="cover"
        />
      ) : null}

      <Text style={styles.placeName}>{place.name}</Text>
      <Text style={styles.placeAddress}>{place.address}</Text>
      {place.types.length > 0 ? (
        <Text style={styles.placeMeta}>
          {place.types.slice(0, 3).join(", ")}
        </Text>
      ) : null}
      {website ? (
        <Text
          accessibilityRole="link"
          onPress={() => void Linking.openURL(website)}
          style={[styles.placeMeta, styles.websiteLink]}
        >
          {website}
        </Text>
      ) : null}
      {mapUrl ? (
        <Pressable
          accessibilityRole="link"
          onPress={() => void Linking.openURL(mapUrl)}
          style={styles.mapLink}
        >
          <Text style={styles.mapLinkText}>View on Google Maps</Text>
        </Pressable>
      ) : null}

      <View style={styles.voteRow}>
        <Pressable
          accessibilityLabel={`Thumbs up for ${place.name}`}
          accessibilityRole="button"
          onPress={() =>
            setVote((currentVote) => (currentVote === "up" ? null : "up"))
          }
          style={[
            styles.voteButton,
            vote === "up" && styles.voteButtonActiveUp,
          ]}
        >
          <Text style={styles.voteIcon}>👍</Text>
        </Pressable>

        <Pressable
          accessibilityLabel={`Thumbs down for ${place.name}`}
          accessibilityRole="button"
          onPress={() =>
            setVote((currentVote) => (currentVote === "down" ? null : "down"))
          }
          style={[
            styles.voteButton,
            vote === "down" && styles.voteButtonActiveDown,
          ]}
        >
          <Text style={styles.voteIcon}>👎</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#edffff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#d4ffff",
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: 180,
    borderRadius: 8,
    marginBottom: 12,
  },
  placeName: {
    fontSize: 18,
    fontWeight: "600",
    color: "#000036",
    marginBottom: 4,
  },
  placeAddress: {
    fontSize: 14,
    color: "#000022",
    marginBottom: 6,
  },
  placeMeta: {
    fontSize: 12,
    color: "#00004a",
  },
  websiteLink: {
    color: "#00000f",
    textDecorationLine: "underline",
  },
  mapLink: {
    alignSelf: "flex-start",
    marginTop: 8,
    paddingVertical: 4,
  },
  mapLinkText: {
    color: "#00000f",
    fontSize: 13,
    fontWeight: "600",
  },
  voteRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#d9f5ff",
  },
  voteButton: {
    width: 24,
    height: 24,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e7f7ff",
    borderWidth: 1,
    borderColor: "#cfeeff",
  },
  voteButtonActiveUp: {
    backgroundColor: "#d1fae5",
    borderColor: "#86efac",
  },
  voteButtonActiveDown: {
    backgroundColor: "#fee2e2",
    borderColor: "#fca5a5",
  },
  voteIcon: {
    fontSize: 18,
    lineHeight: 20,
  },
});
