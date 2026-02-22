#!/bin/bash
# Convert BASt LCL (Germany) DAT files to compact JSON for RDSExpert TMC map
# Input:  POINTS.DAT, POFFSETS.DAT, NAMES.DAT from BASt LCL ZIP
# Output: 58_1.json (CID 58, TABCD 1)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_DIR="$SCRIPT_DIR/../public/tmc/LCL22_english/LCL22.0.D_230515"
OUT_FILE="$SCRIPT_DIR/../public/tmc/58_1.json"

if [ ! -f "$DATA_DIR/POINTS.DAT" ]; then
  echo "Error: POINTS.DAT not found in $DATA_DIR"
  echo "Run: cd public/tmc && unzip bast_lcl.zip"
  exit 1
fi

echo "Building Germany TMC location database (CID:58, TABCD:1)..."

# Step 1: Build names lookup (NID -> NAME)
# Step 2: Build offsets lookup (LCD -> NEG_OFF, POS_OFF)
# Step 3: Parse POINTS.DAT and join everything into JSON

awk -F';' '
BEGIN {
  # Read NAMES.DAT first (ARGV[1])
  # Fields: CID;LID;NID;NAME;NCOMMENT;OFFICIALNAME
  nameFile = 1
  offsetFile = 2
  pointFile = 3
}

ARGIND == 1 && FNR > 1 {
  # Names: key=NID, value=NAME
  nid = $3
  name = $4
  gsub(/"/, "\\\"", name)  # escape quotes
  names[nid] = name
}

ARGIND == 2 && FNR > 1 {
  # Offsets: LCD -> NEG_OFF_LCD, POS_OFF_LCD
  lcd = $3
  neg[lcd] = $4
  pos[lcd] = $5
}

ARGIND == 3 && FNR > 1 {
  # Points: CID;TABCD;LCD;CLASS;TCD;STCD;JUNCTIONNUMBER;RNID;N1ID;N2ID;POL_LCD;OTH_LCD;SEG_LCD;ROA_LCD;...;XCOORD;YCOORD;...
  lcd = $3
  n1id = $9    # First name ID
  xcoord = $23 # Longitude * 100000 with + sign
  ycoord = $24 # Latitude * 100000 with + sign

  # Skip entries without coordinates
  if (xcoord == "" || ycoord == "") next

  # Parse coordinates: remove + sign, divide by 100000
  gsub(/\+/, "", xcoord)
  gsub(/\+/, "", ycoord)
  lon = xcoord / 100000
  lat = ycoord / 100000

  # Get name
  locName = ""
  if (n1id != "" && n1id in names) locName = names[n1id]

  # Get road reference from ROA_LCD -> we skip this for simplicity, use SEG road number instead
  # RNID field (col 8) sometimes has road info

  # Get prev/next
  prevLcd = (lcd in neg) ? neg[lcd] : 0
  nextLcd = (lcd in pos) ? pos[lcd] : 0

  # Store for output
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
    # name (can be empty)
    if (locNames[lcd] != "") {
      printf ",\"%s\"", locNames[lcd]
    } else {
      printf ",\"\""
    }
    # prev, next (0 = none)
    printf ",%s,%s]", prevs[lcd], nexts[lcd]
  }
  printf "}\n"
}
' "$DATA_DIR/NAMES.DAT" "$DATA_DIR/POFFSETS.DAT" "$DATA_DIR/POINTS.DAT" > "$OUT_FILE"

SIZE=$(wc -c < "$OUT_FILE")
ENTRIES=$(grep -o '":' "$OUT_FILE" | wc -l)
echo "Done: $OUT_FILE ($ENTRIES locations, $SIZE bytes)"
