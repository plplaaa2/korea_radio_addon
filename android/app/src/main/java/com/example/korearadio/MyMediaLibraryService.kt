package com.example.korearadio

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.PlaybackException
import androidx.media3.common.MediaMetadata
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.LibraryResult
import androidx.media3.session.MediaLibraryService
import androidx.media3.session.MediaSession
import androidx.media3.session.DefaultMediaNotificationProvider
import androidx.media3.extractor.DefaultExtractorsFactory
import androidx.media3.extractor.ExtractorsFactory
import androidx.media3.extractor.mp3.Mp3Extractor
import androidx.media3.extractor.ts.AdtsExtractor
import androidx.media3.extractor.ts.TsExtractor
import androidx.media3.session.CommandButton
import androidx.media3.session.MediaNotification
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.security.SecureRandom
import java.security.cert.X509Certificate
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager

class MyMediaLibraryService : MediaLibraryService() {

    private lateinit var mediaSession: MediaLibrarySession
    private lateinit var player: ExoPlayer
    private val serviceJob = SupervisorJob()
    private val serviceScope = CoroutineScope(Dispatchers.Main + serviceJob)

    // 라디오 채널 캐시 데이터 모델
    data class RadioChannel(
        val key: String,
        val name: String,
        val frequency: String
    )

    private var cachedChannels = mutableListOf<RadioChannel>()
    private var isListLoaded = false

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        setupUnsafeSsl()
        
        // Media3의 DefaultMediaNotificationProvider 디폴트 인스턴스 생성
        @OptIn(UnstableApi::class)
        val notificationProvider = DefaultMediaNotificationProvider(this)
            
        // 커스텀 프로바이더 데코레이터 적용 (가시성을 PUBLIC으로 강제 주입하여 잠금 화면 노출 보장)
        val customProvider = object : MediaNotification.Provider {
            @OptIn(UnstableApi::class)
            override fun createNotification(
                mediaSession: MediaSession,
                customLayout: ImmutableList<CommandButton>,
                actionFactory: MediaNotification.ActionFactory,
                onNotificationChangedCallback: MediaNotification.Provider.Callback
            ): MediaNotification {
                val mediaNotification = notificationProvider.createNotification(
                    mediaSession, customLayout, actionFactory, onNotificationChangedCallback
                )
                // 잠금 화면에서 미디어 컨트롤이 반드시 보이도록 PUBLIC 설정 강제 주입
                mediaNotification.notification.visibility = android.app.Notification.VISIBILITY_PUBLIC
                // Android 14+ 백그라운드 킬 방지를 위해 ongoing 속성 강제 주입
                mediaNotification.notification.flags = mediaNotification.notification.flags or android.app.Notification.FLAG_ONGOING_EVENT
                return mediaNotification
            }

            override fun handleCustomCommand(session: MediaSession, action: String, extras: Bundle): Boolean {
                return false
            }
        }
        
        setMediaNotificationProvider(customProvider)
        initializePlayer()
        loadRadioChannelsAsync()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // Media3 Default Notification Channel ID인 "media3_default_channel_id"로 세팅하여 불일치 에러를 원천 해결
            val channelId = "media3_default_channel_id" 
            val channelName = "Korea Radio Playback"
            // 중요도를 LOW에서 DEFAULT로 격상하여 락스크린 및 헤드업 활성화
            val importance = NotificationManager.IMPORTANCE_DEFAULT 
            val channel = NotificationChannel(channelId, channelName, importance).apply {
                description = "Korea Radio 백그라운드 재생 알림 채널"
                lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC // 시스템 레벨 잠금화면 노출 설정
            }
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun setupUnsafeSsl() {
        try {
            val trustAllCerts = arrayOf<TrustManager>(object : X509TrustManager {
                override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) {}
                override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {}
                override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
            })

            val sslContext = SSLContext.getInstance("TLS")
            sslContext.init(null, trustAllCerts, SecureRandom())
            val sslSocketFactory = sslContext.socketFactory

            javax.net.ssl.HttpsURLConnection.setDefaultSSLSocketFactory(sslSocketFactory)
            javax.net.ssl.HttpsURLConnection.setDefaultHostnameVerifier { _, _ -> true }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun initializePlayer() {
        val audioAttributes = AudioAttributes.Builder()
            .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
            .setUsage(C.USAGE_MEDIA)
            .build()

        // WavExtractor를 배제하고 Mp3Extractor와 AdtsExtractor, TsExtractor 등 필수 오디오 Extractor들만 주입하는 customExtractorsFactory 생성.
        // WAV 포맷 타입 85 스트림을 만났을 때 WavExtractor가 파싱 에러를 뱉는 대신 Mp3Extractor가 디코딩을 책임지도록 우회 처리.
        @OptIn(UnstableApi::class)
        val customExtractorsFactory = ExtractorsFactory {
            arrayOf(
                Mp3Extractor(),
                AdtsExtractor(),
                TsExtractor()
            )
        }

        player = ExoPlayer.Builder(this)
            .setMediaSourceFactory(
                androidx.media3.exoplayer.source.DefaultMediaSourceFactory(this, customExtractorsFactory)
            )
            // 웹뷰와의 동일 프로세스 내 오디오 포커스 충돌로 인한 강제 정지를 막기 위해 포커스 자동 제어를 false로 해제
            .setAudioAttributes(audioAttributes, false)
            .setHandleAudioBecomingNoisy(true) // 헤드폰 연결 해제 등 소음 발생 상황 대응
            .setWakeMode(C.WAKE_MODE_NETWORK) // 슬립 모드(화면 꺼짐) 시 CPU/네트워크 절전 방지
            .build()

        // 에러 발생 및 재생 상태 변경에 대한 명확한 추적을 위해 리스너 추가
        player.addListener(object : Player.Listener {
            override fun onPlayerError(error: PlaybackException) {
                super.onPlayerError(error)
                val cause = error.cause
                val errorCodeName = when (error.errorCode) {
                    PlaybackException.ERROR_CODE_IO_UNSPECIFIED -> "ERROR_CODE_IO_UNSPECIFIED"
                    PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED -> "ERROR_CODE_IO_NETWORK_CONNECTION_FAILED"
                    PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT -> "ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT"
                    PlaybackException.ERROR_CODE_IO_INVALID_HTTP_CONTENT_TYPE -> "ERROR_CODE_IO_INVALID_HTTP_CONTENT_TYPE"
                    PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS -> "ERROR_CODE_IO_BAD_HTTP_STATUS"
                    PlaybackException.ERROR_CODE_IO_FILE_NOT_FOUND -> "ERROR_CODE_IO_FILE_NOT_FOUND"
                    PlaybackException.ERROR_CODE_IO_NO_PERMISSION -> "ERROR_CODE_IO_NO_PERMISSION"
                    PlaybackException.ERROR_CODE_DECODER_INIT_FAILED -> "ERROR_CODE_DECODER_INIT_FAILED"
                    else -> "ErrorCode(${error.errorCode})"
                }
                android.util.Log.e(
                    "KoreaRadioPlayer", 
                    "ExoPlayer 재생 에러 발생! [코드: $errorCodeName] 메시지: ${error.message}, 원인 예외: ${cause?.javaClass?.name} - ${cause?.message}", 
                    error
                )
            }

            override fun onPlaybackStateChanged(playbackState: Int) {
                super.onPlaybackStateChanged(playbackState)
                val stateStr = when (playbackState) {
                    Player.STATE_IDLE -> "IDLE (대기)"
                    Player.STATE_BUFFERING -> "BUFFERING (버퍼링)"
                    Player.STATE_READY -> "READY (재생 준비 완료)"
                    Player.STATE_ENDED -> "ENDED (종료)"
                    else -> "UNKNOWN"
                }
                android.util.Log.i("KoreaRadioPlayer", "ExoPlayer 재생 상태 변경: $stateStr")
            }
        })

        // 잠금 화면 미디어 컨트롤 카드를 누를 시 앱 화면으로 안전하게 복귀할 수 있도록 세션 액티비티 PendingIntent 설정
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }
        val pendingIntent = PendingIntent.getActivity(this, 0, intent, flags)

        mediaSession = MediaLibrarySession.Builder(this, player, LibraryCallback())
            .setSessionActivity(pendingIntent)
            .build()
    }

    private fun buildBaseUrl(): String {
        val prefs = getSharedPreferences("korea_radio_prefs", Context.MODE_PRIVATE)
        var addr = prefs.getString("server_address", "") ?: ""
        val port = prefs.getString("server_port", "") ?: ""
        if (addr.isEmpty()) return ""
        
        if (!addr.startsWith("http://") && !addr.startsWith("https://")) {
            addr = "http://$addr"
        }
        
        return if (port.isNotEmpty()) "$addr:$port" else addr
    }

    private fun loadRadioChannelsAsync() {
        serviceScope.launch(Dispatchers.IO) {
            try {
                val prefs = getSharedPreferences("korea_radio_prefs", Context.MODE_PRIVATE)
                val token = prefs.getString("security_token", "") ?: ""
                val baseUrl = buildBaseUrl()

                if (baseUrl.isNotEmpty()) {
                    val urlString = "$baseUrl/get_radio_list?token=$token"
                    val url = URL(urlString)
                    val conn = url.openConnection() as HttpURLConnection
                    conn.requestMethod = "GET"
                    conn.connectTimeout = 5000
                    conn.readTimeout = 5000

                    if (conn.responseCode == 200) {
                        val reader = BufferedReader(InputStreamReader(conn.inputStream, "UTF-8"))
                        val response = StringBuilder()
                        var line: String?
                        while (reader.readLine().also { line = it } != null) {
                            response.append(line)
                        }
                        reader.close()

                        val json = JSONObject(response.toString())
                        val keys = json.keys()
                        val newList = mutableListOf<RadioChannel>()
                        while (keys.hasNext()) {
                            val key = keys.next()
                            val channelObj = json.getJSONObject(key)
                            val name = channelObj.optString("name", "알 수 없는 채널")
                            val freq = channelObj.optDouble("freq", 0.0)
                            val freqStr = if (freq > 0) "${freq} MHz" else ""
                            newList.add(RadioChannel(key, name, freqStr))
                        }
                        cachedChannels = newList
                        isListLoaded = true
                    }
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    // 안드로이드 오토와 폰에 연동하여 데이터 아이템 제공을 위한 콜백 클래스
    private inner class LibraryCallback : MediaLibrarySession.Callback {

        @OptIn(UnstableApi::class)
        override fun onGetLibraryRoot(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            params: LibraryParams?
        ): ListenableFuture<LibraryResult<MediaItem>> {
            // 루트 아이템 정의 (안드로이드 오토 브라우징 시작점)
            val rootItem = MediaItem.Builder()
                .setMediaId("[ROOT]")
                .setMediaMetadata(
                    MediaMetadata.Builder()
                        .setFolderType(MediaMetadata.FOLDER_TYPE_MIXED)
                        .setIsPlayable(false)
                        .build()
                )
                .build()
            return Futures.immediateFuture(LibraryResult.ofItem(rootItem, params))
        }

        @OptIn(UnstableApi::class)
        override fun onGetChildren(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            parentId: String,
            page: Int,
            pageSize: Int,
            params: LibraryParams?
        ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> {
            if (parentId == "[ROOT]") {
                val mediaItems = mutableListOf<MediaItem>()
                val prefs = getSharedPreferences("korea_radio_prefs", Context.MODE_PRIVATE)
                val token = prefs.getString("security_token", "") ?: ""
                val baseUrl = buildBaseUrl()

                if (cachedChannels.isNotEmpty()) {
                    for (channel in cachedChannels) {
                        val streamUrl = "$baseUrl/radio?keys=${channel.key}&token=$token&format=mp3"
                        val mediaItem = MediaItem.Builder()
                            .setMediaId(channel.key)
                            .setUri(Uri.parse(streamUrl))
                            .setMimeType(MimeTypes.AUDIO_MPEG)
                            .setMediaMetadata(
                                MediaMetadata.Builder()
                                    .setTitle(channel.name)
                                    .setSubtitle(channel.frequency)
                                    .setFolderType(MediaMetadata.FOLDER_TYPE_NONE)
                                    .setIsPlayable(true)
                                    .build()
                            )
                            .build()
                        mediaItems.add(mediaItem)
                    }
                } else {
                    // 서버 연동 정보가 없거나 채널이 로딩되지 않았을 경우 보여줄 가이드 항목
                    val guideItem = MediaItem.Builder()
                        .setMediaId("GUIDE_SETUP")
                        .setMediaMetadata(
                            MediaMetadata.Builder()
                                .setTitle("서버 연결 필요")
                                .setSubtitle("스마트폰 앱에서 Home Assistant 서버 설정을 해주세요.")
                                .setFolderType(MediaMetadata.FOLDER_TYPE_NONE)
                                .setIsPlayable(false)
                                .build()
                        )
                        .build()
                    mediaItems.add(guideItem)
                }
                return Futures.immediateFuture(LibraryResult.ofItemList(ImmutableList.copyOf(mediaItems), params))
            }
            return Futures.immediateFuture(LibraryResult.ofItemList(ImmutableList.of(), params))
        }

        // 아이템 클릭 시 재생 준비 동작
        override fun onAddMediaItems(
            mediaSession: MediaSession,
            controller: MediaSession.ControllerInfo,
            mediaItems: MutableList<MediaItem>
        ): ListenableFuture<MutableList<MediaItem>> {
            // 안드로이드 오토에서 재생 요청이 오면 Uri를 유지하여 돌려줌
            val resolvedItems = mediaItems.map { item ->
                // 캐시된 실주소 매핑
                val channel = cachedChannels.find { it.key == item.mediaId }
                if (channel != null) {
                    val prefs = getSharedPreferences("korea_radio_prefs", Context.MODE_PRIVATE)
                    val token = prefs.getString("security_token", "") ?: ""
                    val baseUrl = buildBaseUrl()
                    val streamUrl = "$baseUrl/radio?keys=${channel.key}&token=$token&format=mp3"
                    MediaItem.Builder()
                        .setMediaId(channel.key)
                        .setUri(Uri.parse(streamUrl))
                        .setMimeType(MimeTypes.AUDIO_MPEG)
                        .setMediaMetadata(
                            MediaMetadata.Builder()
                                .setTitle(channel.name)
                                .setSubtitle(channel.frequency)
                                .setIsPlayable(true)
                                .build()
                        )
                        .build()
                } else {
                    item
                }
            }.toMutableList()
            return Futures.immediateFuture(resolvedItems)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        super.onStartCommand(intent, flags, startId)
        return START_STICKY
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaLibrarySession? {
        return mediaSession
    }

    override fun onDestroy() {
        mediaSession.release()
        player.release()
        serviceJob.cancel()
        super.onDestroy()
    }
}
