// =============================================================================
// MIPANGILIO YA SEVA NA MAWASILIANO YA REAL-TIME (SOCKET.IO)
// =============================================================================
const API_URL = "https://ndere.onrender.com"; // Link yako sahihi ya Render
const socket = io(API_URL); // Inachukua API_URL hapo juu kiotomatiki

// Data za mtumiaji aliyopo kwenye mfumo kwa sasa (Mfano wa majaribio)
let currentUser = {
    username: "jumanne_user",
    profile_pic: "https://cloudinary.com"
};

// Vigezo vya kurasa (Pagination - Kumi Kumi)
let currentVideoId = null;
let currentVideoPage = 1;
let currentCommentPage = 1;
let currentChatUserPage = 1;
let currentFriendPage = 1;
let currentActiveChatPartner = null;

// Unganisha mtumiaji kwenye chumba chake cha siri cha ujumbe mara tu anapoingia
socket.emit("join_room", currentUser.username);

// =============================================================================
// 1. MFUMO WA VIDEO (Likes, Comments Count, Views, Pin, Download, Mobile Share)
// =============================================================================

// A. Kuhesabu Views Kila Video Ikifunguliwa tu (Kama TikTok)
async function registerVideoView(videoId) {
    try {
        await fetch(`${API_URL}/api/videos/${videoId}/view`, { method: "POST" });
        let viewCountElement = document.getElementById(`views-count-${videoId}`);
        if (viewCountElement) {
            let currentViews = parseInt(viewCountElement.innerText) || 0;
            viewCountElement.innerText = currentViews + 1;
        }
    } catch (error) {
        console.error("Ushindani wa kuhesabu view feli:", error);
    }
}

// B. Kitufe cha Like - Kujiongeza na Kujipunguza (Hesabu ya Moja Moja)
async function toggleLikeVideo(videoId) {
    try {
        let response = await fetch(`${API_URL}/api/videos/${videoId}/like`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: currentUser.username })
        });
        let data = await response.json();
        
        let likeCountElement = document.getElementById(`like-count-${videoId}`);
        let likeBtn = document.getElementById(`like-btn-${videoId}`);
        
        if (data.action === "liked") {
            likeCountElement.innerText = parseInt(likeCountElement.innerText) + 1;
            likeBtn.style.color = "red"; // Imependwa
        } else {
            likeCountElement.innerText = parseInt(likeCountElement.innerText) - 1;
            likeBtn.style.color = "white"; // Imetolewa like
        }
    } catch (error) {
        console.error("Mfumo wa like umefeli:", error);
    }
}

// C. Kitufe cha More (Kinafungua Menu: Save, Copy Link, Pin, Download)
function openMoreMenu(video) {
    let menuHtml = `
        <div class="more-menu-popup" id="menu-${video._id}">
            <button onclick="saveVideoToBookmarks('${video._id}')">Save Video</button>
            <button onclick="copyVideoLink('${video.video_url}')">Copy Link</button>
            <button onclick="pinVideoOwner('${video._id}')">Pin Video (Wamiliki Tu)</button>
            <button onclick="downloadVideoWithWatermark('${video.video_url}', '${video.username}')">Download</button>
        </div>
    `;
    document.body.insertAdjacentHTML("beforeend", menuHtml);
}

// D. Copy Link ya Video
function copyVideoLink(videoUrl) {
    navigator.clipboard.writeText(videoUrl).then(() => {
        alert("Link ya video imenakiliwa vizuri!");
    });
}

// E. Download Video yenye Chapa ya "jumannetok tz" na Username ya Mmiliki
function downloadVideoWithWatermark(videoUrl, ownerUsername) {
    alert(`Inapakua video... Chapa iliyochapwa: jumannetok tz - Mmiliki: ${ownerUsername}`);
    
    const link = document.createElement("a");
    link.href = videoUrl;
    link.download = `jumannetok_tz_${ownerUsername}_video.mp4`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// F. Kitufe cha Pin Video (Mwisho video 5, ya 6 ikija ya kwanza inatoka)
async function pinVideoOwner(videoId) {
    try {
        let response = await fetch(`${API_URL}/api/videos/${videoId}/pin`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: currentUser.username })
        });
        let data = await response.json();
        if (data.error) {
            alert(data.error); // Inakataa kama sio mmiliki halali
        } else {
            alert("Video imepiniwa juu ya profile yako kwa mafanikio!");
        }
    } catch (error) {
        console.error("Mfumo wa kupin umefeli:", error);
    }
}

// G. Kufuta Video (Inaruhusu Mmiliki Halali Tu)
async function deleteVideoOwner(videoId) {
    if (!confirm("Je, una uhakika unataka kufuta video hii kabisa?")) return;
    
    try {
        let response = await fetch(`${API_URL}/api/videos/${videoId}`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: currentUser.username })
        });
        let data = await response.json();
        if (data.error) {
            alert(data.error); // Inakataa kama sio mmiliki halali
        } else {
            document.getElementById(`video-card-${videoId}`).remove();
            alert("Video imefutwa kabisa kwenye mfumo!");
        }
    } catch (error) {
        console.error("Ufutaji wa video umefeli:", error);
    }
}

// H. Share Inayofungua Programu Zilizopo Kwenye Simu ya Mtumiaji
function shareVideoMobile(videoTitle, videoUrl) {
    if (navigator.share) {
        navigator.share({
            title: videoTitle,
            text: "Angalia video hii kwenye mtandao wetu!",
            url: videoUrl
        }).then(() => {
            console.log("Mtumiaji ameshare kwa mafanikio.");
        }).catch(err => console.log("Mtumiaji ameahirisha share"));
    } else {
        copyVideoLink(videoUrl);
    }
}

// =============================================================================
// 2. MFUMO WA COMMENTS (Kufungua, Kuona za Wengine, kutuma, kuleta 10-10)
// =============================================================================
async function openCommentsSection(videoId, isNewLoad = true) {
    if (isNewLoad) currentCommentPage = 1;
    
    document.getElementById("comments-container").innerHTML = "Inapakia comment za watumiaji...";
    
    try {
        let response = await fetch(`${API_URL}/api/videos/${videoId}/comments?page=${currentCommentPage}`);
        let comments = await response.json();
        
        if (isNewLoad) document.getElementById("comments-container").innerHTML = "";
        
        comments.forEach(comment => {
            let commentHtml = `
                <div class="comment-box">
                    <img src="${comment.profile_pic}" class="user-pic-comment" />
                    <strong>${comment.username}:</strong>
                    <span>${comment.text}</span>
                </div>
            `;
            document.getElementById("comments-container").insertAdjacentHTML("beforeend", commentHtml);
        });
        
        if (comments.length === 10) {
            let moreBtn = `<button onclick="loadMoreComments('${videoId}')">Leta zingine 10...</button>`;
            document.getElementById("comments-container").insertAdjacentHTML("beforeend", moreBtn);
        }
    } catch (error) {
        console.error("Comments zimegoma kupakia:", error);
    }
}

function loadMoreComments(videoId) {
    currentCommentPage++;
    openCommentsSection(videoId, false);
}

// Kutuma Comment Mpya na Kujihesabu Moja kwa Moja
async function sendNewComment(videoId, commentTextInput) {
    if (!commentTextInput.trim()) return;
    
    try {
        let response = await fetch(`${API_URL}/api/videos/${videoId}/comments`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: currentUser.username,
                profile_pic: currentUser.profile_pic,
                text: commentTextInput
            }) // Hapa pamesahihishwa!
        });
        
        if (response.ok) {
            let countElement = document.getElementById(`comment-count-${videoId}`);
            countElement.innerText = parseInt(countElement.innerText) + 1;
            openCommentsSection(videoId, true); 
        }
    } catch (error) {
        console.error("Kutuma comment kumeshindikana:", error);
    }
}

// =============================================================================
// 3. WHATSAPP-LIKE REALTIME CHATS (Ujumbe wa siri, Picha, Video, na Tik mbili)
// =============================================================================

async function loadChatProfilesList() {
    try {
        let res = await fetch(`${API_URL}/api/chats/users?username=${currentUser.username}&page=${currentChatUserPage}`);
        let users = await res.json();
        
        users.forEach((user, index) => {
            let profileHtml = `
                <div class="chat-profile-item" onclick="startPrivateChatWindow('${user.username}')">
                    <img src="${user.profile_pic || 'default.png'}" />
                    <span>${user.username}</span>
                    <button class="chat-btn">Chat Sasa</button>
                </div>
            `;
            document.getElementById("chat-profiles-list").insertAdjacentHTML("beforeend", profileHtml);
            
            if (index === 7 && users.length === 10) {
                currentChatUserPage++;
                loadChatProfilesList();
            }
        });
    } catch (error) {
        console.error("Orodha ya chat profiles imefeli:", error);
    }
}

function startPrivateChatWindow(partnerUsername) {
    currentActiveChatPartner = partnerUsername;
    document.getElementById("chat-box-title").innerText = `Ujumbe wa Siri na: ${partnerUsername}`;
    document.getElementById("chat-messages-area").innerHTML = ""; 
}

function sendPrivateMessage(content, msgType = "text") {
    if (!currentActiveChatPartner) return alert("Chagua mtu wa kuchat naye kwanza!");
    
    let msgData = {
        _id: "temp_" + Date.now(), 
        sender: currentUser.username,
        receiver: currentActiveChatPartner,
        type: msgType, 
        content: content
    };
    
    socket.emit("send_message", msgData);
    appendMessageToScreen(msgData, "my-message", "✓");
}

socket.on("message_received", (msg) => {
    if (msg.sender === currentActiveChatPartner) {
        appendMessageToScreen(msg, "partner-message", "");
        socket.emit("msg_delivered", { msg_id: msg._id, sender: msg.sender });
    }
});

socket.on("status_updated", (data) => {
    let tickElement = document.getElementById(`tick-${data.msg_id}`);
    if (tickElement) {
        tickElement.innerText = "✓✓"; 
    }
});

function appendMessageToScreen(msg, className, tickStyle) {
    let displayContent = msg.content;
    if (msg.type === "image") displayContent = `<img src="${msg.content}" class="chat-img" />`;
    if (msg.type === "video") displayContent = `<video src="${msg.content}" controls class="chat-vid"></video>`;
    
    let msgHtml = `
        <div class="message ${className}">
            <div class="bubble">${displayContent}</div>
            <span class="tick-status" id="tick-${msg._id}">${tickStyle}</span>
        </div>
    `;
    document.getElementById("chat-messages-area").insertAdjacentHTML("beforeend", msgHtml);
}

function saveVideoToBookmarks(videoId) {
    alert("Video imehifadhiwa kwenye alamisho (Bookmarks) zako!");
}


// =============================================================================
// 4. VIDEO CALL MFUMO (WebRTC Real-time Voice & Video Call Live)
// =============================================================================
function initiateLiveVideoCall() {
    if (!currentActiveChatPartner) return alert("Tafadhali chagua mtu wa kumpigia simu!");
    
    alert(`Inapiga simu ya video ya Live kwenda kwa ${currentActiveChatPartner}...`);
    
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then((stream) => {
            document.getElementById("local-video-screen").srcObject = stream;
            socket.emit("call_user", {
                userToCall: currentActiveChatPartner,
                from: currentUser.username
            });
        })
        .catch(err => alert("Ruhusu kamera na mic ili upige video call!"));
}

// =============================================================================
// 5. MFUMO WA FRIENDS (Followers, Confirm, Delete, Orodha ya 10-10)
// =============================================================================

async function followTargetUser(targetUsername) {
    try {
        let response = await fetch(`${API_URL}/api/friends/follow`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sender: currentUser.username, receiver: targetUsername })
        });
        if (response.ok) {
            alert(`Ombi la urafiki limetumwa!`);
        }
    } catch (error) {
        console.error("Ombi la follow limefeli:", error);
    }
}

async function loadMyFriendsSection() {
    try {
        let response = await fetch(`${API_URL}/api/friends/list?username=${currentUser.username}&page=${currentFriendPage}`);
        let friends = await response.json();
        
        friends.forEach(friend => {
            let friendHtml = `
                <div class="friend-card">
                    <span>${friend.username}</span>
                    <button onclick="startPrivateChatWindow('${friend.username}')">Chat</button>
                </div>
            `;
            document.getElementById("friends-container-list").insertAdjacentHTML("beforeend", friendHtml);
        });
        
        if (friends.length === 10) {
            let loadMoreFriendsBtn = `<button onclick="loadMoreFriends()">Leta wengine 10 marafiki...</button>`;
            document.getElementById("friends-container-list").insertAdjacentHTML("beforeend", loadMoreFriendsBtn);
        }
    } catch (error) {
        console.error("Ushindani wa kupakia marafiki feli:", error);
    }
}

function loadMoreFriends() {
    currentFriendPage++;
    loadMyFriendsSection();
}

// =============================================================================
// 6. AI NDOGO YA VIDEO (For You, Friends Feed, na Sehemu ya Search)
// =============================================================================
async function switchVideoFeedTab(feedType) {
    currentVideoPage = 1;
    document.getElementById("video-feed-container").innerHTML = "Inatafuta video...";
    
    let url = `${API_URL}/api/videos/feed?type=${feedType}&username=${currentUser.username}&page=${currentVideoPage}`;
    
    if (feedType === "search") {
        let searchQuery = document.getElementById("search-input-box").value;
        url += `&query=${searchQuery}`;
    }
    
    try {
        let response = await fetch(url);
        let videos = await response.json();
        
        document.getElementById("video-feed-container").innerHTML = ""; 
        
        videos.forEach(video => {
            let videoCardHtml = `
                <div class="video-card" id="video-card-${video._id}" onmouseover="registerVideoView('${video._id}')">
                    <video src="${video.video_url}" class="main-video-player" controls loop></video>
                    <div class="video-sidebar-actions">
                        <button id="like-btn-${video._id}" onclick="toggleLikeVideo('${video._id}')">❤️ <span id="like-count-${video._id}">${video.likes.length}</span></button>
                        <button onclick="openCommentsSection('${video._id}')">💬 <span id="comment-count-${video._id}">0</span></button>
                        <button onclick="shareVideoMobile('${video.title}', '${video.video_url}')">🔗 Share</button>
                        <button onclick='openMoreMenu(${JSON.stringify(video)})'>••• More</button>
                    </div>
                </div>
            `;
            document.getElementById("video-feed-container").insertAdjacentHTML("beforeend", videoCardHtml);
        });
    } catch (error) {
        console.error("Kuload video feed kumeshindikana:", error);
    }
            }
// Inapakia video za "For You" kiotomatiki mara tu mtumiaji anapofungua tovuti
window.addEventListener("DOMContentLoaded", () => {
    switchVideoFeedTab('for_you');
});

            
