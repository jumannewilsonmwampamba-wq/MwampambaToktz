// ==========================================
// 1. GLOBAL CONFIGURATIONS & STATE MANAGEMENT
// ==========================================
const API_URL = "https://Mwampamba-16.onrender.com";
const WS_URL = "wss://://Mwampamba-16.onrender.com";

let currentToken = localStorage.getItem("jumanne_tok_token") || "";
let currentUsername = localStorage.getItem("jumanne_tok_username") || "";
let currentUserId = localStorage.getItem("jumanne_tok_user_id") || "";

// State za Pagination na Data Streams
let videoPage = 1;
let profileVideoPage = 1;
let chatUserPage = 1;
let friendPage = 1;
const PAGE_LIMIT = 10;

let activeChatTarget = null;
let chatSocket = null;
let peerConnection = null;
let pinnedVideosCount = 0;

// Auto-wake up ya Render Server punde tu tovuti inapofunguka
window.addEventListener("load", () => {
    console.log("Inaamsha seva ya Render...");
    fetch(`${API_URL}/api/auth/entry`, { method: "POST" }).catch(e => console.warn("Seva inajipanga..."));
    initApp();
});

function initApp() {
    setupTabNavigation();
    loadFeedVideos("foryou");
    setupInfiniteScrolls();
}

// ==========================================
// 2. TAB NAVIGATION SYSTEM (AI, FRIENDS, SEARCH)
// ==========================================
function setupTabNavigation() {
    document.querySelectorAll(".nav-tab").forEach(tab => {
        tab.addEventListener("click", (e) => {
            const targetTab = e.target.dataset.tab; // "foryou", "friends", "search"
            document.querySelectorAll(".page-section").forEach(s => s.classList.add("hidden"));
            document.getElementById(`${targetTab}-section`).classList.remove("hidden");
            
            if (targetTab === "foryou") {
                videoPage = 1;
                loadFeedVideos("foryou");
            } else if (targetTab === "friends") {
                friendPage = 1;
                loadFriendsList();
                loadFeedVideos("friends");
            }
        });
    });
}

// ==========================================
// 3. TIKTOK ENGINE: VIDEO RENDERING, LIKES, VIEWS & REVIEWS
// ==========================================
async function loadFeedVideos(feedType) {
    try {
        const response = await fetch(`${API_URL}/api/videos/feed?type=${feedType}&page=${videoPage}&limit=${PAGE_LIMIT}`);
        const data = await response.json();
        renderVideos(data.videos, document.getElementById("video-container"));
    } catch (err) {
        console.error("Haikuweza kupata video:", err);
    }
}

function renderVideos(videos, container) {
    if (videoPage === 1) container.innerHTML = "";
    
    videos.forEach(video => {
        const videoElement = document.createElement("div");
        videoElement.className = "video-card";
        videoElement.innerHTML = `
            <div class="video-wrapper">
                <video src="${video.url}" class="main-video-player" loop data-id="${video._id}"></video>
                <div class="video-watermark hidden">@jumannetok_tz | @${video.owner_username}</div>
            </div>
            
            <!-- Video Interaction Bar (Kama TikTok) -->
            <div class="interaction-bar">
                <div class="user-avatar" onclick="viewUserProfile('${video.owner_id}')">
                    <img src="${video.owner_avatar || 'default-avatar.png'}" alt="profile">
                </div>
                <div class="action-btn like-btn" onclick="toggleLike('${video._id}', this)">
                    <span>❤️</span> <small class="count">${video.likes_count || 0}</small>
                </div>
                <div class="action-btn comment-btn" onclick="openCommentSection('${video._id}')">
                    <span>💬</span> <small class="count">${video.comments_count || 0}</small>
                </div>
                <div class="action-btn view-counter">
                    <span>👁️</span> <small>${video.views_count || 0}</small>
                </div>
                <div class="action-btn more-btn" onclick="toggleMoreMenu('${video._id}', '${video.owner_id}')">
                    <span>•••</span>
                </div>
            </div>

            <!-- More Options Hidden Dropdown Menu -->
            <div id="more-menu-${video._id}" class="more-dropdown hidden">
                <button onclick="saveVideo('${video._id}')">💾 Save</button>
                <button onclick="copyVideoLink('${video._id}')">🔗 Copy Link</button>
                <button onclick="shareNative('${video._id}', '${video.title}')">📤 Share</button>
                <button onclick="downloadWithWatermark('${video.url}', '${video.owner_username}')">📥 Download</button>
                ${video.owner_id === currentUserId ? `<button onclick="togglePinVideo('${video._id}')">📌 Pin/Unpin</button>` : ''}
                ${video.owner_id === currentUserId ? `<button class="delete-btn" onclick="deleteVideo('${video._id}')">🗑️ Futa Video</button>` : ''}
            </div>
        `;
        container.appendChild(videoElement);
        
        // Mfumo wa Kuhesabu Views Kiotomatiki punde video ikifunguliwa tu
        const videoPlayer = videoElement.querySelector(".main-video-player");
        setupAutoViewTrigger(videoPlayer, video._id);
    });
}

function setupAutoViewTrigger(player, videoId) {
    let viewCounted = false;
    player.addEventListener("play", () => {
        if (!viewCounted) {
            viewCounted = true;
            fetch(`${API_URL}/api/videos/${videoId}/view`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${currentToken}` }
            }).then(res => res.json())
              .then(data => { player.parentElement.parentElement.querySelector(".view-counter small").innerText = data.new_views; });
        }
    });
}

// ==========================================
// 4. LIKES, COPYRIGHT SYSTEM, MORE MENU FUNCTIONS
// ==========================================
async function toggleLike(videoId, element) {
    const res = await fetch(`${API_URL}/api/videos/${videoId}/like`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${currentToken}` }
    });
    const data = await res.json();
    element.querySelector(".count").innerText = data.likes_count;
}

function toggleMoreMenu(videoId, ownerId) {
    const menu = document.getElementById(`more-menu-${videoId}`);
    menu.classList.toggle("hidden");
}

function copyVideoLink(videoId) {
    const shareUrl = `${window.location.origin}/video.html?id=${videoId}`;
    navigator.clipboard.writeText(shareUrl);
    alert("Link ya video imekopiwa kikamilifu!");
}

function shareNative(videoId, title) {
    if (navigator.share) {
        navigator.share({
            title: title || "JumanneTok TZ Video",
            url: `${window.location.origin}/video.html?id=${videoId}`
        }).catch(console.error);
    } else {
        copyVideoLink(videoId);
    }
}

function downloadWithWatermark(videoUrl, username) {
    alert(`Inapakua... Video imepigwa chapa ya @jumannetok_tz na mmiliki @${username}`);
    const link = document.createElement("a");
    link.href = videoUrl;
    link.download = `jumannetok_${username}.mp4`;
    link.click();
}

// Mfumo wa Kupin Video (Limit ya Video 5 Max - FIFO)
async function togglePinVideo(videoId) {
    const res = await fetch(`${API_URL}/api/videos/${videoId}/pin`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${currentToken}` }
    });
    const data = await res.json();
    if(data.status === "success") {
        alert(data.message);
    } else {
        alert("Hitilafu imetokea wakati wa kupin.");
    }
}

async function deleteVideo(videoId) {
    if (!confirm("Je, una uhakika unataka kufuta video hii kabisa?")) return;
    const res = await fetch(`${API_URL}/api/videos/${videoId}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${currentToken}` }
    });
    if (res.ok) {
        alert("Video imefutwa kwenye mfumo.");
        location.reload();
    }
}

// ==========================================
// 5. COMMENTS ENGINE (POPUP, INTERACTION & PAGINATION)
// ==========================================
let currentCommentVideoId = null;
let commentPage = 1;

async function openCommentSection(videoId) {
    currentCommentVideoId = videoId;
    commentPage = 1;
    document.getElementById("comment-modal").classList.remove("hidden");
    loadVideoComments();
}

async function loadVideoComments() {
    try {
        const res = await fetch(`${API_URL}/api/videos/${currentCommentVideoId}/comments?page=${commentPage}&limit=10`);
        const data = await res.json();
        const container = document.getElementById("comments-list-container");
        
        if (commentPage === 1) container.innerHTML = "";
        data.comments.forEach(comment => {
            const commentDiv = document.createElement("div");
            commentDiv.className = "single-comment";
            commentDiv.innerHTML = `
                <img src="${comment.user_avatar}" class="comment-avatar">
                <div class="comment-body">
                    <strong>@${comment.username}</strong>
                    <p>${comment.text}</p>
                </div>
            `;
            container.appendChild(commentDiv);
        });
    } catch (e) { console.error(e); }
}

async function submitComment() {
    const input = document.getElementById("comment-input-field");
    if (!input.value.trim()) return;
    
    const res = await fetch(`${API_URL}/api/videos/${currentCommentVideoId}/comments`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${currentToken}`
        },
        body: JSON.stringify({ text: input.value })
    });
    
    if (res.ok) {
        input.value = "";
        commentPage = 1;
        loadVideoComments();
    }
}

// ==========================================
// 6. WHATSAPP CHAT ENGINE: WEBSOCKETS, CARGO MEDIA & DELIVERIES
// ==========================================
function connectChatWebSocket() {
    if (chatSocket) return;
    
    chatSocket = new WebSocket(`${WS_URL}?token=${currentToken}`);
    
    chatSocket.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        
        // Kushughulikia Delivery Report Ticks (Sent ✓, Delivered ✓✓)
        if (msg.type === "delivery_report") {
            updateMessageTicks(msg.message_id, msg.status);
            return;
        }
        
        // Kupokea Ujumbe Mpya Mubashara
        if (activeChatTarget && (msg.sender_id === activeChatTarget || msg.receiver_id === activeChatTarget)) {
            appendSingleMessage(msg);
            // Tuma ripoti kuwa ujumbe umesomwa/kufika
            sendDeliveryReport(msg._id, "delivered");
        }
    };
}

function openPrivateChat(targetUserId) {
    activeChatTarget = targetUserId;
    document.getElementById("chat-box-section").classList.remove("hidden");
    document.getElementById("chat-messages-container").innerHTML = "";
    connectChatWebSocket();
    loadChatHistory(targetUserId);
}

async function sendTextMessage() {
    const input = document.getElementById("chat-message-input");
    if (!input.value.trim() || !chatSocket) return;

    const msgPayload = {
        receiver_id: activeChatTarget,
        type: "text",
        content: input.value,
        timestamp: new Date().toISOString()
    };
    
    chatSocket.send(JSON.stringify(msgPayload));
    appendSingleMessage({ sender_id: currentUserId, content: input.value, type: "text", status: "sent" });
    input.value = "";
}

async function sendMediaMessage(fileInput) {
    const file = fileInput.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("receiver_id", activeChatTarget);

    const res = await fetch(`${API_URL}/api/chat/media`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${currentToken}` },
        body: formData
    });
    const data = await res.json();
    
    chatSocket.send(JSON.stringify({
        receiver_id: activeChatTarget,
        type: file.type.startsWith("image/") ? "image" : "video",
        content: data.url
    }));
}

function appendSingleMessage(msg) {
    const container = document.getElementById("chat-messages-container");
    const msgDiv = document.createElement("div");
    msgDiv.className = `message-bubble ${msg.sender_id === currentUserId ? 'sent' : 'received'}`;
    
    let mediaContent = msg.content;
    if (msg.type === "image") mediaContent = `<img src="${msg.content}" class="chat-media">`;
    if (msg.type === "video") mediaContent = `<video src="${msg.content}" controls class="chat-media"></video>`;
    
    let ticks = msg.sender_id === currentUserId ? `<span class="ticks">${msg.status === 'delivered' ? '✓✓' : '✓'}</span>` : '';
    
    msgDiv.innerHTML = `<p>${mediaContent}</p> ${ticks}`;
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
}

function updateMessageTicks(msgId, status) {
    // Tafuta ujumbe na uweke ticks mbili ✓✓ kama umefika WhatsApp style
    const elements = document.querySelectorAll(".message-bubble.sent");
    if (elements.length > 0 && status === "delivered") {
        elements[elements.length - 1].querySelector(".ticks").innerText = "✓✓";
    }
}

function sendDeliveryReport(msgId, status) {
    if(chatSocket && chatSocket.readyState === WebSocket.OPEN) {
        chatSocket.send(JSON.stringify({ type: "delivery_report", message_id: msgId, status: status }));
    }
}

// ==========================================
// 7. WEBRTC VIDEO CALL HOOK (MUBASHARA SETUP)
// ==========================================
async function startVideoCall(targetUserId) {
    alert("Inapiga simu ya video mubashara...");
    peerConnection = new RTCPeerConnection({ iceServers: [{ urls: "stun:://google.com" }] });
    
    const localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    document.getElementById("local-video-preview").srcObject = localStream;
    
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    
    peerConnection.onicecandidate = (e) => {
        if(e.candidate && chatSocket) {
            chatSocket.send(JSON.stringify({ type: "webrtc_signaling", target: targetUserId, candidate: e.candidate }));
        }
    };
    
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    
    chatSocket.send(JSON.stringify({ type: "webrtc_signaling", target: targetUserId, offer: offer }));
}

// ==========================================
// 8. FRIENDS & FOLLOW SYSTEM YENYE NOTIFICATIONS
// ==========================================
async function loadFriendsList() {
    try {
        const res = await fetch(`${API_URL}/api/users/list?page=${friendPage}&limit=${PAGE_LIMIT}`, {
            headers: { "Authorization": `Bearer ${currentToken}` }
        });
        const data = await res.json();
        renderFriendsList(data.users);
    } catch (e) { console.error(e); }
}

function renderFriendsList(users) {
    const container = document.getElementById("friends-list-view");
    if (friendPage === 1) container.innerHTML = "";
    
    users.forEach(user => {
        if (user._id === currentUserId) return; // Isijilete yenyewe
        
        const userDiv = document.createElement("div");
        userDiv.className = "friend-card";
        userDiv.innerHTML = `
            <img src="${user.avatar_url}" class="friend-avatar">
            <div class="friend-info">
                <strong>@${user.username}</strong>
                <button onclick="sendFollowRequest('${user._id}', this)">➕ Follow</button>
            </div>
        `;
        container.appendChild(userDiv);
    });
}

async function sendFollowRequest(targetId, buttonElement) {
    const res = await fetch(`${API_URL}/api/users/${targetId}/follow`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${currentToken}` }
    });
    if (res.ok) {
        buttonElement.innerText = "Pending...";
        buttonElement.disabled = true;
        alert("Ombi la urafiki limetumwa kwa mlengwa!");
    }
}

// ==========================================
// 9. INFINITE SCROLL SYSTEM (INAPOSOMA YA 8 INASHUSHA MPYA)
// ==========================================
function setupInfiniteScrolls() {
    // Mfumo wa kusoma scrolling za video au chat users
    window.addEventListener("scroll", () => {
        if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 500) {
            // Hapa mtumiaji amekaribia mwisho wa ukurasa (Kama item ya 8 hivi)
            throttlePageIncrement();
        }
    });
}

let isPageLoading = false;
function throttlePageIncrement() {
    if (isPageLoading) return;
    isPageLoading = true;
    
    setTimeout(() => {
        videoPage++;
        const activeSection = document.querySelector(".page-section:not(.hidden)").id;
        if (activeSection === "foryou-section") {
            loadFeedVideos("foryou");
        } else if (activeSection === "friends-section") {
            loadFeedVideos("friends");
        }
        isPageLoading = false;
    }, 200);
        }
        
