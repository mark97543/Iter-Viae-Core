package com.iterviae.navis

import android.database.sqlite.SQLiteDatabase
import android.util.Log
import fi.iki.elonen.NanoHTTPD
import java.io.ByteArrayInputStream
import java.io.File

class TileServer(port: Int, private val mbtilesPath: String) : NanoHTTPD(port) {

    private var db: SQLiteDatabase? = null

    init {
        try {
            val file = File(mbtilesPath)
            if (file.exists()) {
                val flags = SQLiteDatabase.OPEN_READONLY or SQLiteDatabase.NO_LOCALIZED_COLLATORS
                db = SQLiteDatabase.openDatabase(file.absolutePath, null, flags)
                Log.d("TileServer", "Successfully opened SQLite database: ${file.absolutePath}")
            } else {
                Log.e("TileServer", "SQLite database file does not exist: $mbtilesPath")
            }
        } catch (e: Exception) {
            Log.e("TileServer", "Failed to open SQLite database: $mbtilesPath", e)
        }
    }

    override fun serve(session: IHTTPSession): Response {
        val uri = session.uri

        if (uri.contains("tilejson.json")) {
            val isRaster = mbtilesPath.lowercase().contains("raster")
            val format = if (isRaster) "png" else "pbf"
            val json = """
                {
                  "tilejson": "2.2.0",
                  "name": "Navis Local Master Basemap",
                  "version": "1.0.0",
                  "scheme": "xyz",
                  "tiles": ["http://127.0.0.1:8080/tiles/{z}/{x}/{y}.$format"],
                  "minzoom": 0,
                  "maxzoom": 14,
                  "bounds": [-180.0, -85.0, 180.0, 85.0]
                }
            """.trimIndent()
            val resp = newFixedLengthResponse(Response.Status.OK, "application/json", json)
            resp.addHeader("Access-Control-Allow-Origin", "*")
            return resp
        }

        val parts = uri.trim('/').split('/')

        if (parts.size >= 3) {
            val zStr = parts[parts.size - 3]
            val xStr = parts[parts.size - 2]
            val yStr = parts[parts.size - 1].replace(".png", "").replace(".pbf", "")

            val z = zStr.toIntOrNull()
            val x = xStr.toIntOrNull()
            val y = yStr.toIntOrNull()

            if (z != null && x != null && y != null) {
                val maxAvailZoom = 14
                val targetZ = if (z > maxAvailZoom) maxAvailZoom else z
                val shift = z - targetZ
                val targetX = x shr shift
                val targetY = y shr shift

                val tmsY = (1 shl targetZ) - 1 - targetY
                var cursor = db?.rawQuery(
                    "SELECT tile_data FROM tiles WHERE zoom_level = ? AND tile_column = ? AND (tile_row = ? OR tile_row = ?)",
                    arrayOf(targetZ.toString(), targetX.toString(), tmsY.toString(), targetY.toString())
                )

                if (cursor != null && cursor.moveToFirst()) {
                    val bytes = cursor.getBlob(0)
                    cursor.close()

                    if (bytes != null && bytes.isNotEmpty()) {
                        val isRaster = mbtilesPath.lowercase().contains("raster")
                        val mime = if (isRaster) "image/png" else "application/x-protobuf"
                        val response = newFixedLengthResponse(
                            Response.Status.OK,
                            mime,
                            ByteArrayInputStream(bytes),
                            bytes.size.toLong()
                        )
                        response.addHeader("Access-Control-Allow-Origin", "*")
                        
                        if (!isRaster && bytes.size >= 2 && bytes[0] == 0x1f.toByte() && bytes[1] == 0x8b.toByte()) {
                            response.addHeader("Content-Encoding", "gzip")
                        }
                        
                        return response
                    }
                }
                cursor?.close()
            }
        }

        val emptyResponse = newFixedLengthResponse(Response.Status.NO_CONTENT, "text/plain", "")
        emptyResponse.addHeader("Access-Control-Allow-Origin", "*")
        return emptyResponse
    }

    fun stopServer() {
        try {
            db?.close()
            stop()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
}
