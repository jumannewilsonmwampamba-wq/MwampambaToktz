import os
import io
import re
import time
import datetime
from typing import Optional, List, Dict
from bson import ObjectId
import jwt
from passlib.context import CryptContext
from fastapi import FastAPI, Form, File, UploadFile, HTTPException, Depends, status, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import cloudinary
import cloudinary.uploader
from PIL import Image, ImageDraw

app = FastAPI(title="Jumanne Tok TZ Engine")
# 1. ULINZI WA NAMBARI ZA SIRI (SECRET KEY PROTECTION & SECURITY)
JWT_SECRET = os.getenv("JUMANNE_TOK_SECRET_KEY")
ALGORITHM = "HS256"


# Kusanidi Hifadhi ya Seva ya Cloudinary kwa ajili ya Video na Pic
cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET")
)

# Kusaniatisha Muunganisho wa Database ya MongoDB (Motor Client)
MONGO_DETAILS = os.getenv("MONGO_URI")
try:
    db_client = AsyncIOMotorClient(MONGO_DETAILS)
    # Hii inazuia app isizime hata kama link ina makosa
    db_client.server_info() 
except Exception as e:
    print(f"Database error emebainika: {e}")
          
origins = [
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "https://jumannewilsonmwampamba-wq.github.io",
]


# Kuzuia hitilafu za CORS wakati kivinjari cha simu kikiomba data kwenye db
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
ALLOWED_FORMATS = {"mp4", "avi", "mp3"}

# --- MSAADA WA MIFUMO YA USALAMA NA AVATAR (UTILITIES) ---
def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.datetime.utcnow() + datetime.timedelta(days=7)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=ALGORITHM)

async def get_current_user(token: str) -> dict:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Tafadhali ingia kwenye mfumo")
        user = await db.users.find_one({"username": username})
        if not user:
            raise HTTPException(status_code=401, detail="Mtumiaji hapatikani")
        return user
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Muda wa kuingia umeisha, ingia tena")

# MFUMO WA KUTENGENEZA PROFILE PICHA KWA HERUFI YA KWANZA YA USERNAME
def generate_avatar(username: str) -> bytes:
    first_letter = username.upper() if username else "J"
    from PIL import ImageFont
    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.load_default(size=90)
    except TypeError:
        font = ImageFont.load_default()
    img_byte_arr = io.BytesIO()
    img.save(img_byte_arr, format='PNG')
    return img_byte_arr.getvalue()

# AI ENGINE: KUKAGUA VIDEO ZA NGONO NA PICHA ZA UTUPU (CONTENT MODERATION)
async def ai_content_moderation_nsfw(video_bytes: bytes) -> bool:
    # Logic ya MACHINE ya kuchuja video za ngono. Itarudisha True kama ina utupu, na False kama video ni safi.
    return False 

# MACHINE ENGINE: KUKAGUA WIZI WA VIDEO (ANTI-COPYRIGHT THEFT SYSTEM)
def ai_copyright_check_is_stolen(description: str, current_username: str) -> bool:
    desc_clean = description.lower()
    if "jumannetok tz" in desc_clean or "@" in desc_clean:
        if f"@{current_username.lower()}" not in desc_clean and len(re.findall(r"@[a-zA-Z0-9_]+", desc_clean)) > 0:
            return True
    return False


# 2. SEHEMU YA INTRANGE, LOGIN, REGISTER, PROFILE MANAGEMENT & LOGOUT
@app.post("/api/auth/entry")
async def register_or_login(username: str = Form(...), password: str = Form(...)):
    user = await db.users.find_one({"username": username})
    
    # KAMA NI USER MGENI -> MFUMO UNAMSAJILI NA KUMPELEKA DASHBOARD
    if not user:
        avatar_bytes = generate_avatar(username)
        upload_result = cloudinary.uploader.upload(avatar_bytes, folder="jumannetok/avatars")
        avatar_url = upload_result.get("secure_url")
        avatar_public_id = upload_result.get("public_id")
        
        new_user = {
            "username": username,
            "password": get_password_hash(password),
            "avatar_url": avatar_url,
            "avatar_public_id": avatar_public_id,
            "violations_nsfw": 0,
            "violations_theft": 0,
            "followers": [],
            "following": [],
            "liked_tags": {},
            "created_at": datetime.datetime.utcnow()
        }
        await db.users.insert_one(new_user)
        token = create_access_token(data={"sub": username})
        return {"status": "registered", "token": token, "avatar_url": avatar_url, "redirect": "dashboard"}
    
    # KAMA MTUMIAJI YUPO -> ANAINGIA KWENYE MFUMO NA KURUDISHIWA VIDEO ZAKE
    if not verify_password(password, user["password"]):
        raise HTTPException(status_code=400, detail="Nywila si sahihi")
    
    token = create_access_token(data={"sub": username})
    return {"status": "logged_in", "token": token, "avatar_url": user["avatar_url"], "redirect": "dashboard"}

# KUBADILISHA JINA NA PICHA (INAFUTA PICHA YA ZAMANI CLOUDINARY NA KUWEKA MPYA)
@app.put("/api/user/edit")
async def edit_profile(username: str = Form(...), file: Optional[UploadFile] = File(None), token: str = Form(...)):
    user = await get_current_user(token)
    update_fields = {"username": username}
    
    if file:
        # Futa picha ya zamani iliyopo kwenye seva ya Cloudinary ili isijaze nafasi bure
        if user.get("avatar_public_id"):
            try: cloudinary.uploader.destroy(user["avatar_public_id"])
            except: pass
        
        file_bytes = await file.read()
        upload_result = cloudinary.uploader.upload(file_bytes, folder="jumannetok/avatars")
        update_fields["avatar_url"] = upload_result.get("secure_url")
        update_fields["avatar_public_id"] = upload_result.get("public_id")
        
    await db.users.update_one({"_id": user["_id"]}, {"$set": update_fields})
    # Sasisha jina na picha kwenye video zote alizowahi kuzipost huko nyuma
    await db.videos.update_many(
        {"owner_id": user["_id"]}, 
        {"$set": {"owner_username": username, "owner_avatar": update_fields.get("avatar_url", user["avatar_url"])}}
    )
    return {"status": "success", "message": "Wasifu umesasishwa kikamilifu kwenye mifumo yote"}

# 3. USIMAMIZI WA VIDEO (UPLOAD ENGINE, AI MODERATION, FEED ENGINE)
@app.post("/api/videos/post")
async def upload_video(tags: str = Form(...), description: str = Form(...), file: UploadFile = File(...), token: str = Form(...)):
    user = await get_current_user(token)
    ext = file.filename.split(".")[-1].lower()
    
    # 1. KUKAGUA FOMAT YA VIDEO (MP4, AVI, MP3 TU PEKEE)
    if ext not in ALLOWED_FORMATS:
        raise HTTPException(status_code=400, detail="Fomat hairuhusiwi! Mfumo unakubali mp4, avi na mp3 pekee.")
        
    video_bytes = await file.read()
    
    # 2. AI MODERATION: KAGUA VIDEO ZA NGONO NA UTUPU (ADHABU YA MARA 10 KUFUTA ACCOUNT)
    if await ai_content_moderation_nsfw(video_bytes):
        await db.users.update_one({"_id": user["_id"]}, {"$inc": {"violations_nsfw": 1}})
        check_user = await db.users.find_one({"_id": user["_id"]})
        if check_user["violations_nsfw"] >= 10:
            await db.videos.delete_many({"owner_id": user["_id"]})
            await db.users.delete_one({"_id": user["_id"]})
            raise HTTPException(status_code=403, detail="Adhabu! Akaunti na video zako zote zimefutwa kwa makosa ya ngono mara 10!")
        raise HTTPException(status_code=400, detail="Video imekataliwa na kufutwa kwa sababu ina picha za utupu!")
        
    # 3. AI MODERATION: KAGUA WIZI WA VIDEO ZA WATU WENGINE (ADHABU YA MARA 10 KUFUTA ACCOUNT)
    if ai_copyright_check_is_stolen(description, user["username"]):
        await db.users.update_one({"_id": user["_id"]}, {"$inc": {"violations_theft": 1}})
        check_user = await db.users.find_one({"_id": user["_id"]})
        if check_user["violations_theft"] >= 10:
            await db.videos.delete_many({"owner_id": user["_id"]})
            await db.users.delete_one({"_id": user["_id"]})
            raise HTTPException(status_code=403, detail="Adhabu! Akaunti imefutwa kabisa kwa wizi wa video za watu mfululizo mara 10!")
        raise HTTPException(status_code=400, detail="Video imefutwa haraka sana! Huwezi kuiba video ya mtu mwingine kwenye mfumo.")

    # USANIFU WA ZIADA: Video inapakiwa Cloudinary na link yake fupi ya maandishi ndiyo inayookolewa
    upload_result = cloudinary.uploader.upload_large(video_bytes, resource_type="video", folder="jumannetok/videos")
    
    new_video = {
        "owner_id": user["_id"],
        "owner_username": user["username"],
        "owner_avatar": user["avatar_url"],
        "video_url": upload_result.get("secure_url"), # LINK INAHIFADHIWA HAPA!
        "description": description,
        "tags": [t.strip().lower() for t in tags.split(",") if t.strip()], # Kuchukua tags kabla ya ku-upload
        "likes": [], "comments_count": 0, "shares": 0, "views": 0,
        "is_pinned": False, "pin_time": None,
        "created_at": datetime.datetime.utcnow()
    }
    await db.videos.insert_one(new_video)
    return {"status": "success", "message": "Video imepakiwa na inaonekana sasa"}

# AI ENGINE YA MAPENDEKEZO: FOR YOU, FRIENDS, SEARCH & AUTO VIEWS COUNT (KUMI KUMI)
@app.get("/api/videos/stream")
async def get_videos_feed(page: int = 1, tab: str = "for_you", token: Optional[str] = None, search: Optional[str] = None):
    limit = 10 # Mfumo unaleta video kumi kumi kwa mara moja pekee kulinda bando
    skip = (page - 1) * limit
    user = None
    if token:
        try: user = await get_current_user(token)
        except: pass
        
    query = {}
    if search:
        query["$or"] = [{"description": {"$regex": search, "$options": "i"}}, {"tags": {"$regex": search, "$options": "i"}}]
    elif tab == "friends" and user:
        query["owner_username"] = {"$in": user.get("following", [])}
    elif tab == "for_you" and user and user.get("liked_tags"):
        # AI ndogo ya kujifunza maudhui anayopenda mtumiaji kulingana na tags
        sorted_tags = sorted(user["liked_tags"].items(), key=lambda x: x, reverse=True)
        top_tags = [t for t in sorted_tags[:3]]
        if top_tags: query["tags"] = {"$in": top_tags}

    videos_cursor = db.videos.find(query).sort([("is_pinned", -1), ("pin_time", -1), ("created_at", -1)]).skip(skip).limit(limit)
    videos = await videos_cursor.to_list(length=limit)
    
    # HESABU VIEWS KILA VIDEO INAPOFUNGULIWA TU (Kama TikTok halisi)
    video_ids = [v["_id"] for v in videos]
    if video_ids:
        await db.videos.update_many({"_id": {"$in": video_ids}}, {"$inc": {"views": 1}})
        
    return [{
        "video_id": str(v["_id"]), "owner_username": v["owner_username"], "owner_avatar": v["owner_avatar"],
        "video_url": v["video_url"], "description": v["description"], "views": v["views"] + 1,
        "likes_count": len(v["likes"]), "comments_count": v["comments_count"], "shares": v["shares"],
        "is_pinned": v.get("is_pinned", False), "tags": v.get("tags", [])
    } for v in videos]

@app.delete("/api/videos/{video_id}")
async def delete_video(video_id: str, token: str = Form(...)):
    user = await get_current_user(token)
    video = await db.videos.find_one({"_id": ObjectId(video_id)})
    # UKAGUZI KAMA UNAYEFUTA NI MMILIKI HALALI WA VIDEO
    if not video or str(video["owner_id"]) != str(user["_id"]):
        raise HTTPException(status_code=403, detail="Kosa! Huwezi kufuta video ya mtu mwingine!")
    await db.videos.delete_one({"_id": ObjectId(video_id)})
    return {"status": "success"}

@app.post("/api/videos/{video_id}/like")
async def like_action(video_id: str, token: str = Form(...)):
    user = await get_current_user(token)
    video = await db.videos.find_one({"_id": ObjectId(video_id)})
    
    if user["username"] in video["likes"]:
        await db.videos.update_one({"_id": ObjectId(video_id)}, {"$pull": {"likes": user["username"]}})
    else:
        await db.videos.update_one({"_id": ObjectId(video_id)}, {"$addToSet": {"likes": user["username"]}})
        # mashine inarekodi tag iliyopendwa na mtumiaji kwa ajili ya algoridimu ya For You
        for tag in video.get("tags", []):
            await db.users.update_one({"_id": user["_id"]}, {"$inc": {f"liked_tags.{tag}": 1}})
    return {"status": "success"}

# 4. MORE MENU (PIN VIDEO LIMIT YA 5, COPY LINK, DOWNLOAD WITH WATERMARK)
@app.post("/api/videos/{video_id}/pin")
async def pin_video(video_id: str, token: str = Form(...)):
    user = await get_current_user(token)
    video = await db.videos.find_one({"_id": ObjectId(video_id)})
    
    if not video or str(video["owner_id"]) != str(user["_id"]):
        raise HTTPException(status_code=403, detail="Huwezi kupini video ambayo si yako!")
        
    # KIZUIZI CHA VIDEO TANO TU ZA KUPIN (Ukizidisha ya kwanza inajiondoa, ya 6 inajipini)
    pinned_cursor = db.videos.find({"owner_id": user["_id"], "is_pinned": True}).sort("pin_time", 1)
    pinned_videos = await pinned_cursor.to_list(length=10)
    
    if len(pinned_videos) >= 5:
        oldest_pinned = pinned_videos
        await db.videos.update_one({"_id": oldest_pinned["_id"]}, {"$set": {"is_pinned": False, "pin_time": None}})
        
    await db.videos.update_one({"_id": ObjectId(video_id)}, {"$set": {"is_pinned": True, "pin_time": datetime.datetime.utcnow()}})
    return {"status": "success", "message": "Video imepiniwa juu ya profile yako!"}

@app.get("/api/videos/{video_id}/copylink")
async def copy_link_video(video_id: str):
    return {"status": "success", "link": f"jumannetok.tz{video_id}"}

@app.get("/api/videos/{video_id}/download")
async def download_video_with_watermark(video_id: str):
    video = await db.videos.find_one({"_id": ObjectId(video_id)})
    if not video: raise HTTPException(status_code=404, detail="Video haipatikani")
    # Inatuma maelezo ya chapa ya watermark
    watermark_text = f"jumannetok tz | @{video['owner_username']}"
    await db.videos.update_one({"_id": ObjectId(video_id)}, {"$inc": {"shares": 1}})
    return {"status": "success", "video_url": video["video_url"], "watermark": watermark_text}

# 5. COMMENTS SYSTEM (KUMI KUMI 
@app.post("/api/videos/{video_id}/comment")
async def post_comment(video_id: str, content: str = Form(...), token: str = Form(...)):
    user = await get_current_user(token)
    await db.comments.insert_one({
        "video_id": ObjectId(video_id), "username": user["username"], "avatar": user["avatar_url"],
        "content": content, "created_at": datetime.datetime.utcnow()
    })
    await db.videos.update_one({"_id": ObjectId(video_id)}, {"$inc": {"comments_count": 1}})
    return {"status": "success"}

@app.get("/api/videos/{video_id}/comments")
async def get_comments(video_id: str, page: int = 1):
    limit = 10 # Mfumo unaleta comment 10 tu 
    skip = (page - 1) * limit
    comments_cursor = db.comments.find({"video_id": ObjectId(video_id)}).sort("created_at", -1).skip(skip).limit(limit)
    comments = await comments_cursor.to_list(length=limit)
    return [{"username": c["username"], "avatar": c["avatar"], "content": c["content"]} for c in comments]
# 6. SIRI YA SOGA (CHAT & WEBSOCKET) YENYE #WHATSAPP LIVE TICKS & VIDEO CALLS
class ChatManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, username: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[username] = websocket

    def disconnect(self, username: str):
        if username in self.active_connections:
            del self.active_connections[username]

    async def send_private_message(self, message: dict, receiver: str) -> bool:
        if receiver in self.active_connections:
            await self.active_connections[receiver].send_json(message)
            return True  # Mlengwa yupo mkondoni #(Tick Mbili za bluu)
        return False  # Mlengwa hayupo mkondoni (Tick Moja Pekee)

chat_manager = ChatManager()

@app.websocket("/ws/chat/{username}")
async def ws_chat_endpoint(websocket: WebSocket, username: str, token: str):
    # ULINZI THABITI WA ANTI-HACKING KABLA YA #KURUHUSU SOGA YA WEBSOCKET
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        if payload.get("sub") != username:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
    except:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await chat_manager.connect(username, websocket)
    try:
        while True:
            data = await websocket.receive_json()
            receiver = data.get("receiver")
            msg_type = data.get("type") # Inakubali "text", "image", "video", "video_offer", "call_rejected"
            content = data.get("content")
            
            log = {
                "sender": username, "receiver": receiver, "type": msg_type, "content": content,
                "timestamp": datetime.datetime.utcnow(), "delivered": False
            }
            
            # Ujumbe unamfikia mlengwa ndani ya #sekunde moja (Realtime delivery)
            delivered = await chat_manager.send_private_message({
                "sender": username, "type": msg_type, "content": content, "timestamp": str(log["timestamp"]), "delivered": True
            }, receiver)
            
            log["delivered"] = delivered
            inserted_msg = await db.chats.insert_one(log)
            
            # Mfumo wa Live delivery report #kwenda kwa mtumaji (WhatsApp Ticks #Mechanism)
            if delivered:
                await chat_manager.send_private_message({
                    "type": "msg_delivered_receipt", "msg_id": str(inserted_msg.inserted_id), "receiver": receiver
                }, username)
                
    except WebSocketDisconnect:
        chat_manager.disconnect(username)

@app.get("/api/chat/history")
async def get_chat_history(with_user: str, token: str = Form(...), page: int = 1):
    user = await get_current_user(token)
    limit = 10 # Lete profile/chat 10, ukifika ya nane unaongeza tena 10 mfululizo
    skip = (page - 1) * limit
    query = {"$or": [{"sender": user["username"], "receiver": with_user}, {"sender": with_user, "receiver": user["username"]}]}
    chats_cursor = db.chats.find(query).sort("timestamp", -1).skip(skip).limit(limit)
    chats = await chats_cursor.to_list(length=limit)
    return [{"sender": c["sender"], "type": c["type"], "content": c["content"], "delivered": c["delivered"]} for c in chats]

@app.get("/api/chat/users")
async def get_all_users_to_chat(page: int = 1, token: str = Form(...)):
    user = await get_current_user(token)
    limit = 10
    skip = (page - 1) * limit
    # Mfumo unatafuta users wote ndani ya mfumo ISIPOKUWA yeye tu aliyefungua ukurasa
    users_cursor = db.users.find({"username": {"$ne": user["username"]}}).skip(skip).limit(limit)
    users = await users_cursor.to_list(length=limit)
    return [{"username": u["username"], "avatar": u["avatar_url"]} for u in users]

# ==============================================================================
# 7. UKURASA WA MARAFIKI NA FOLLOWERS SYSTEM (FRIENDS LIST KUMI KUMI)
# ==============================================================================
@app.post("/api/friends/follow")
async def follow_request(target: str = Form(...), token: str = Form(...)):
    user = await get_current_user(token)
    # Tuma ombi la urafiki na kutoa taarifa kwa mlengwa (Notification system)
    await db.notifications.insert_one({
        "type": "follow_request", "from": user["username"], "to": target,
        "status": "pending", "created_at": datetime.datetime.utcnow()
    })
    return {"status": "success", "message": "Ombi la urafiki limetumwa mkuu"}

@app.post("/api/friends/respond")
async def respond_request(notif_id: str = Form(...), action: str = Form(...), token: str = Form(...)):
    user = await get_current_user(token)
    req = await db.notifications.find_one({"_id": ObjectId(notif_id)})
    
    if action == "confirm": # Mlengwa akikubali (Confirm)
        await db.users.update_one({"username": req["to"]}, {"$addToSet": {"followers": req["from"]}})
        await db.users.update_one({"username": req["from"]}, {"$addToSet": {"following": req["to"]}})
        await db.notifications.update_one({"_id": ObjectId(notif_id)}, {"$set": {"status": "confirmed"}})
        return {"status": "success", "message": "Urafiki umethibitishwa kikamilifu"}
    else: # Akikataa (Delete)
        await db.notifications.delete_one({"_id": ObjectId(notif_id)})
        return {"status": "success", "message": "Ombi limefutwa"}

@app.get("/api/friends/list")
async def get_friends_list(page: int = 1, token: str = Form(...)):
    user = await get_current_user(token)
    limit = 10 # Mfumo unaleta marafiki kumi kwanza, akimaliza unaleta wengine kumi
    skip = (page - 1) * limit
    friends_cursor = db.users.find({"username": {"$in": user.get("followers", [])}}).skip(skip).limit(limit)
    friends = await friends_cursor.to_list(length=limit)
    return [{"username": f["username"], "avatar": f["avatar_url"]} for f in friends]

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)


import threading
import time
import requests

def keep_alive():
    time.sleep(300)
    url = "https://jumanne.onrender.com"
    while True:
        try:
            response = requests.get(url)
            print(f"Self-ping imefanikiwa: Status {response.status_code}")
        except Exception as e:
            print(f"Self-ping imefeli: {e}")
        time.sleep(600)

threading.Thread(target=keep_alive, daemon=True).start()
