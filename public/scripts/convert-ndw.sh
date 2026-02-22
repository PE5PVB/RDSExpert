#!/bin/bash
# Convert Netherlands NDW VILD TMC location data to compact JSON
# Input:  nl_raw.json (GeoJSON from Rijkswaterstaat WFS)
# Output: 38_1.json (CID 38, TABCD 1)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RAW_FILE="$SCRIPT_DIR/../public/tmc/nl_raw.json"
OUT_FILE="$SCRIPT_DIR/../public/tmc/38_1.json"

if [ ! -f "$RAW_FILE" ]; then
  echo "Error: nl_raw.json not found. Download with:"
  echo "  curl -s 'https://geo.rijkswaterstaat.nl/services/ogc/gdr/vild/ows?service=WFS&version=2.0.0&request=GetFeature&typeName=vild:alle_punten&outputFormat=application/json&srsName=EPSG:4326' -o public/tmc/nl_raw.json"
  exit 1
fi

echo "Building Netherlands TMC location database (CID:38, TABCD:1)..."

# Parse GeoJSON features line by line
awk '
BEGIN {
  printf "{"
  first = 1
}

{
  # Find all feature blocks with coordinates and loc_nr
  line = $0

  # Match patterns for each feature
  while (match(line, /"loc_nr":([0-9]+)/, lcd_arr)) {
    lcd = lcd_arr[1]
    rest = substr(line, RSTART)

    # Extract coordinates before this loc_nr (look backwards in full input)
    # Actually, let us use a different approach - process the whole file
    break
  }
}
' "$RAW_FILE" > /dev/null

# Simpler approach: use grep/sed to extract features one per line, then awk
# The GeoJSON has all features on essentially one line or a few lines
# Let us split by feature boundaries

# Use awk to parse the GeoJSON structure
awk -v RS='\\{\"type\":\"Feature\"' '
NR > 1 {
  # Extract loc_nr
  if (match($0, /"loc_nr":([0-9]+)/, arr)) {
    lcd = arr[1]
  } else next

  # Extract coordinates [lon, lat]
  if (match($0, /"coordinates":\[([0-9.e+-]+),([0-9.e+-]+)\]/, arr)) {
    lon = arr[1]
    lat = arr[2]
  } else next

  # Extract first_name
  name = ""
  if (match($0, /"first_name":"([^"]*)"/, arr)) {
    name = arr[1]
    # Trim whitespace
    gsub(/^[ ]+|[ ]+$/, "", name)
  }

  # Extract roadnumber
  road = ""
  if (match($0, /"roadnumber":"([^"]*)"/, arr)) {
    road = arr[1]
    gsub(/^[ ]+|[ ]+$/, "", road)
  }

  # Combine name with road
  displayName = name
  if (road != "" && road != " ") {
    if (displayName != "") displayName = displayName " (" road ")"
    else displayName = road
  }

  # Extract neg_off and pos_off
  negOff = 0
  posOff = 0
  if (match($0, /"neg_off":([0-9]+)/, arr)) negOff = arr[1]
  if (match($0, /"pos_off":([0-9]+)/, arr)) posOff = arr[1]

  # Output
  if (!first) printf ","
  first = 0
  gsub(/"/, "\\\"", displayName)
  printf "\"%s\":[%s,%s,\"%s\",%s,%s]", lcd, lat, lon, displayName, negOff, posOff
}

BEGIN { first = 1; printf "{" }
END { printf "}\n" }
' "$RAW_FILE" > "$OUT_FILE"

SIZE=$(wc -c < "$OUT_FILE")
echo "Done: $OUT_FILE ($SIZE bytes)"
