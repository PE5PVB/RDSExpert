#!/bin/bash
# Generic converter for TMC Location Table Exchange Format (LTEF) DAT files
# Usage: bash convert-ltef.sh <DATA_DIR> <OUTPUT_FILE>
#
# DATA_DIR should contain: POINTS.DAT, POFFSETS.DAT, NAMES.DAT
# The CID and TABCD are read from POINTS.DAT automatically.
# Output: compact JSON file { "lcd": [lat, lon, "name", prevLcd, nextLcd], ... }

DATA_DIR="$1"
OUT_FILE="$2"

if [ -z "$DATA_DIR" ] || [ -z "$OUT_FILE" ]; then
  echo "Usage: $0 <DATA_DIR> <OUTPUT_FILE>"
  echo "Example: $0 public/tmc/LCL22_english/LCL22.0.D_230515 public/tmc/58_1.json"
  exit 1
fi

if [ ! -f "$DATA_DIR/POINTS.DAT" ]; then
  echo "Error: POINTS.DAT not found in $DATA_DIR"
  exit 1
fi

echo "Converting LTEF data from $DATA_DIR..."

awk -F';' '
ARGIND == 1 && FNR > 1 {
  nid = $3
  name = $4
  gsub(/"/, "\\\"", name)
  names[nid] = name
}

ARGIND == 2 && FNR > 1 {
  lcd = $3
  neg[lcd] = $4
  pos[lcd] = $5
}

ARGIND == 3 && FNR > 1 {
  lcd = $3
  n1id = $9
  xcoord = $23
  ycoord = $24
  if (xcoord == "" || ycoord == "") next
  gsub(/\+/, "", xcoord)
  gsub(/\+/, "", ycoord)
  lon = xcoord / 100000
  lat = ycoord / 100000
  locName = ""
  if (n1id != "" && n1id in names) locName = names[n1id]
  prevLcd = (lcd in neg && neg[lcd] != "") ? neg[lcd] : 0
  nextLcd = (lcd in pos && pos[lcd] != "") ? pos[lcd] : 0
  lcdList[++count] = lcd
  lats[lcd] = lat
  lons[lcd] = lon
  locNames[lcd] = locName
  prevs[lcd] = prevLcd
  nexts[lcd] = nextLcd
}

END {
  printf "{"
  first = 1
  for (i = 1; i <= count; i++) {
    lcd = lcdList[i]
    if (!first) printf ","
    first = 0
    printf "\"%s\":[%.5f,%.5f", lcd, lats[lcd], lons[lcd]
    if (locNames[lcd] != "") {
      printf ",\"%s\"", locNames[lcd]
    } else {
      printf ",\"\""
    }
    printf ",%s,%s]", prevs[lcd], nexts[lcd]
  }
  printf "}\n"
}
' "$DATA_DIR/NAMES.DAT" "$DATA_DIR/POFFSETS.DAT" "$DATA_DIR/POINTS.DAT" > "$OUT_FILE"

SIZE=$(wc -c < "$OUT_FILE")
echo "Done: $OUT_FILE ($SIZE bytes)"
