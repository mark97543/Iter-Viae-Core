#!/bin/bash
set -e

SERVER_IP="${1:-46.202.179.124}"

echo "============================================================"
echo "🚀 Iter Viae Server Upload Script"
echo "Target Server IP: $SERVER_IP"
echo "============================================================"

echo "📁 Creating server directories on $SERVER_IP..."
ssh "root@$SERVER_IP" "mkdir -p /etc/easypanel/projects/iterviae/tiles /etc/easypanel/projects/iterviae/valhalla /etc/easypanel/projects/iterviae/directus/database /etc/easypanel/projects/iterviae/directus/uploads"

echo ""
echo "📤 [1/2] Uploading map.mbtiles (12.15 GB)..."
rsync -P -z "/home/mark/Documents/Iter Viae Core/data/maps/compiled/map.mbtiles" "root@$SERVER_IP:/etc/easypanel/projects/iterviae/tiles/map.mbtiles"

echo ""
echo "📤 [2/2] Uploading routing.tar as valhalla_tiles.tar (20.13 GB)..."
rsync -P -z "/home/mark/Documents/Iter Viae Core/data/maps/compiled/routing.tar" "root@$SERVER_IP:/etc/easypanel/projects/iterviae/valhalla/valhalla_tiles.tar"

echo ""
echo "✅ Upload complete! All map and routing files are active on $SERVER_IP."
