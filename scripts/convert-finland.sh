#!/bin/bash
# Convert Finland Digitraffic TMC location data to compact JSON
# Input:  fi_raw.json (downloaded from Digitraffic API)
# Output: 17_1.json (CID 17, TABCD 1)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RAW_FILE="$SCRIPT_DIR/../public/tmc/fi_raw.json"
OUT_FILE="$SCRIPT_DIR/../public/tmc/17_1.json"

if [ ! -f "$RAW_FILE" ]; then
  echo "Error: fi_raw.json not found. Download with:"
  echo "  curl -s -H 'Accept-Encoding: gzip' --compressed 'https://tie.digitraffic.fi/api/traffic-message/v1/locations' -o public/tmc/fi_raw.json"
  exit 1
fi

echo "Building Finland TMC location database (CID:17, TABCD:1)..."

# Extract Point features with coordinates using awk
# The JSON is pretty-printed so we can parse it line by line
awk '
BEGIN {
  printf "{"
  first = 1
  inFeature = 0
  hasCoords = 0
  lcd = ""
  lon = ""
  lat = ""
  name = ""
  negOff = ""
  posOff = ""
  road = ""
}

/"locationCode"/ {
  gsub(/[^0-9]/, "", $0)
  lcd = $0
}

/"type" : "Point"/ {
  hasCoords = 1
}

/"coordinates"/ && hasCoords {
  # Format: "coordinates" : [ 25.129260, 60.255430 ]
  gsub(/.*\[[ ]*/, "", $0)
  gsub(/[ ]*\].*/, "", $0)
  split($0, coords, ",")
  gsub(/[ ]/, "", coords[1])
  gsub(/[ ]/, "", coords[2])
  lon = coords[1]
  lat = coords[2]
}

/"firstName"/ {
  # "firstName" : "Länsisalmi",
  match($0, /: "([^"]*)"/, arr)
  if (arr[1] != "") name = arr[1]
}

/"roadName"/ {
  match($0, /: "([^"]*)"/, arr)
  if (arr[1] != "") road = arr[1]
}

/"negOffset"/ {
  gsub(/[^0-9]/, "", $0)
  if ($0 != "" && $0 != "0") negOff = $0
}

/"posOffset"/ {
  gsub(/[^0-9]/, "", $0)
  if ($0 != "" && $0 != "0") posOff = $0
}

/"subtypeCode" : "P/ {
  # This is a Point type location
}

/^  \}, \{$/ || /^  \} \]$/ {
  # End of feature - output if it has coordinates
  if (hasCoords && lcd != "" && lat != "" && lon != "") {
    if (!first) printf ","
    first = 0
    # Escape quotes in name
    gsub(/"/, "\\\"", name)
    printf "\"%s\":[%s,%s,\"%s\",%s,%s]", lcd, lat, lon, name, (negOff != "" ? negOff : "0"), (posOff != "" ? posOff : "0")
  }
  # Reset
  lcd = ""
  lon = ""
  lat = ""
  name = ""
  road = ""
  negOff = ""
  posOff = ""
  hasCoords = 0
}

END {
  # Handle last entry
  if (hasCoords && lcd != "" && lat != "" && lon != "") {
    if (!first) printf ","
    printf "\"%s\":[%s,%s,\"%s\",%s,%s]", lcd, lat, lon, name, (negOff != "" ? negOff : "0"), (posOff != "" ? posOff : "0")
  }
  printf "}\n"
}
' "$RAW_FILE" > "$OUT_FILE"

SIZE=$(wc -c < "$OUT_FILE")
echo "Done: $OUT_FILE ($SIZE bytes)"
