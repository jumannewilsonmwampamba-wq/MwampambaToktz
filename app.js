// =============================================================================
// 1. MIPANGILIO YA SEVA, USALAMA WA TOKEN (JWT) NA VARIABLE KUU
// =============================================================================
const API_URL = "https://ndere.onrender.com";
let socket = null;
let currentVideoId = null; // Variable yako ipo hapa kama ulivyotaka mkuu!
let localStream = null;
let peerConnection = null;

// Hapa mfumo unasoma Token na Username zilizohifadhiwa kwenye simu ya mtumiaji
let currentUser = {
    username: localStorage.getItem("username") || "",
    token: localStorage.getItem("token") || ""
};

// Vigezo vya Kurasa (Pagination 10-10 kama ilivyo kwenye Python yako)
let currentVideoPage = 1;
let currentCommentPage = 1;
let currentChatUserPage = 1;
let currentActiveChatPartner = null;

// Mipangilio ya seva za WebRTC (STUN Servers za bure kutoka Google)
const rtcConfig = {
    iceServers: [{ urls: "stun:://google.com" }]
};

// Ukurasa ukifunguka kwa mara ya kwanza
window.addEventListener("DOMContentLoaded", () => {
    setupNavigationListeners();
    
    if (currentUser.token) {
        showMainApp();
    } else {
        // MAREKEBISHO: Inafuata class yako sahihi ya "active-page" kulingana na HTML yako
        document.querySelectorAll(".page").forEach(p => p.classList.remove("active-page"));
        let profilePage = document.getElementById("profile-page");
        if (profilePage) profilePage.classList.add("active-page");
    }
});

function showMainApp() {
    socket = new WebSocket(`wss://://onrender.com{currentUser.username}?token=${currentUser.token}`);
    setupWebSocketListeners();
    
    // MAREKEBISHO: Inafungua kurasa kwa kutumia class yako sahihi ya "active-page"
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active-page"));
    let homePage = document.getElementById("home-page");
    if (homePage) homePage.classList.add("active-page");
    
    switchVideoFeedTab("for_you");
}

// =============================================================================
// 2. MFUMO WA ENTRY / LOGIN / REGISTER (Inagonga /api/auth/entry)
// =============================================================================
async function handleUserAuthEntry(event) {
    if (event) event.preventDefault(); 
    
    let userInp = document.getElementById("auth-username").value.trim();
    let passInp = document.getElementById("auth-password").value.trim();
    
    if (!userInp || !passInp) return alert("Tafadhali jaza username na password mkuu!");

    let formData = new FormData();
    formData.append("username", userInp);
    formData.append("password", passInp);

    try {
        let response = await fetch(`${API_URL}/api/auth/entry`, {
            method: "POST",
            body: formData
        });
        let data = await response.json();
        
        if (response.ok && data.token) {
            localStorage.setItem("username", userInp);
            localStorage.setItem("token", data.token);
            currentUser.username = userInp;
            currentUser.token = data.token;
            
            alert("Umeingia kwenye mfumo wa JumanneTok Tz kwa mafanikio!");
            showMainApp();
        } else {
            alert(data.detail || "Hitilafu imetokea wakati wa kuingia au kusajili!");
        }
    } catch (error) {
        console.error("Mawasiliano na seva yamefeli:", error);
    }
}

let authForm = document.querySelector(".auth-form");
if (authForm) {
    authForm.removeAttribute("action");
    authForm.addEventListener("submit", handleUserAuthEntry);
}

// =============================================================================
// 3. INJINI YA VIDEO FEED (Inasoma /api/videos/stream - Mstari 221 wa Python)
// =============================================================================
async function switchVideoFeedTab(feedTabName) {
    let videoContainer = feedTabName === "friends" 
        ? document.getElementById("friends-videos-container") 
        : document.querySelector("#home-page .video-placeholder") || document.getElementById("home-page"); 
        
    if (!videoContainer) return;
    videoContainer.innerHTML = "<div style='padding:20px; text-align:center;'>Inatafuta video kwenye engine ya Python...</div>";

    let formData = new FormData();
    formData.append("page", currentVideoPage);
    formData.append("tab", feedTabName); 
    formData.append("token", currentUser.token); 

    try {
        let response = await fetch(`${API_URL}/api/videos/stream`, {
            method: "POST",
            body: formData
        });
        let videos = await response.json();
        videoContainer.innerHTML = "";

        if (!videos || videos.length === 0) {
            videoContainer.innerHTML = "<div style='padding:20px; text-align:center;'>Hakuna video zilizopatikana kwa sasa.</div>";
            return;
        }

        videos.forEach(video => {
            let card = `
                <div class="video-card" style="background:#111; margin-bottom:20px; padding:15px; border-radius:8px;">
                    <h4 style="margin:0 0 10px 0; color:#00cbff;">@${video.owner_username || 'user'}</h4>
                    <p style="margin:0 0 10px 0;">${video.description || ''}</p>
                    <video src="${video.video_url}" style="width:100%; border-radius:8px;" controls loop autoplay muted></video>
                    <div style="margin-top:10px; display:flex; gap:15px; flex-wrap: wrap;">
                        <button onclick="toggleLikeVideo('${video.video_id}')" style="background:none; border:none; color:white; cursor:pointer;">❤️ Like (${video.likes_count || 0})</button>
                        <button onclick="openCommentsSection('${video.video_id}')" style="background:none; border:none; color:white; cursor:pointer;">💬 Comment (${video.comments_count || 0})</button>
                        <button style="background:none; border:none; color:white;">👁️ Views (${video.views || 0})</button>
                        <button onclick="pinVideoOwner('${video.video_id}')" style="background:none; border:none; color:white; cursor:pointer;">📌 Pin</button>
                        <button onclick="downloadVideoWithWatermark('${video.video_id}')" style="background:none; border:none; color:white; cursor:pointer;">📥 Download</button>
                    </div>
                </div>
            `;
            videoContainer.insertAdjacentHTML("beforeend", card);
        });
    } catch (error) {
        console.error("Feli kuvuta video kutoka Python:", error);
    }
}

// =============================================================================
// 4. KUPAKIA VIDEO MPYA (Inagonga /api/videos/post - Mstari 172 wa Python)
// =============================================================================
async function handleNewVideoUpload() {
    let desc = prompt("Andika maelezo (description) ya video yako:");
    let tags = prompt("Weka tags (tenganisha kwa mkato mfano: comedy,music):");
    
    let fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "video/*";
    
    fileInput.onchange = async () => {
        if (fileInput.files.length === 0) return;
        
        let formData = new FormData();
        formData.append("description", desc || "Video mpya");
        formData.append("tags", tags || "video");
        formData.append("file", fileInput.files[0]); // Chagua faili la kwanza kwa usahihi kabisa
        formData.append("token", currentUser.token); 

        alert("Video inapakizwa na kukaguliwa na AI ya usalama, tafadhali subiri kidogo mkuu...");

        try {
            let response = await fetch(`${API_URL}/api/videos/post`, {
                method: "POST",
                body: formData
            });
            let data = await response.json();
            alert(data.message || data.detail);
            switchVideoFeedTab("for_you"); 
        } catch (error) {
            console.error("Kupakia video kulifeli:", error);
        }
    };
    
    fileInput.click();
}

let uploadBtn = document.querySelector(".tz-upload-btn");
if (uploadBtn) {
    uploadBtn.onclick = handleNewVideoUpload;
}

// =============================================================================
// 5. MIFUMO YA LIKES, PIN, NA DOWNLOADS 
// =============================================================================
async function toggleLikeVideo(videoId) {
    let formData = new FormData();
    formData.append("token", currentUser.token); 
    let response = await fetch(`${API_URL}/api/videos/${videoId}/like`, { method: "POST", body: formData });
    if (response.ok) switchVideoFeedTab("for_you");
}

async function pinVideoOwner(videoId) {
    let formData = new FormData();
    formData.append("token", currentUser.token); 
    let response = await fetch(`${API_URL}/api/videos/${videoId}/pin`, { method: "POST", body: formData });
    let data = await response.json();
    alert(data.message || data.detail);
}

async function downloadVideoWithWatermark(videoId) {
    let response = await fetch(`${API_URL}/api/videos/${videoId}/download`);
    let data = await response.json();
    alert("Chapa iliyowekwa: " + data.watermark);
    window.open(data.video_url, "_blank");
}

// =============================================================================
// 6. REALTIME SOGA & INJINI YA VIDEO CALL (Mstari 366-390 wa Python)
// =============================================================================
function setupWebSocketListeners() {
    socket.onmessage = async (event) => {
        let data = JSON.parse(event.data);
        
        if (data.sender && data.sender === currentActiveChatPartner && !data.type.startsWith("video_")) {
            let area = document.getElementById("chat-messages-area");
            area.insertAdjacentHTML("beforeend", `
                <div class="message received" style="margin-bottom:10px;">
                    <p style="background:#222; padding:8px; border-radius:5px; display:inline-block; margin:0;">${data.content}</p>
                </div>
            `);
            area.scrollTop = area.scrollHeight;
        }
        
        if (data.type === "msg_delivered_receipt") {
            let tick = document.getElementById(`tick-${data.msg_id}`);
            if (tick) {
                tick.className = "fas fa-check-double tick delivered"; 
                tick.style.color = "#00cbff"; 
            }
        }

        if (data.type === "video_offer") {
            if (confirm(`Mtumiaji @${data.sender} anakupigia simu ya video. Je, unapokea?`)) {
                currentActiveChatPartner = data.sender;
                document.getElementById("video-call-screen").classList.remove("hidden");
                
                localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                document.getElementById("localVideo").srcObject = localStream;
                
                peerConnection = new RTCPeerConnection(rtcConfig);
                localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
                
                peerConnection.ontrack = (e) => {
                    document.getElementById("remoteVideo").srcObject = e.streams[0];
                };
                
                await peerConnection.setRemoteDescription(new RTCSessionDescription(JSON.parse(data.content)));
                let answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                
                socket.send(JSON.stringify({
                    receiver: data.sender,
                    type: "video_answer",
                    content: JSON.stringify(answer)
                }));
            } else {
                socket.send(JSON.stringify({ receiver: data.sender, type: "call_rejected", content: "Simu imekataliwa" }));
            }
        }
        
        if (data.type === "video_answer") {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(JSON.parse(data.content)));
        }
        
        if (data.type === "call_rejected") {
            alert("Mlengwa amekata au amekataa simu yako ya video.");
            endLiveVideoCall();
        }
    };
}

async function initiateLiveVideoCall() {
    if (!currentActiveChatPartner) return alert("Tafadhali chagua mtu wa kumpigia simu kwanza!");
    
    document.getElementById("video-call-screen").classList.remove("hidden");
    
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    document.getElementById("localVideo").srcObject = localStream;
    
    peerConnection = new RTCPeerConnection(rtcConfig);
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    
    peerConnection.ontrack = (e) => {
        document.getElementById("remoteVideo").srcObject = e.streams[0];
    };
    
    let offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    
    socket.send(JSON.stringify({
        receiver: currentActiveChatPartner,
        type: "video_offer",
        content: JSON.stringify(offer)
    }));
}

function endLiveVideoCall() {
    document.getElementById("video-call-screen").classList.add("hidden");
    if (localStream) localStream.getTracks().forEach(track => track.stop());
    if (peerConnection) peerConnection.close();
}

let endCallBtn = document.getElementById("btn-end-call");
if (endCallBtn) endCallBtn.onclick = endLiveVideoCall;

async function loadChatProfilesList() {
    let formData = new FormData();
    formData.append("token", currentUser.token); 
    
    let response = await fetch(`${API_URL}/api/chat/users`, { method: "POST", body: formData });
    let users = await response.json();
    
    let list = document.getElementById("chat-list");
    if (!list) return;
    list.innerHTML = "";

    users.forEach(u => {
        list.insertAdjacentHTML("beforeend", `
            <div onclick="startPrivateChat('${u.username}')" style="cursor:pointer; padding:12px; border-bottom:1px solid #222; color:white;">
                <strong>@${u.username}</strong>
            </div>
        `);
    });
}

function startPrivateChat(partner) {
    currentActiveChatPartner = partner;
    document.getElementById("private-chat-box").classList.remove("hidden");
    document.getElementById("chat-target-name").innerText = "@" + partner;
    document.getElementById("chat-messages-area").innerHTML = "";
    
    document.getElementById("btn-send-message").onclick = () => {
        let txt = document.getElementById("chat-input-field").value; 
        sendPrivateMessage(txt);
    };
}

function sendPrivateMessage(txt) {
    if (!currentActiveChatPartner || !txt.trim()) return;
    
    let payload = { receiver: currentActiveChatPartner, type: "text", content: txt };
    socket.send(JSON.stringify(payload));
    
    let area = document.getElementById("chat-messages-area");
    let tempId = "msg-" + Date.now();
    
    area.insertAdjacentHTML("beforeend", `
        <div class="message sent" style="text-align:right; margin-bottom:10px;">
            <p style="background:#8a2be2; padding:8px; border-radius:5px; display:inline-block; margin:0; text-align:left;">${txt}</p>
            <div class="msg-status"><i class="fas fa-check" id="tick-${tempId}" style="color:gray; font-size:10px; margin-left:5px;"></i></div>
        </div>
    `);
    
    document.getElementById("chat-input-field").value = "";
    area.scrollTop = area.scrollHeight;
}

// =============================================================================
// 7. INJINI YA URUMBAZAJI WA MENYU (BOTTOM NAV & TOP NAV BAR)
// =============================================================================
function setupNavigationListeners() {
    let topTabs = document.querySelectorAll(".top-nav span");
    topTabs.forEach(tab => {
        tab.onclick = () => {
            topTabs.forEach(t => t.classList.remove("top-tab-active"));
            tab.classList.add("top-tab-active");
            if (tab.innerText.trim() === "For You") switchVideoFeedTab("for_you");
            if (tab.innerText.trim() === "Friends") switchVideoFeedTab("friends");
        };
    });

    let navButtons = document.querySelectorAll(".bottom-navigation-bar button, .bottom-nav button, .nav-item");
    navButtons.forEach(btn => {
        btn.onclick = () => {
            let label = btn.querySelector("span") ? btn.querySelector("span").innerText.trim() : "";
            
            // MAREKEBISHO: Inabadilisha kurasa kwa kutumia class yako sahihi ya "active-page"
            if (label === "Home") {
                document.querySelectorAll(".page").forEach(p => p.classList.remove("active-page"));
                document.getElementById("home-page").classList.add("active-page");
                switchVideoFeedTab("for_you");
            }
            else if (label === "Friends") {
                document.querySelectorAll(".page").forEach(p => p.classList.remove("active-page"));
                document.getElementById("friends-page").classList.add("active-page");
                switchVideoFeedTab("friends");
            }
            else if (label === "Inbox") {
                document.querySelectorAll(".page").forEach(p => p.classList.remove("page-active-page"));
                document.getElementById("inbox-page").classList.add("active-page");
                loadChatProfilesList(); 
            }
            else if (label === "Profile") {
                document.querySelectorAll(".page").forEach(p => p.classList.remove("active-page"));
                document.getElementById("profile-page").classList.add("active-page");
            }
        };
    });
                                                                                                                                                            }
    
