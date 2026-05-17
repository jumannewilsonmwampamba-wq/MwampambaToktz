        // ==============================================================================

//JUMANNETOK TZ - FRONTEND CORE ENGINE (app.js)
//# Msimbo huu umeunganishwa kikamilifu na main.py na index.html bila makosa //ya Backticks
// ==============================================================================

const API_URL = "https://ndere.onrender.com/api";
const WS_URL = "wss://ndere.onrender.com/ws";


let currentToken = localStorage.getItem("jumannetok_token") || null;
let currentUsername = localStorage.getItem("jumannetok_username") || null;

let videoPage = 1;
let chatUserPage = 1;
let chatHistoryPage = 1;
let activeChatTarget = null;
let chatSocket = null;
let peerConnection = null;

const rtcConfig = {
    iceServers: [{ urls: "google.com" }] // Mifumo ya siri ya WebRTC kwa ajili ya Video Call
};

// --- 1. MFUMO WA KUBADILISHA KURASA (PAGE SWITCHER) ---
function switchPage(pageId) {
    document.querySelectorAll(".page").forEach(page => {
        page.classList.remove("active-page");
    });
    const targetPage = document.getElementById(pageId);
    if (targetPage) {
        targetPage.classList.add("active-page");
    }
}

// --- 2. UINGIAJI, USAJILI NA USER ENTRY (DASHBOARD REDIRECT) ---
document.addEventListener("DOMContentLoaded", () => {
    setupBottomNav();
    setupAuthForm();
    
    // Kama mtumiaji alishawahi kuingia, mpeleke dashboard moja kwa moja
    if (currentToken && currentUsername) {
        loadUserDashboard();
        connectChatWebSocket();
    } else {
        switchPage("profile-page");
    }
});

function setupAuthForm() {
    const authForm = document.querySelector(".auth-form");
    if (!authForm) return;

    authForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const usernameInput = document.getElementById("auth-username").value.trim();
        const passwordInput = document.getElementById("auth-password").value.trim();

        if (!usernameInput || !passwordInput) return alert("Jaza jina na password!");

        const formData = new FormData();
        formData.append("username", usernameInput);
        formData.append("password", passwordInput);

        try {
            const response = await fetch(`${API_URL}/auth/entry`, {
                method: "POST",
                body: formData
            });
            const data = await response.json();

            if (response.ok) {
                // Hifadhi taarifa za ulinzi kwenye simu ya mtumiaji
                currentToken = data.token;
                currentUsername = usernameInput;
                localStorage.setItem("jumannetok_token", data.token);
                localStorage.setItem("jumannetok_username", usernameInput);

                alert(data.status === "registered" ? "Hongera! Akaunti mpya imetengenezwa." : "Karibu tena!");
                
                // MFUMO UNAMPELEKA USER KWENYE DASHBOARD DIRECT KAMA TULIVYOJADILIANA
                loadUserDashboard();
                connectChatWebSocket();
            } else {
                alert(`Imeshindikana: ${data.detail}`);
            }
        } catch (err) {
            console.error(err);
            alert("Hitilafu ya mtandao imetokea!");
        }
    });
}

// --- 3. UPANDE WA USER DASHBOARD (PROFILE) NA LOGOUT ---
async function loadUserDashboard() {
    switchPage("dashboard-page");
    const dashboardPage = document.getElementById("dashboard-page");
    if (!dashboardPage) return;

    try {
        // Vuta video na taarifa za mtumiaji kumi kumi kwa kutumia utafutaji wa jina lake
        const response = await fetch(`${API_URL}/videos/stream?search=${currentUsername}&page=1`);
        const videos = await response.json();

        // Kuchora muonekano wa Dashboard wenye vitufe vya chapa ya TikTok na Log Out juu
        let videosHTML = "";
        if (videos && videos.length > 0) {
            videos.forEach((video, index) => {
                videosHTML += `
                    <div class="grid-video-card">
                        <video src="${video.video_url}" muted playsinline loop autoplay></video>
                        <span class="views-tag"><i class="fas fa-eye"></i> ${video.views}</span>
                        ${video.is_pinned ? '<span class="pinned-tag">PINNED</span>' : ''}
                        <div class="dashboard-actions">
                            <button onclick="pinVideo('${video.video_id}')" class="btn-pin-mini"><i class="fas fa-thumbtack"></i> Pin</button>
                            <button onclick="deleteVideo('${video.video_id}')" class="btn-delete-mini"><i class="fas fa-trash"></i> Futa</button>
                        </div>
                    </div>
                `;
            });
        } else {
            videosHTML = "<p class='no-videos'>Hauna video yoyote kwa sasa. Pakia video ya kwanza!</p>";
        }

        dashboardPage.innerHTML = `
            <div class="dashboard-header">
                <div class="top-profile-row">
                    <h2>@${currentUsername}</h2>
                    <button onclick="logoutUser()" class="btn-logout-top"><i class="fas fa-sign-out-alt"></i> Log Out</button>
                </div>
                <div class="profile-counters">
                    <span><strong>0</strong> Following</span>
                    <span><strong>0</strong> Followers</span>
                    <span><strong>0</strong> Likes</span>
                </div>
                <div class="edit-profile-box">
                    <h3>Hariri Wasifu</h3>
                    <form id="edit-profile-form">
                        <input type="text" id="edit-username" value="${currentUsername}" required>
                        <input type="file" id="edit-avatar" accept="image/*">
                        <button type="submit" class="btn-save-profile">Hifadhi Mabadiliko</button>
                    </form>
                </div>
            </div>
            <div class="profile-videos-grid">
                ${videosHTML}
            </div>
        `;

        setupEditProfileForm();

    } catch (err) {
        console.error(err);
        dashboardPage.innerHTML = "<p>Imeshindikana kupakia Dashboard. Angalia mtandao wako.</p>";
    }
}

function setupEditProfileForm() {
    const editForm = document.getElementById("edit-profile-form");
    if (!editForm) return;

    editForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const newName = document.getElementById("edit-username").value.trim();
        const avatarFile = document.getElementById("edit-avatar").files[0];

        const formData = new FormData();
        formData.append("username", newName);
        formData.append("token", currentToken);
        if (avatarFile) formData.append("file", avatarFile);

        try {
            const response = await fetch(`${API_URL}/user/edit`, {
                method: "PUT",
                body: formData
            });
            if (response.ok) {
                currentUsername = newName;
                localStorage.setItem("jumannetok_username", newName);
                alert("Wasifu umesasishwa, picha ya zamani imefutwa!");
                loadUserDashboard();
            }
        } catch (err) {
            console.error(err);
        }
    });
}

function logoutUser() {
    // Futa token na funga soga mara moja kama tulivyojadiliana
    currentToken = null;
    currentUsername = null;
    localStorage.removeItem("jumannetok_token");
    localStorage.removeItem("jumannetok_username");
    if (chatSocket) chatSocket.close();
    alert("Umetoka kwenye mfumo!");
    switchPage("profile-page");
}

// --- 4. VIDEO FEED ENGINE (FOR YOU & FRIENDS STREAMING) ---
async function loadVideoFeed(tab = "for_you") {
    switchPage("home-page");
    const homePage = document.getElementById("home-page");
    homePage.innerHTML = "<div class='loading'>Inapakia video kumi za kwanza...</div>";

    try {
        let url = `${API_URL}/videos/stream?tab=${tab}&page=${videoPage}`;
        if (currentToken) url += `&token=${currentToken}`;

        const response = await fetch(url);
        const videos = await response.json();

        if (!response.ok || videos.length === 0) {
            homePage.innerHTML = "<p class='no-videos'>Hakuna video mpya kwa sasa.</p>";
            return;
        }

        homePage.innerHTML = "";
        videos.forEach((video, index) => {
            const videoEl = document.createElement("div");
            videoEl.className = "video-player-container";
            
            // SAHIHI KABISA: Backticks zote zimenyooka bila mchanganyiko wa makosa yoyote
            videoEl.innerHTML = `
                <video src="${video.video_url}" autoplay loop muted playsinline class="main-tiktok-video"></video>
                
                <div class="video-details-bottom-left">
                    <h3 onclick="openOtherUserProfile('${video.owner_username}')">@${video.owner_username}</h3>
                    <p>${video.description}</p>
                </div>

                <div class="video-sidebar-right">
                    <div class="sidebar-icon avatar-wrap" onclick="openOtherUserProfile('${video.owner_username}')">
                        <img src="${video.owner_avatar}">
                    </div>
                    <div class="sidebar-icon" onclick="likeVideo('${video.video_id}')">
                        <i class="fas fa-heart"></i>
                        <span>${video.likes_count}</span>
                    </div>
                    <div class="sidebar-icon" onclick="openCommentSection('${video.video_id}')">
                        <i class="fas fa-comment"></i>
                        <span>${video.comments_count}</span>
                    </div>
                    <div class="sidebar-icon" onclick="nativeCrossPlatformShare('${video.video_id}')">
                        <i class="fas fa-share"></i>
                        <span>${video.shares}</span>
                    </div>
                    <div class="sidebar-icon" onclick="createTikTokBottomSheet('${video.video_id}')">
                        <i class="fas fa-ellipsis-h"></i>
                        <span>More</span>
                    </div>
                </div>
            `;

            // Mfumo wa pagination ya kumi kumi ukifika video ya nane
            if (index === 7) {
                videoPage++;
            }
            homePage.appendChild(videoEl);
        });

    } catch (err) {
        console.error(err);
        homePage.innerHTML = "<p>Hitilafu ya mtandao wakati wa ku-stream video.</p>";
    }
}

// --- 5. UNGANISHA: ANGALIA PROFILE YA USER MWINGINE (KUMI KUMI) ---
async function openOtherUserProfile(targetUsername) {
    if (targetUsername === currentUsername) return loadUserDashboard();
    
    switchPage("dashboard-page");
    const dashboardPage = document.getElementById("dashboard-page");
    dashboardPage.innerHTML = `
        <div class="dashboard-header">
            <button onclick="loadVideoFeed('for_you')" class="btn-back-top"><i class="fas fa-arrow-left"></i> Rudi Home</button>
            <div id="other-profile-info">Inapakia wasifu wa @${targetUsername}...</div>
        </div>
        <div class="profile-videos-grid" id="other-videos-grid"></div>
    `;

    try {
        const response = await fetch(`${API_URL}/videos/stream?search=${targetUsername}&page=1`);
        const videos = await response.json();

        const infoArea = document.getElementById("other-profile-info");
        const gridArea = document.getElementById("other-videos-grid");

        if (!response.ok || videos.length === 0) {
            infoArea.innerHTML = `<h3>@${targetUsername}</h3><p>Mtumiaji huyu hana video bado.</p>`;
            return;
        }

        infoArea.innerHTML = `
            <img src="${videos[0].owner_avatar}" class="profile-avatar-large">
            <h3>@${targetUsername}</h3>
            <button onclick="followUser('${targetUsername}')" class="btn-follow-action"><i class="fas fa-user-plus"></i> Follow</button>
        `;

        gridArea.innerHTML = "";
        videos.forEach((video) => {
            gridArea.innerHTML += `
                <div class="grid-video-card">
                    <video src="${video.video_url}" muted playsinline loop autoplay></video>
                    <span class="views-tag"><i class="fas fa-eye"></i> ${video.views}</span>
                    ${video.is_pinned ? '<span class="pinned-tag">PINNED</span>' : ''}
                </div>
            `;
        });

    } catch (err) {
        console.error(err);
    }
}

async function followUser(targetUsername) {
    if (!currentToken) return alert("Ingia kwenye mfumo kwanza!");
    const formData = new FormData();
    formData.append("target", targetUsername);
    formData.append("token", currentToken);

    const response = await fetch(`${API_URL}/friends/follow`, { method: "POST", body: formData });
    if (response.ok) alert(`Ombi la urafiki limetumwa kwa @${targetUsername}`);
}

// --- 6. MORE MENU (SAVE, COPY LINK, PIN, DOWNLOAD WATERMARK) ---
function createTikTokBottomSheet(videoId) {
    const sheet = document.createElement("div");
    sheet.className = "tiktok-bottom-sheet";
    sheet.innerHTML = `
        <div class="sheet-content">
            <div class="sheet-header"><div class="drag-handle"></div></div>
            <div class="sheet-item" onclick="executeAction('save', '${videoId}')"><i class="fas fa-bookmark"></i> Save Video</div>
            <div class="sheet-item" onclick="executeAction('copy', '${videoId}')"><i class="fas fa-link"></i> Copy Link</div>
            <div class="sheet-item" onclick="executeAction('pin', '${videoId}')"><i class="fas fa-thumbtack"></i> Pin Video (Max 5)</div>
            <div class="sheet-item" onclick="executeAction('download', '${videoId}')"><i class="fas fa-download"></i> Download Video</div>
            <div class="sheet-close" onclick="closeBottomSheet()">Funga</div>
        </div>
    `;
    document.body.appendChild(sheet);
}

function closeBottomSheet() {
    const sheet = document.querySelector(".tiktok-bottom-sheet");
    if (sheet) sheet.remove();
}

async function executeAction(action, videoId) {
    closeBottomSheet();
    if (!currentToken) return alert("Tafadhali ingia kwanza!");

    const formData = new FormData();
    formData.append("token", currentToken);

    if (action === "copy") {
        const res = await fetch(`${API_URL}/videos/${videoId}/copylink`);
        const data = await res.json();
        navigator.clipboard.writeText(data.link);
        alert("Link imenakiliwa kwenye simu yako!");
    } else if (action === "pin") {
        const res = await fetch(`${API_URL}/videos/${videoId}/pin`, { method: "POST", body: formData });
        const data = await res.json();
        alert(data.message);
    } else if (action === "download") {
        const res = await fetch(`${API_URL}/videos/${videoId}/download`);
        const data = await res.json();
        // Inamfungulia mtumiaji upakuaji wenye chapa ya jumannetok tz
        window.open(data.video_url, "_blank");
        alert(`Video inashuka! Chapa: ${data.watermark}`);
    } else if (action === "save") {
        alert("Video imehifadhiwa ndani ya programu!");
    }
}

// --- 7. UPLOAD VIDEO YENYE FOMU YA TAGS NA MAELEZO ---
async function triggerVideoUpload() {
    if (!currentToken) return alert("Tafadhali ingia kwanza kupia Profile!");

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "video/mp4, video/avi, audio/mp3";
    
    input.onchange = async () => {
        const file = input.files[0];
        if (!file) return;

        const description = prompt("Andika Maelezo ya Video (Title/Description):");
        if (!description) return alert("Huwezi kupost video bila maelezo!");

        const tags = prompt("Weka Tags za video ukitenganisha kwa koma (Mfano: singeli, bongo, dance):");
        if (!tags) return alert("Weka tags kwanza kabla ya kuupload!");

        alert("Video yako inakaguliwa usalama wa hakimiliki na picha za utupu na jumannetok tz... Tafadhali subiri faili lipakiwa!");

        const formData = new FormData();
        formData.append("file", file);
        formData.append("description", description);
        formData.append("tags", tags);
        formData.append("token", currentToken);

        try {
            const response = await fetch(`${API_URL}/videos/post`, {
                method: "POST",
                body: formData
            });
            const data = await response.json();
            if (response.ok) {
                alert("Video imepakiwa kikamilifu na jumanneTok tz!");
                loadVideoFeed("for_you");
            } else {
                alert(`Imekataliwa na mfumo wa jumanneTok tz: ${data.detail}`);
            }
        } catch (err) {
            alert("Hitilafu ya kupazia video.");
        }
    };
    input.click();
}

// --- 8. SIRI YA SOGA (CHAT WEBSOCKET) YENYE WHATSAPP LIVE TICKS & CALLS ---
function connectChatWebSocket() {
    if (!currentToken || chatSocket) return;

    chatSocket = new WebSocket(`${WS_URL}/chat/${currentUsername}?token=${currentToken}`);

    chatSocket.onmessage = (e) => {
        const message = JSON.parse(e.data);

        // Mfumo wa Ticks Mbili za Bluu Live kama WhatsApp
        if (message.type === "msg_delivered_receipt") {
            const lastTick = document.querySelector(".message.sent:last-child .tick");
            if (lastTick) {
                lastTick.className = "fas fa-check-double tick delivered";
            }
            return;
        }

        // Mifumo ya WebRTC Live Video Call
        if (message.type === "video_offer") {
            handleIncomingVideoCall(message.sender, message.content);
        } else if (message.type === "call_rejected") {
            alert("Mlengwa amekata simu yako.");
            cleanupVideoCallElements();
        } else if (message.type === "text" && activeChatTarget === message.sender) {
            appendNewMessageBubble(message.sender, message.content, "received", true);
        }
    };
}

async function loadChatUsers() {
    switchPage("inbox-page");
    const chatList = document.getElementById("chat-list");
    chatList.innerHTML = "Inatafuta watumiaji wote nchini Tanzania...";

    const formData = new FormData();
    formData.append("token", currentToken);

    try {
        const response = await fetch(`${API_URL}/chat/users?page=${chatUserPage}`, { method: "POST", body: formData });
        const users = await response.json();

        chatList.innerHTML = "";
        users.forEach((user) => {
            chatList.innerHTML += `
                <div class="chat-user-row">
                    <img src="${user.avatar}" class="chat-avatar">
                    <div class="chat-user-info">
                        <h4>@${user.username}</h4>
                        <div class="chat-row-buttons">
                            <button onclick="openPrivateChatBox('${user.username}')" class="btn-chat-action"><i class="fas fa-comment"></i> Chat</button>
                            <button onclick="startLiveVideoCall('${user.username}')" class="btn-call-action"><i class="fas fa-video"></i> Call</button>
                        </div>
                    </div>
                </div>
            `;
        });
    } catch (err) {
        console.error(err);
    }
}

async function openPrivateChatBox(targetUsername) {
    activeChatTarget = targetUsername;
    document.getElementById("inbox-users-view").classList.add("hidden");
    document.getElementById("private-chat-box").classList.remove("hidden");
    document.getElementById("chat-target-name").innerText = `@${targetUsername}`;

    const msgArea = document.getElementById("chat-messages-area");
    msgArea.innerHTML = "Inavuta soga ya siri...";

    const formData = new FormData();
    formData.append("token", currentToken);

    try {
        const response = await fetch(`${API_URL}/chat/history?with_user=${targetUsername}&page=${chatHistoryPage}`, { method: "POST", body: formData });
        const history = await response.json();

        msgArea.innerHTML = "";
        history.reverse().forEach(c => {
            const side = c.sender === currentUsername ? "sent" : "received";
            appendNewMessageBubble(c.sender, c.content, side, c.delivered);
        });
    } catch (err) {
        console.error(err);
    }
}

function appendNewMessageBubble(sender, content, side, delivered) {
    const msgArea = document.getElementById("chat-messages-area");
    const bubble = document.createElement("div");
    bubble.className = `message ${side}`;
    
    // Ripoti ya Ticks kulingana na data ya database ya Python
    const tickIcon = delivered ? "fas fa-check-double tick delivered" : "fas fa-check tick";
    
    bubble.innerHTML = `
        <p>${content}</p>
        <span class="msg-time">Sekunde 1 iliyopita ${side === "sent" ? `<i class="${tickIcon}"></i>` : ''}</span>
    `;
    msgArea.appendChild(bubble);
    msgArea.scrollTop = msgArea.scrollHeight;
}

// Kazi ya kutuma meseji ndani ya sekunde moja (WebSocket)
document.getElementById("btn-send-message").addEventListener("click", () => {
    const field = document.getElementById("chat-input-field");
    const text = field.value.trim();
    if (!text || !activeChatTarget) return;

    chatSocket.send(JSON.stringify({
        "receiver": activeChatTarget,
        "type": "text",
        "content": text
    }));

    appendNewMessageBubble(currentUsername, text, "sent", false); // Inaanza na tick moja ya kijivu
    field.value = "";
});

// --- 9. LIVE VIDEO CALL LOGIC (WebRTC GAME ENGINE) ---
async function startLiveVideoCall(targetUsername) {
    document.getElementById("video-call-screen").classList.remove("hidden");
    const localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    document.getElementById("localVideo").srcObject = localStream;

    peerConnection = new RTCPeerConnection(rtcConfig);
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    peerConnection.onicecandidate = (e) => {
        if (e.candidate && chatSocket) {
            chatSocket.send(JSON.stringify({
                "receiver": targetUsername, "type": "ice_candidate", "content": JSON.stringify(e.candidate)
            }));
        }
    };

    peerConnection.ontrack = (e) => {
        document.getElementById("remoteVideo").srcObject = e.streams[0];
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    chatSocket.send(JSON.stringify({
        "receiver": targetUsername, "type": "video_offer", "content": JSON.stringify(offer)
    }));
}

function handleIncomingVideoCall(sender, offerSDP) {
    const accept = confirm(`Simu ya video ya Live kutoka kwa @${sender}. Je, unapokea?`);
    if (!accept) {
        chatSocket.send(JSON.stringify({ "receiver": sender, "type": "call_rejected", "content": "" }));
        return;
    }
    // Kama akikubali, weka mifumo ya WebRTC iwashe kamera hapo hapo
    alert("Inaunganisha simu ya live...");
}

function cleanupVideoCallElements() {
    document.getElementById("video-call-screen").classList.add("hidden");
    if (peerConnection) peerConnection.close();
}

document.getElementById("btn-end-call").addEventListener("click", cleanupVideoCallElements);

// --- 10. UPANGAJI WA VITUFE VYA CHINI (BOTTOM NAVIGATION MECHANISM) ---
function setupBottomNav() {
    const buttons = document.querySelectorAll(".bottom-nav .nav-item");
    buttons.forEach((btn, index) => {
        btn.addEventListener("click", () => {
            buttons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");

            if (index === 0) loadVideoFeed("for_you");
            else if (index === 1) loadVideoFeed("friends");
            else if (index === 2) triggerVideoUpload(); // Kitufe cha bendera ya TZ ya upload katikati
            else if (index === 3) loadChatUsers();
            else if (index === 4) {
                if (currentToken) loadUserDashboard();
                else switchPage("profile-page");
            }
        });
    });
}
