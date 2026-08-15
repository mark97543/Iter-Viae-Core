package com.iterviae.navis

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.Settings
import android.util.Log
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import org.maplibre.android.MapLibre
import org.maplibre.android.camera.CameraPosition
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.geometry.LatLngBounds
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.Style
import org.maplibre.android.style.layers.FillLayer
import org.maplibre.android.style.layers.LineLayer
import org.maplibre.android.style.layers.RasterLayer
import org.maplibre.android.style.layers.Property
import org.maplibre.android.style.layers.PropertyFactory.*
import org.maplibre.android.style.sources.VectorSource
import org.maplibre.android.style.sources.RasterSource
import org.maplibre.android.style.sources.TileSet
import org.maplibre.android.style.sources.GeoJsonSource
import org.maplibre.geojson.Feature
import org.maplibre.geojson.FeatureCollection
import org.maplibre.geojson.LineString
import org.maplibre.geojson.Point
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream

class MainActivity : AppCompatActivity() {

    private lateinit var mapView: MapView
    private var mapLibreMap: MapLibreMap? = null
    private var activeWaypoints = mutableListOf<LatLng>()
    private var mbtilesPath: String? = null
    private var tileServer: TileServer? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Initialize Native MapLibre Instance
        MapLibre.getInstance(this)

        setContentView(R.layout.activity_main)

        mapView = findViewById(R.id.mapView)
        mapView.onCreate(savedInstanceState)

        checkPermissions()
        findLocalMbtilesFile()

        mapView.getMapAsync { map ->
            mapLibreMap = map
            setupMapStyle(map)
        }

        setupUIControls()
    }

    private fun checkPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            if (!Environment.isExternalStorageManager()) {
                try {
                    val intent = Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION)
                    intent.data = Uri.parse("package:$packageName")
                    startActivity(intent)
                } catch (e: Exception) {
                    val intent = Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION)
                    startActivity(intent)
                }
            }
        } else {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_EXTERNAL_STORAGE)
                != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(
                    this,
                    arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE, Manifest.permission.WRITE_EXTERNAL_STORAGE),
                    101
                )
            }
        }
    }

    private fun checkFileInDir(dir: File): String? {
        if (!dir.exists() || !dir.isDirectory) return null

        // Prioritize original 12.15GB master vector map file (map.mbtiles)
        val mapF = File(dir, "map.mbtiles")
        if (mapF.exists() && mapF.length() > 0) {
            return mapF.absolutePath
        }

        val rasterF = File(dir, "raster.mbtiles")
        if (rasterF.exists() && rasterF.length() > 0) {
            return rasterF.absolutePath
        }

        dir.listFiles()?.forEach { file ->
            if (file.isFile && file.extension.lowercase() == "mbtiles" && file.name != "dem.mbtiles" && file.length() > 0) {
                return file.absolutePath
            }
        }
        return null
    }

    private fun findLocalMbtilesFile() {
        val extDirs = getExternalFilesDirs(null)
        for (f in extDirs) {
            if (f != null) {
                var p: File? = f
                while (p != null) {
                    val candidateMapDir = File(p, "IterViae/maps")
                    checkFileInDir(candidateMapDir)?.let {
                        mbtilesPath = prepareLocalAccessibleDb(it)
                        Log.d("NavisMap", "Found master MBTiles volume path: $mbtilesPath")
                        return
                    }
                    val candidateIterDir = File(p, "IterViae")
                    checkFileInDir(candidateIterDir)?.let {
                        mbtilesPath = prepareLocalAccessibleDb(it)
                        Log.d("NavisMap", "Found master MBTiles IterViae path: $mbtilesPath")
                        return
                    }
                    p = p.parentFile
                }
            }
        }

        val storageRoot = File("/storage")
        if (storageRoot.exists() && storageRoot.isDirectory) {
            storageRoot.listFiles()?.forEach { vol ->
                if (vol.isDirectory) {
                    checkFileInDir(File(vol, "IterViae/maps"))?.let {
                        mbtilesPath = prepareLocalAccessibleDb(it)
                        Log.d("NavisMap", "Found master MBTiles in storage volume maps: $mbtilesPath")
                        return
                    }
                    checkFileInDir(File(vol, "IterViae"))?.let {
                        mbtilesPath = prepareLocalAccessibleDb(it)
                        Log.d("NavisMap", "Found master MBTiles in storage volume root: $mbtilesPath")
                        return
                    }
                    checkFileInDir(vol)?.let {
                        mbtilesPath = prepareLocalAccessibleDb(it)
                        Log.d("NavisMap", "Found master MBTiles direct in volume: $mbtilesPath")
                        return
                    }
                }
            }
        }

        val hardcoded = listOf(
            File("/sdcard/IterViae/maps"),
            File("/sdcard/IterViae"),
            File("/sdcard"),
            File("/storage/emulated/0/IterViae/maps"),
            File("/storage/emulated/0/IterViae")
        )
        for (dir in hardcoded) {
            checkFileInDir(dir)?.let {
                mbtilesPath = prepareLocalAccessibleDb(it)
                Log.d("NavisMap", "Found master MBTiles hardcoded: $mbtilesPath")
                return
            }
        }

        Log.e("NavisMap", "No MBTiles map file located on device or SD card!")
    }

    private fun prepareLocalAccessibleDb(srcPath: String): String {
        val srcFile = File(srcPath)
        if (srcFile.length() < 50 * 1024 * 1024) {
            val localDst = File(filesDir, srcFile.name)
            if (!localDst.exists() || localDst.length() != srcFile.length()) {
                try {
                    Log.d("NavisMap", "Copying ${srcFile.name} to internal app storage...")
                    FileInputStream(srcFile).use { input ->
                        FileOutputStream(localDst).use { output ->
                            input.copyTo(output)
                        }
                    }
                    Log.d("NavisMap", "Copy complete: ${localDst.absolutePath}")
                } catch (e: Exception) {
                    Log.e("NavisMap", "Failed to copy MBTiles to internal storage", e)
                    return srcPath
                }
            }
            return localDst.absolutePath
        }
        return srcPath
    }

    private fun setupMapStyle(map: MapLibreMap) {
        val styleBuilder = Style.Builder()

        if (mbtilesPath != null) {
            Log.d("NavisMap", "Initializing TileServer for master map: $mbtilesPath")
            try {
                tileServer?.stopServer()
                tileServer = TileServer(8080, mbtilesPath!!)
                tileServer?.start()
                Log.d("NavisMap", "TileServer running on port 8080")
            } catch (e: Exception) {
                Log.e("NavisMap", "TileServer start error", e)
            }

            val isRaster = mbtilesPath!!.lowercase().contains("raster")

            if (isRaster) {
                val tileUrl = "http://127.0.0.1:8080/tiles/{z}/{x}/{y}.png"
                Log.d("NavisMap", "Configuring RasterSource TileSet: $tileUrl")
                val tileSet = TileSet("2.2.0", tileUrl)
                tileSet.minZoom = 0f
                tileSet.maxZoom = 18f

                val rasterSource = RasterSource("mobile-raster", tileSet)
                styleBuilder.withSource(rasterSource)
                val rasterLayer = RasterLayer("mobile-raster-layer", "mobile-raster")
                styleBuilder.withLayer(rasterLayer)
            } else {
                // Vector Source for 12.15GB master map.mbtiles
                val tileUrl = "http://127.0.0.1:8080/tiles/{z}/{x}/{y}.pbf"
                Log.d("NavisMap", "Configuring VectorSource TileSet for map.mbtiles: $tileUrl")
                val tileSet = TileSet("2.2.0", tileUrl)
                tileSet.minZoom = 0f
                tileSet.maxZoom = 14f

                val vectorSource = VectorSource("openmaptiles", tileSet)
                styleBuilder.withSource(vectorSource)

                // Background layer
                val backgroundLayer = FillLayer("background-layer", "openmaptiles")
                    .withProperties(fillColor("#090d16"))
                styleBuilder.withLayer(backgroundLayer)

                // Landcover layer
                val landLayer = FillLayer("land-layer", "openmaptiles")
                    .withSourceLayer("landcover")
                    .withProperties(fillColor("#111827"))
                styleBuilder.withLayer(landLayer)

                // Water layer
                val waterLayer = FillLayer("water-layer", "openmaptiles")
                    .withSourceLayer("water")
                    .withProperties(fillColor("#0284c7"))
                styleBuilder.withLayer(waterLayer)

                // Boundary layer
                val boundaryLayer = LineLayer("boundary-layer", "openmaptiles")
                    .withSourceLayer("boundary")
                    .withProperties(lineColor("#475569"), lineWidth(1.5f))
                styleBuilder.withLayer(boundaryLayer)

                // Street & Highway Transportation layer
                val roadLayer = LineLayer("road-layer", "openmaptiles")
                    .withSourceLayer("transportation")
                    .withProperties(
                        lineColor("#38bdf8"),
                        lineWidth(2.5f),
                        lineCap(Property.LINE_CAP_ROUND),
                        lineJoin(Property.LINE_JOIN_ROUND)
                    )
                styleBuilder.withLayer(roadLayer)

                // Building Footprint layer
                val buildingLayer = FillLayer("building-layer", "openmaptiles")
                    .withSourceLayer("building")
                    .withProperties(fillColor("#1e293b"))
                styleBuilder.withLayer(buildingLayer)
            }
        } else {
            Log.w("NavisMap", "mbtilesPath is NULL. Setting demotiles URI")
            styleBuilder.fromUri("https://demotiles.maplibre.org/style.json")
        }

        map.setStyle(styleBuilder) { style ->
            Log.d("NavisMap", "Master Map style loaded successfully")
            val routeSource = GeoJsonSource("nav-route", FeatureCollection.fromFeatures(arrayOf()))
            style.addSource(routeSource)

            val routeLayer = LineLayer("nav-route-line", "nav-route")
                .withProperties(
                    lineColor("#38bdf8"),
                    lineWidth(6f),
                    lineCap(Property.LINE_CAP_ROUND),
                    lineJoin(Property.LINE_JOIN_ROUND)
                )
            style.addLayer(routeLayer)

            map.cameraPosition = CameraPosition.Builder()
                .target(LatLng(47.6062, -122.3321))
                .zoom(12.0)
                .build()
        }
    }

    private fun setupUIControls() {
        val btnSearch = findViewById<Button>(R.id.btnSearch)
        val etCoords = findViewById<EditText>(R.id.etCoords)
        val btnLoadTrip = findViewById<Button>(R.id.btnLoadTrip)
        val tvNavTitle = findViewById<TextView>(R.id.tvNavTitle)
        val tvNavSub = findViewById<TextView>(R.id.tvNavSub)

        btnSearch.setOnClickListener {
            val txt = etCoords.text.toString().trim()
            val parts = txt.split(Regex("[^0-9.-]+")).filter { it.isNotEmpty() }
            if (parts.size >= 2) {
                val lat = parts[0].toDoubleOrNull()
                val lng = parts[1].toDoubleOrNull()
                if (lat != null && lng != null) {
                    val target = LatLng(lat, lng)
                    activeWaypoints.clear()
                    activeWaypoints.add(target)

                    mapLibreMap?.easeCamera(CameraUpdateFactory.newLatLngZoom(target, 14.0))
                    tvNavTitle.text = "Heading to Target"
                    tvNavSub.text = "Coordinates: (${String.format("%.4f", lat)}, ${String.format("%.4f", lng)})"
                }
            }
        }

        btnLoadTrip.setOnClickListener {
            val intent = Intent(Intent.ACTION_GET_CONTENT)
            intent.type = "*/*"
            startActivityForResult(intent, 202)
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == 202 && resultCode == RESULT_OK) {
            data?.data?.let { uri ->
                try {
                    contentResolver.openInputStream(uri)?.use { stream ->
                        val jsonStr = stream.bufferedReader().use { it.readText() }
                        parseAndDrawTrip(jsonStr)
                    }
                } catch (e: Exception) {
                    Toast.makeText(this, "Failed to parse trip file", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private fun parseAndDrawTrip(jsonStr: String) {
        try {
            val pts = mutableListOf<LatLng>()
            if (jsonStr.trim().startsWith("[")) {
                val arr = JSONArray(jsonStr)
                for (i in 0 until arr.length()) {
                    val obj = arr.getJSONObject(i)
                    val lat = obj.optDouble("lat", obj.optDouble("latitude", Double.NaN))
                    val lng = obj.optDouble("lng", obj.optDouble("longitude", Double.NaN))
                    if (!lat.isNaN() && !lng.isNaN()) {
                        pts.add(LatLng(lat, lng))
                    }
                }
            } else {
                val obj = JSONObject(jsonStr)
                val arr = obj.optJSONArray("tripWaypoints") ?: obj.optJSONArray("waypoints") ?: obj.optJSONArray("points")
                if (arr != null) {
                    for (i in 0 until arr.length()) {
                        val item = arr.getJSONObject(i)
                        val lat = item.optDouble("lat", item.optDouble("latitude", Double.NaN))
                        val lng = item.optDouble("lng", item.optDouble("longitude", Double.NaN))
                        if (!lat.isNaN() && !lng.isNaN()) {
                            pts.add(LatLng(lat, lng))
                        }
                    }
                }
            }

            if (pts.isNotEmpty()) {
                activeWaypoints = pts
                drawRouteOnMap(pts)
            }
        } catch (e: Exception) {
            Toast.makeText(this, "Error reading trip file", Toast.LENGTH_SHORT).show()
        }
    }

    private fun drawRouteOnMap(pts: List<LatLng>) {
        val map = mapLibreMap ?: return
        val style = map.style ?: return

        val pointList = pts.map { Point.fromLngLat(it.longitude, it.latitude) }
        val lineString = LineString.fromLngLats(pointList)

        val routeSource = style.getSource("nav-route") as? GeoJsonSource
        routeSource?.setGeoJson(Feature.fromGeometry(lineString))

        if (pts.size > 1) {
            val boundsBuilder = LatLngBounds.Builder()
            pts.forEach { boundsBuilder.include(it) }
            map.easeCamera(CameraUpdateFactory.newLatLngBounds(boundsBuilder.build(), 100))
        } else {
            map.easeCamera(CameraUpdateFactory.newLatLngZoom(pts[0], 14.0))
        }

        findViewById<TextView>(R.id.tvNavTitle).text = "Heading to Waypoint ${pts.size}"
        findViewById<TextView>(R.id.tvNavSub).text = "${pts.size} stops on tactical route"
    }

    override fun onStart() {
        super.onStart()
        mapView.onStart()
    }

    override fun onResume() {
        super.onResume()
        mapView.onResume()
    }

    override fun onPause() {
        super.onPause()
        mapView.onPause()
    }

    override fun onStop() {
        super.onStop()
        mapView.onStop()
        tileServer?.stopServer()
    }

    override fun onLowMemory() {
        super.onLowMemory()
        mapView.onLowMemory()
    }

    override fun onDestroy() {
        super.onDestroy()
        mapView.onDestroy()
        tileServer?.stopServer()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        mapView.onSaveInstanceState(outState)
    }
}
