package com.example.korearadio.ui.main

import android.app.Activity
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation3.runtime.NavKey
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.example.korearadio.MyMediaLibraryService
import com.example.korearadio.data.DefaultDataRepository
import com.google.common.util.concurrent.MoreExecutors

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(
    onItemClick: (NavKey) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: MainScreenViewModel = viewModel { MainScreenViewModel(DefaultDataRepository()) }
) {
    val context = LocalContext.current
    val sharedPref = remember { context.getSharedPreferences("korea_radio_prefs", Context.MODE_PRIVATE) }

    // 네이티브 미디어 세션 제어용 미디어 컨트롤러 선언 및 생명주기 관리
    var mediaController by remember { mutableStateOf<MediaController?>(null) }
    DisposableEffect(context) {
        val sessionToken = SessionToken(context, ComponentName(context, MyMediaLibraryService::class.java))
        val controllerFuture = MediaController.Builder(context, sessionToken).buildAsync()

        controllerFuture.addListener({
            try {
                mediaController = controllerFuture.get()
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }, MoreExecutors.directExecutor())

        onDispose {
            mediaController?.let {
                MediaController.releaseFuture(controllerFuture)
            }
        }
    }

    var serverAddress by remember { mutableStateOf(sharedPref.getString("server_address", "") ?: "") }
    var serverPort by remember { mutableStateOf(sharedPref.getString("server_port", "") ?: "") }
    var securityToken by remember { mutableStateOf(sharedPref.getString("security_token", "") ?: "") }
    
    var isConfigured by remember { 
        mutableStateOf(
            sharedPref.getString("server_address", "")?.isNotEmpty() == true
        ) 
    }
    var isEditingConfig by remember { mutableStateOf(false) }

    if (!isConfigured || isEditingConfig) {
        // 프리미엄 다크 테마 기반의 설정 입력 폼 UI
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color(0xFF121824)) // Sleek Dark Navy Background
                .padding(24.dp),
            contentAlignment = Alignment.Center
        ) {
            // 이미 설정된 서버 정보가 있을 때만 설정창을 닫을 수 있는 취소(X) 버튼을 노출
            if (isConfigured) {
                IconButton(
                    onClick = { 
                        // 설정 값 원상복구
                        serverAddress = sharedPref.getString("server_address", "") ?: ""
                        serverPort = sharedPref.getString("server_port", "") ?: ""
                        securityToken = sharedPref.getString("security_token", "") ?: ""
                        isEditingConfig = false 
                    },
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(16.dp)
                        .size(40.dp)
                        .background(Color(0xFF334155), RoundedCornerShape(20.dp))
                ) {
                    Text("❌", fontSize = 16.sp, color = Color.White)
                }
            }

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFF1E293B), RoundedCornerShape(16.dp))
                    .padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Text(
                    text = "📻 Korea Radio 설정",
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White
                )

                Text(
                    text = "Home Assistant 애드온의 접속 정보를 입력하세요.",
                    fontSize = 13.sp,
                    color = Color(0xFF94A3B8)
                )

                Spacer(modifier = Modifier.height(8.dp))

                OutlinedTextField(
                    value = serverAddress,
                    onValueChange = { serverAddress = it },
                    label = { Text("서버 주소 (IP 또는 도메인)") },
                    placeholder = { Text("예: 192.168.0.100") },
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = Color(0xFF3B82F6),
                        unfocusedBorderColor = Color(0xFF475569),
                        focusedLabelColor = Color(0xFF3B82F6),
                        unfocusedLabelColor = Color(0xFF94A3B8),
                        focusedTextColor = Color.White,
                        unfocusedTextColor = Color.White
                    ),
                    modifier = Modifier.fillMaxWidth()
                )

                OutlinedTextField(
                    value = serverPort,
                    onValueChange = { serverPort = it },
                    label = { Text("포트 번호 (선택사항)") },
                    placeholder = { Text("예: 3005 (비워두면 포트 생략)") },
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = Color(0xFF3B82F6),
                        unfocusedBorderColor = Color(0xFF475569),
                        focusedLabelColor = Color(0xFF3B82F6),
                        unfocusedLabelColor = Color(0xFF94A3B8),
                        focusedTextColor = Color.White,
                        unfocusedTextColor = Color.White
                    ),
                    modifier = Modifier.fillMaxWidth()
                )

                OutlinedTextField(
                    value = securityToken,
                    onValueChange = { securityToken = it },
                    label = { Text("보안 토큰 (Token)") },
                    placeholder = { Text("애드온에 구성된 토큰") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = Color(0xFF3B82F6),
                        unfocusedBorderColor = Color(0xFF475569),
                        focusedLabelColor = Color(0xFF3B82F6),
                        unfocusedLabelColor = Color(0xFF94A3B8),
                        focusedTextColor = Color.White,
                        unfocusedTextColor = Color.White
                    ),
                    modifier = Modifier.fillMaxWidth()
                )

                Spacer(modifier = Modifier.height(12.dp))

                Button(
                    onClick = {
                        if (serverAddress.trim().isNotEmpty()) {
                            sharedPref.edit().apply {
                                putString("server_address", serverAddress.trim())
                                putString("server_port", serverPort.trim())
                                putString("security_token", securityToken.trim())
                                apply()
                            }
                            isConfigured = true
                            isEditingConfig = false
                        }
                    },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(0xFF3B82F6),
                        contentColor = Color.White
                    ),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(50.dp),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text("저장 및 연결", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                }
            }
        }
    } else {
        // WebView 화면 및 설정 리셋용 플로팅 버튼 배치
        Box(modifier = Modifier.fillMaxSize()) {
            val baseUrl = remember(serverAddress, serverPort) {
                var addr = serverAddress.trim()
                if (!addr.startsWith("http://") && !addr.startsWith("https://")) {
                    addr = "http://$addr"
                }
                if (serverPort.trim().isNotEmpty()) {
                    "$addr:${serverPort.trim()}"
                } else {
                    addr
                }
            }
            val url = "$baseUrl/?token=$securityToken"
            
            AndroidView(
                factory = { ctx ->
                    WebView(ctx).apply {
                        webViewClient = object : WebViewClient() {
                            override fun onReceivedSslError(
                                view: WebView?,
                                handler: android.webkit.SslErrorHandler?,
                                error: android.net.http.SslError?
                            ) {
                                handler?.proceed() // HTTPS 사설 인증서/보안 프록시 SSL 에러 우회 처리
                            }
                        }
                        setBackgroundColor(android.graphics.Color.parseColor("#0f172a"))
                        // 웹뷰 JS와 네이티브 미디어 컨트롤러를 연결하는 브릿지 등록
                        addJavascriptInterface(WebAppInterface(ctx) { mediaController }, "Android")
                        settings.apply {
                            javaScriptEnabled = true
                            domStorageEnabled = true
                            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                            useWideViewPort = true
                            loadWithOverviewMode = true
                            displayZoomControls = false
                            
                            // 시스템 다크모드로 인한 웹페이지 자체 다크 테마 색상 반전/왜곡 방지
                            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
                                isAlgorithmicDarkeningAllowed = false
                            }
                        }
                        loadUrl(url)
                    }
                },
                modifier = Modifier.fillMaxSize()
            )

            // 설정 수정 버튼 (우측 상단 플로팅, 기존 설정을 즉시 삭제하지 않음)
            IconButton(
                onClick = {
                    isEditingConfig = true
                },
                modifier = Modifier
                    .padding(16.dp)
                    .size(48.dp)
                    .background(Color(0xCC1E293B), RoundedCornerShape(24.dp))
                    .align(Alignment.TopEnd)
            ) {
                Text("⚙️", fontSize = 20.sp)
            }
        }
    }
}

// 웹뷰 내의 자바스크립트 호출을 가로채 네이티브 백그라운드 재생 서비스(ExoPlayer)로 중계하는 클래스
class WebAppInterface(private val context: Context, private val controllerProvider: () -> MediaController?) {
    @android.webkit.JavascriptInterface
    fun playChannel(key: String, name: String, freq: String) {
        val controller = controllerProvider()
        if (controller != null) {
            val prefs = context.getSharedPreferences("korea_radio_prefs", Context.MODE_PRIVATE)
            val serverAddr = prefs.getString("server_address", "") ?: ""
            val serverPort = prefs.getString("server_port", "") ?: ""
            val token = prefs.getString("security_token", "") ?: ""

            var baseUrl = serverAddr
            if (!baseUrl.startsWith("http://") && !baseUrl.startsWith("https://")) {
                baseUrl = "http://$baseUrl"
            }
            val streamUrl = if (serverPort.isNotEmpty()) "$baseUrl:$serverPort/radio?keys=$key&token=$token" else "$baseUrl/radio?keys=$key&token=$token"

            val mediaItem = MediaItem.Builder()
                .setMediaId(key)
                .setUri(Uri.parse(streamUrl))
                .setMediaMetadata(
                    MediaMetadata.Builder()
                        .setTitle(name)
                        .setSubtitle(freq)
                        .setIsPlayable(true)
                        .build()
                )
                .build()

            (context as? Activity)?.runOnUiThread {
                // 백그라운드에서도 파괴되지 않고 미디어가 구동될 수 있도록 서비스를 Started 상태로 활성화
                val serviceIntent = Intent(context, MyMediaLibraryService::class.java)
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                    context.startForegroundService(serviceIntent)
                } else {
                    context.startService(serviceIntent)
                }

                controller.setMediaItem(mediaItem)
                controller.prepare()
                controller.play()
            }
        }
    }

    @android.webkit.JavascriptInterface
    fun stopChannel() {
        val controller = controllerProvider()
        if (controller != null) {
            (context as? Activity)?.runOnUiThread {
                controller.stop()
                // 서비스 인스턴스를 완전히 정리
                val serviceIntent = Intent(context, MyMediaLibraryService::class.java)
                context.stopService(serviceIntent)
            }
        }
    }
}

