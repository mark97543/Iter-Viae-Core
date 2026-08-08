#!/bin/bash
set -e
mkdir -p valhalla_dist/lib
# Run a container that copies resolved links into a tar stream, then extract it
docker run --rm --entrypoint sh ghcr.io/gis-ops/docker-valhalla/valhalla:latest -c "
mkdir -p /tmp/export_lib
export LD_LIBRARY_PATH=/usr/local/lib
for file in \$(ldd /usr/local/bin/valhalla_service | grep '=> /' | awk '{print \$3}'); do
    cp -L \"\$file\" /tmp/export_lib/
done
tar -cf - -C /tmp/export_lib .
" | tar -xf - -C valhalla_dist/lib/
echo "Done"
