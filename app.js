// =================================================================
// JUMANNETOK TZ - OFFICIAL FRONTEND CORE SOCIAL ENGINE (app.js)
// =================================================================

const API_URL = "https://onrender.com";
const WS_URL = "wss://://onrender.com";

let currentToken = localStorage.getItem("jumannetok_token");
let currentUsername = localStorage.getItem("jumannetok_username");

// Mifumo ya Pagination (Kupakia 10 kumi kumi kama TikTok na WhatsApp)
let videoSkip = 0;
let commentSkip = 0;
let chatUserSkip = 0;
let chatMessageSkip = 0;
let friendsSkip = 0;
let currentFeedType = "for_you";

let activeChatTargetId = null;
let chatSocket = null;
let peerConnection = null;
const rtcConfig = { iceServers: [{ urls: "stun:://google.com" }] };

// --- 1. CORE ALGORITHM (FOR YOU, FRIENDS, SEARCH & AUTO VIEWS) ---
function switchCoreTab(tabType) {
    currentFeedType = tabType;
    if (tabType === 'for_you') {
        loadVideoFeed("for_you", true);
    } else if (tabType === 'friends') {
        loadVideoFeed("friends", true);
    }
}

async function searchVideosOrUsers() {
    const query = document.getElementById('searchInput').value.trim();
    if (!query) return;
    const res = await fetch(`${API_URL}/search?q=${query}`);
    const results = await res.json();
    renderSearchResults(results);
}

async function loadVideoFeed(feedType = "for_you", reset = false) {
    if (reset) videoSkip = 0;
    currentFeedType = feedType;
    
    try {
        const res = await fetch(`${API_URL}/videos/feed?type=${feedType}&skip=${videoSkip}`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const videos = await res.json();
        const container = document.getElementById('videoContainer');
        if (reset) container.innerHTML = "";

        videos.forEach(video => {
            // Mlinzi wa Hakimiliki: Mfumo unakagua kama kuna video ya kuibiwa
            antiTheftSecurityCheck(video.watermark_owner, video.owner_username, video._id);

            // Kuhesabu Views papo hapo video ikifunguliwa tu (Kama TikTok halisi)
            countRealTimeVideoView(video._id);

            const el = document.createElement('div');
            el.className = "video-card";
            el.id = `video-card-${video._id}`;
            el.innerHTML = `
                <div class="video-player-box" onclick="countRealTimeVideoView('${video._id}')">
                    <video src="${video.video_url}" loop controls autoplay></video>
                    <div class="video-watermark">@JumanneTok_TZ | @${video.watermark_owner}</div>
                </div>
                
                <div class="interaction-bar">
                    <!-- Bonyeza Like inahesabu moja, ukibonyeza tena inapunguza -->
                    <button onclick="likeVideoEngine('${video._id}', this)">❤️ <span class="like-count">${video.likes_count}</span></button>
                    <!-- Mfumo wa Comment unaofungua dirisha la kuangalia na kutuma maoni -->
                    <button onclick="openCommentsSection('${video._id}')">💬 <span>${video.comments_count}</span></button>
                    <!-- Sehemu ya Kuhesabu na Kuonyesha Views za Video halisi -->
                    <span class="views-display">👁️ ${video.views} Views</span>
                    <button onclick="toggleMoreOptions('${video._id}')" class="btn-more">More ▾</button>
                </div>

                <!-- Kibutton cha More: Save, Copy Link, Pin, Download -->
                <div id="moreMenu-${video._id}" class="more-menu hidden">
                    <button onclick="executeCopyVideoLink('${video._id}')">🔗 Copy Link</button>
                    <button onclick="shareToMobileSystemApps('${video.title}', '${video.video_url}')">✈️ Share</button>
                    <button onclick="downloadVideoWithChapa('${video.video_url}', '${video.watermark_owner}')">📥 Download</button>
                    <button onclick="executePinVideoEngine('${video._id}')">📌 Pin Video</button>
                    <button onclick="executeDeleteVideoEngine('${video._id}', '${video.owner_username}')" class="btn-delete">🗑️ Futa Video</button>
                    <button onclick="viewUserPublicProfile('${video.owner_id}')">👤 Angalia Profile</button>
                </div>
            `;
            container.appendChild(el);
        });

        // Mfumo unaleta video 10, mtumiaji akimaliza zinaletwa zingine 10
        videoSkip += 10;
    } catch (err) {
        console.error("Hitilafu ya mtandao kupakia feed");
    }
}

async function countRealTimeVideoView(videoId) {
    await fetch(`${API_URL}/videos/view/${videoId}`, { method: 'POST' });
}

function toggleMoreOptions(videoId) {
    document.getElementById(`moreMenu-${videoId}`).classList.toggle('hidden');
}

// --- 2. ANTI-THEFT PROTECTION & ACCOUNT BAN (MLINZI WA WIZI WA VIDEO) ---
async function antiTheftSecurityCheck(watermarkOwner, currentOwner, videoId) {
    if (watermarkOwner !== currentOwner) {
        // Iba video -> Futa video mara moja na ongeza onyo (Strike) kwenye database
        const res = await fetch(`${API_URL}/videos/anti-theft/purge/${videoId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const data = await res.json();
        
        const videoElement = document.getElementById(`video-card-${videoId}`);
        if (videoElement) videoElement.remove();

        // Kama mtumiaji ameiba mara 10, mfumo unamfukuza na kufuta akaunti yake kiotomatiki
        if (data.strike_count >= 10) {
            alert("Akaunti yako imefutwa kabisa na kufungwa kwa kukiuka hakimiliki mara 10!");
            logout();
            return;
        }
        alert(`Onyo la Wizi! Video hii ni ya @${watermarkOwner}. Video imefutwa! Onyo lako la sasa: ${data.strike_count}/10.`);
    }
}

// --- 3. LIKE & COMMENT ENGINE (PAGINATION 10 MARA) ---
async function likeVideoEngine(videoId, btnEl) {
    const res = await fetch(`${API_URL}/videos/like/${videoId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const data = await res.json();
    btnEl.querySelector('.like-count').innerText = data.new_likes_count;
}

async function openCommentsSection(videoId) {
    commentSkip = 0;
    document.getElementById('commentModal').classList.remove('hidden');
    document.getElementById('sendCommentSubmitBtn').onclick = () => submitNewComment(videoId);
    loadPaginationComments(videoId, true);
}

async function loadPaginationComments(videoId, reset = false) {
    if (reset) commentSkip = 0;
    // Mfumo unamletea comment 10 kwanza, akimaliza unaleta zingine 10 muda huohuo
    const res = await fetch(`${API_URL}/videos/comments/${videoId}?skip=${commentSkip}`);
    const comments = await res.json();
    const box = document.getElementById('commentsContainerBox');
    if (reset) box.innerHTML = "";

    comments.forEach(c => {
        const div = document.createElement('div');
        div.className = "comment-row";
        div.innerHTML = `<strong>@${c.username}:</strong> <span>${c.text}</span>`;
        box.appendChild(div);
    });
    commentSkip += 10;
}

async function submitNewComment(videoId) {
    const input = document.getElementById('commentInputField');
    const text = input.value.trim();
    if (!text) return;

    await fetch(`${API_URL}/videos/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` },
        body: JSON.stringify({ video_id: videoId, text: text })
    });
    input.value = "";
    loadPaginationComments(videoId, true);
}

// --- 4. COPY LINK, SHARE TO APPS, DOWNLOAD WITH WATERMARK ---
function executeCopyVideoLink(videoId) {
    const textLink = `https://github.io{videoId}`;
    navigator.clipboard.writeText(textLink);
    alert("Copy Link Imefanikiwa! Link ya video husika imetengenezwa.");
}

async function shareToMobileSystemApps(title, url) {
    // Inafungua kabisa apps zote za simu ya mtumiaji kama WhatsApp n.k.
    if (navigator.share) {
        await navigator.share({ title: title, text: "Angalia video hii kwenye JumanneTok TZ", url: url });
    }
}

function downloadVideoWithChapa(videoUrl, ownerUsername) {
    // Mfumo unapeana chapa ya JumanneTok na jina la mmiliki halali wa video
    alert(`Inapakua... \nChapa ya Mfumo: @JumanneTok_TZ \nMmiliki wa Video: @${ownerUsername}`);
    const linkAnchor = document.createElement('a');
    linkAnchor.href = videoUrl;
    linkAnchor.download = `JumanneTok_tz_${ownerUsername}.mp4`;
    linkAnchor.click();
}

// --- 5. PIN SYSTEM (AUTO CYCLE 5 LIMIT) & SECURE DELETE ---
async function executePinVideoEngine(videoId) {
    // Limit ni 5, ukizidisha ya kwanza inajiondoa yenyewe ya 6 inajipin (TikTok Cycle)
    await fetch(`${API_URL}/videos/pin-cycle/${videoId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    alert("Mabadiliko ya Pin yamekamilika kwenye Profile yako!");
}

async function executeDeleteVideoEngine(videoId, ownerUsername) {
    // Mfumo unaangalia kama anayefuta ni mmiliki halali
    if (currentUsername !== ownerUsername) {
        return alert("Hauruhusiwi! Wewe sio mmiliki halali wa video hii.");
    }
    if (!confirm("Je, una uhakika unataka kufuta kabisa video hii?")) return;

    await fetch(`${API_URL}/videos/delete/${videoId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    loadVideoFeed(currentFeedType, true);
}

// --- 6. USER PUBLIC PROFILE & PINNED VIDEWS ---
async function viewUserPublicProfile(userId) {
    showPage('publicProfilePage');
    const res = await fetch(`${API_URL}/users/profile/${userId}`);
    const userData = await res.json();
    
    document.getElementById('publicProfileName').innerText = `@${userData.username}`;
    const pinnedContainer = document.getElementById('pinnedVideosContainer');
    pinnedContainer.innerHTML = "";
    
    // Inaleta video zote alizozipin marafiki au watumiaji wengine
    userData.pinned_videos.forEach(v => {
        const div = document.createElement('div');
        div.className = "pinned-item";
        div.innerHTML = `<video src="${v.video_url}" controls></video>`;
        pinnedContainer.appendChild(div);
    });
}

// --- 7. PRIVATE REAL-TIME CHAT ENGINE (MTEGO WA PROFILE YA 8 & MEDIA SEND) ---
async function loadSecretChatUsers(reset = false) {
    if (reset) chatUserSkip = 0;
    // Inatafuta watumiaji wote isipokuwa yeye pekee yake ili kulinda siri
    const res = await fetch(`${API_URL}/chats/users?skip=${chatUserSkip}`, {
        headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const users = await res.json();
    const list = document.getElementById('chatUsersListArea');
    if (reset) list.innerHTML = "";

    users.forEach((user, index) => {
        const div = document.createElement('div');
        div.className = "profile-chat-card";
        div.innerHTML = `
            <div class="user-info">
                <img src="${API_URL}/users/avatar/${user.username}" class="profile-pic">
                <span>@${user.username}</span>
            </div>
            <button onclick="startPrivateSecretMessage('${user.id}', '${user.username}')">Chat</button>
        `;
        list.appendChild(div);

        // MTEGO WA PROFILE YA 8: Akifika profile ya 8 (index 7), mfumo unaongeza zingine 10 mbele
        if (index === 7) {
            chatUserSkip += 10;
            loadSecretChatUsers(false);
        }
    });
}

function startPrivateSecretMessage(targetId, targetUsername) {
    activeChatTargetId = targetId;
    document.getElementById('secretChatTitle').innerText = `Ujumbe wa Siri na ${targetUsername}`;
    showPage('privateChatWindowPage');
    initializeWebSocketWhatsAppEngine();
    loadSecretChatHistory(targetId, true);
}

function initializeWebSocketWhatsAppEngine() {
    if (chatSocket) chatSocket.close();
    chatSocket = new WebSocket(`${WS_URL}?token=${currentToken}`);

    chatSocket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.sender_id === activeChatTargetId || data.sender_id === currentToken) {
            const box = document.getElementById('secretChatHistoryArea');
            const p = document.createElement('p');
            
            // Delivery report: Kama haijafika tik moja, ikifika ndani ya sekunde 1 inaleta tik mbili ✓✓
            const tickReport = data.status === 'delivered' ? "<span class='ticks'>✓✓</span>" : "<span class='ticks'>✓</span>";
            
            // Uwezo wa kuonyesha picha, video au maandishi yaliyotumwa
            if (data.media_type === 'image') {
                p.innerHTML = `<img src="${data.media_url}" class="chat-media"> <br> ${tickReport}`;
            } else if (data.media_type === 'video') {
                p.innerHTML = `<video src="${data.media_url}" controls class="chat-media"></video> <br> ${tickReport}`;
            } else {
                p.innerHTML = `<span>${data.message_text}</span> ${tickReport}`;
            }
            
            box.appendChild(p);
            box.scrollTop = box.scrollHeight;
        }
    };
}

async function sendSecretMediaOrTextMessage(mediaType = "text", mediaUrl = "") {
    const input = document.getElementById('secretMessageInputField');
    const text = input.value.trim();
    if (!text && !mediaUrl) return;

    // Inatuma ujumbe, picha, au video kwa sekunde 1 tu
    chatSocket.send(JSON.stringify({
        type: 'chat',
        receiver_id: activeChatTargetId,
        message_text: text,
        media_url: mediaUrl,
        media_type: mediaType // text, image, au video
    }));
    input.value = "";
}

async function loadSecretChatHistory(partnerId, reset = false) {
    if (reset) chatMessageSkip = 0;
    const res = await fetch(`${API_URL}/chats/history/${partnerId}?skip=${chatMessageSkip}`, {
        headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const messages = await res.json();
    const box = document.getElementById('secretChatHistoryArea');
    if (reset) box.innerHTML = "";

    messages.forEach(m => {
        const p = document.createElement('p');
        p.innerHTML = `<span>${m.message_text}</span> <small>✓✓</small>`;
        box.appendChild(p);
    });
    chatMessageSkip += 10;
}

// --- 8. FOLLOW SYSTEM & CONFIRM/DELETE REQUESTS (PAGINATION 10) ---
async function loadFollowersFriendsSystem(reset = false) {
    if (reset) friendsSkip = 0;
    const res = await fetch(`${API_URL}/friends/discovery?skip=${friendsSkip}`, {
        headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const users = await res.json();
    const box = document.getElementById('friendsDiscoveryContainer');
    if (reset) box.innerHTML = "";

    // Mfumo unaleta marafiki 10 kwanza, akimaliza unaleta 10 wengine auto
    users.forEach(u => {
        const div = document.createElement('div');
        div.className = "friends-discovery-card";
        div.innerHTML = `
            <span>@${u.username}</span>
            <button onclick="sendFollowNotification('${u.id}')">Follow</button>
        `;
        box.appendChild(div);
    });
    friendsSkip += 10;
}

async function sendFollowNotification(targetId) {
    // Inatuma ombi na kutoa taarifa kwa mrengwa ikiwa na Confirm na Delete option
    await fetch(`${API_URL}/friends/follow/${targetId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    alert("Ombi la urafiki limetumwa kwa mlengwa!");
}

// --- 9. LIVE VIDEO CALL (WEB RTC ENGINE) ---
async function triggerLiveVideoCallEngine() {
    peerConnection = new RTCPeerConnection(rtcConfig);
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    document.getElementById('localVideoFeedBox').srcObject = stream;
    stream.getTracks().forEach(track => peerConnection.addTrack(track, stream));

    const offer = await peerConnection.createOffer();
    await peerConnection.setRemoteDescription(offer);

    chatSocket.send(JSON.stringify({
        type: 'call-offer',
        receiver_id: activeChatTargetId,
        offer: offer
    }));
}

function logout() {
    localStorage.clear();
    location.reload();
                        }
                
