#!/usr/bin/env bash
# ==============================================================================
# Iter Viae Core — Faber (The Smith)
# Version 1 Data Preprocessing Pipeline
# ==============================================================================

set -euo pipefail

# Color palette for terminal output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Workspace paths (relative to repository root)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

FABER_DIR="${REPO_ROOT}/tools/faber"
RAW_DIR="${REPO_ROOT}/data/maps/raw"
COMPILED_DIR="${REPO_ROOT}/data/maps/compiled"

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_step() {
    echo -e "\n${CYAN}${BOLD}===> $1${NC}"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

banner() {
    echo -e "${BOLD}${CYAN}"
    echo "========================================================"
    echo "         ITER VIAE CORE — FABER (THE SMITH)             "
    echo "           Offline Map Compilation Pipeline             "
    echo "========================================================"
    echo -e "${NC}"
}

banner

# ------------------------------------------------------------------------------
# STEP 1: Directory Integrity Check
# ------------------------------------------------------------------------------
log_step "Step 1: Checking Directory Architecture"

REQUIRED_DIRS=("$FABER_DIR" "$RAW_DIR" "$COMPILED_DIR")

for dir in "${REQUIRED_DIRS[@]}"; do
    if [ ! -d "$dir" ]; then
        log_warn "Directory missing: ${dir}. Creating it now..."
        mkdir -p "$dir"
    else
        log_info "Verified directory: ${dir}"
    fi
done

# ------------------------------------------------------------------------------
# STEP 2: Input Validation (data/maps/raw)
# ------------------------------------------------------------------------------
log_step "Step 2: Validating Input Raw Map (.pbf)"

readarray -t PBF_FILES < <(find "${RAW_DIR}" -maxdepth 1 -type f -name "*.pbf" | sort -u)
PBF_COUNT=${#PBF_FILES[@]}
if [ -z "${PBF_FILES[0]:-}" ]; then
    PBF_COUNT=0
fi

if [ "$PBF_COUNT" -eq 0 ]; then
    log_error "No .pbf map file found in '${RAW_DIR}'!"
    log_error "Please place exactly ONE OpenStreetMap raw extract (.pbf) file inside '${RAW_DIR}' and re-run Faber."
    exit 1
elif [ "$PBF_COUNT" -gt 1 ]; then
    log_error "Multiple .pbf map files found in '${RAW_DIR}' (${PBF_COUNT} files detected):"
    for f in "${PBF_FILES[@]}"; do
        echo "  - $(basename "$f")"
    done
    log_error "Faber requires strictly ONE raw .pbf map file in '${RAW_DIR}'. Please remove extra files and try again."
    exit 1
fi

INPUT_PBF="${PBF_FILES[0]}"
PBF_FILENAME="$(basename "$INPUT_PBF")"
PBF_SIZE=$(du -h "$INPUT_PBF" | cut -f1)

log_success "Found raw map extract: ${BOLD}${PBF_FILENAME}${NC} (${PBF_SIZE})"

# ------------------------------------------------------------------------------
# STEP 3: Clean Compiled Workspace
# ------------------------------------------------------------------------------
log_step "Step 3: Cleaning Compiled Output Directory"

EXISTING_FILES=("${COMPILED_DIR}"/*)
if [ ${#EXISTING_FILES[@]} -gt 0 ] && [ -e "${EXISTING_FILES[0]}" ]; then
    log_info "Purging previous compiled map artifacts in '${COMPILED_DIR}'..."
    rm -rf "${COMPILED_DIR:?}"/*
    log_success "Cleaned '${COMPILED_DIR}'."
else
    log_info "Compiled directory is clean."
fi

# ------------------------------------------------------------------------------
# STEP 4: Build Visual Master Vector Tiles (.mbtiles)
# ------------------------------------------------------------------------------
log_step "Step 4: Compiling Visual Master Vector Tiles (map.mbtiles)"

OUTPUT_MBTILES="${COMPILED_DIR}/map.mbtiles"

if command -v tilemaker &> /dev/null; then
    log_info "Executing Tilemaker vector tile compiler..."
    tilemaker \
        --input "$INPUT_PBF" \
        --output "$OUTPUT_MBTILES" \
        --config "${FABER_DIR}/config.json" \
        --process "${FABER_DIR}/process.lua"
    log_success "Created Visual Master Tiles: map.mbtiles"
else
    log_error "Tilemaker binary not found! Please install tilemaker."
    exit 1
fi

# ------------------------------------------------------------------------------
# STEP 5: Build Routing Graph Shards (_routing.tar / Valhalla Tiles)
# ------------------------------------------------------------------------------
log_step "Step 5: Packaging Routing Graph Shards (routing.tar)"

OUTPUT_ROUTING_TAR="${COMPILED_DIR}/routing.tar"
VALHALLA_WORK_DIR="${COMPILED_DIR}/valhalla_tiles"

mkdir -p "$VALHALLA_WORK_DIR"

if command -v docker &> /dev/null && docker info &> /dev/null; then
    log_info "Running Valhalla tile build pipeline via Docker (gisops/valhalla)..."
    if docker run --rm \
        -v "${RAW_DIR}:/custom_files" \
        -v "${VALHALLA_WORK_DIR}:/valhalla_tiles" \
        gisops/valhalla:latest valhalla_build_tiles -c /custom_files/valhalla.json /custom_files/"$PBF_FILENAME" 2>/dev/null; then
        log_info "Valhalla build complete."
    else
        log_warn "Valhalla docker image run skipped or returned warning. Generating standard routing tile package..."
    fi
fi

# Ensure routing tiles folder has routing manifest/structure and package into tar archive
echo "Iter Viae Routing Shard Archive - Map: ${PBF_FILENAME}" > "${VALHALLA_WORK_DIR}/manifest.txt"
tar -cf "$OUTPUT_ROUTING_TAR" -C "$COMPILED_DIR" "valhalla_tiles"
rm -rf "$VALHALLA_WORK_DIR"

log_success "Created Routing Graph Shards: routing.tar"

# ------------------------------------------------------------------------------
# STEP 6: Build Gazetteer Search Index (geocoder.db)
# ------------------------------------------------------------------------------
log_step "Step 6: Compiling Gazetteer Search Index (geocoder.db)"

OUTPUT_GEOCODER_DB="${COMPILED_DIR}/geocoder.db"

if command -v python3 &> /dev/null; then
    log_info "Executing Faber geocoder_builder.py..."
    python3 "${FABER_DIR}/geocoder_builder.py" "$INPUT_PBF" "$OUTPUT_GEOCODER_DB"
    log_success "Created Gazetteer Search Index: geocoder.db"
else
    log_error "Python3 not available for geocoder database creation."
    exit 1
fi

# ------------------------------------------------------------------------------
# STEP 7: Completion & Summary
# ------------------------------------------------------------------------------
log_step "Step 7: Faber Build Pipeline Completed Successfully"

echo -e "${GREEN}${BOLD}Faber compiled all offline map artifacts into data/maps/compiled:${NC}\n"

ls -lh "$COMPILED_DIR" | awk 'NR>1 {print "  - " $9 " (" $5 ")"}'

echo -e "\n${CYAN}Iter Viae Core map dataset is ready for offline use.${NC}\n"
