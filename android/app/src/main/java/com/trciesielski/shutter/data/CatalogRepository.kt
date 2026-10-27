package com.trciesielski.shutter.data

import com.trciesielski.shutter.BuildConfig
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.net.SocketTimeoutException

class CatalogRepository(
    private val catalogUrl: String = BuildConfig.SHUTTER_CATALOG_URL,
    private val baseUrl: String = BuildConfig.SHUTTER_MUSIC_BASE_URL,
    private val additionalOrigins: Set<String> = emptySet(),
    private val parser: JsonCatalogParser = JsonCatalogParser()
) {
    fun load(): Result<CatalogSnapshot> {
        val catalog = try { URI(catalogUrl) } catch (e: Exception) { return Result.failure(CatalogException(CatalogErrorCode.INVALID, false, cause = e)) }
        val base = try { URI(baseUrl) } catch (e: Exception) { return Result.failure(CatalogException(CatalogErrorCode.INVALID, false, cause = e)) }
        if (catalog.scheme != "https" || base.scheme != "https" || catalog.host == null || base.host == null || catalog.rawUserInfo != null || base.rawUserInfo != null) return Result.failure(CatalogException(CatalogErrorCode.INVALID, false))
        val origins = setOf(origin(catalog), origin(base)) + additionalOrigins
        var connection: HttpURLConnection? = null
        return try {
            connection = (URL(catalogUrl).openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = 15_000
                readTimeout = 15_000
                instanceFollowRedirects = false
                setRequestProperty("Accept", "application/json")
                useCaches = false
            }
            val status = connection.responseCode
            if (status !in 200..299) throw CatalogException(CatalogErrorCode.HTTP, status == 429 || status >= 500, status)
            if (connection.contentLengthLong > JsonCatalogParser.MAX_BYTES) throw CatalogException(CatalogErrorCode.TOO_LARGE, false)
            val bytes = connection.inputStream.use { input ->
                val output = java.io.ByteArrayOutputStream()
                val buffer = ByteArray(8192)
                while (true) {
                    val count = input.read(buffer)
                    if (count < 0) break
                    if (output.size() + count > JsonCatalogParser.MAX_BYTES) throw CatalogException(CatalogErrorCode.TOO_LARGE, false)
                    output.write(buffer, 0, count)
                }
                output.toByteArray()
            }
            Result.success(parser.parse(bytes.toString(Charsets.UTF_8), baseUrl, origins))
        } catch (e: CatalogException) { Result.failure(e) }
        catch (e: SocketTimeoutException) { Result.failure(CatalogException(CatalogErrorCode.TIMEOUT, true, cause = e)) }
        catch (e: IOException) { Result.failure(CatalogException(CatalogErrorCode.NETWORK, true, cause = e)) }
        finally { connection?.disconnect() }
    }

    private fun origin(uri: URI): String = "${uri.scheme}://${uri.host.lowercase()}${if (uri.port == -1) "" else ":${uri.port}"}"
}
